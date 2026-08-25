import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProjects, isUserRole } from "@/lib/employee-roles";
import {
  exportOnshapeElement,
  listOnshapeElements,
  OnshapeIntegrationError,
  type OnshapeResolution,
} from "@/lib/onshape/client";
import { parseOnshapeDocumentUrl } from "@/lib/onshape/url";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONSHAPE_ID_RE = /^[0-9a-f]{24}$/i;
const RESOLUTIONS = new Set<OnshapeResolution>([
  "COARSE",
  "MEDIUM",
  "FINE",
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const expectedProtocol = forwardedProto ? `${forwardedProto}:` : requestUrl.protocol;
    const originUrl = new URL(origin);
    return originUrl.host === expectedHost && originUrl.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!sameOrigin(request)) return jsonError("Forbidden", 403);
  const { projectId } = await params;
  if (!UUID_RE.test(projectId)) return jsonError("Invalid project reference.", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Your session has expired. Please sign in again.", 401);

  const admin = createAdminClient();
  const [{ data: profile }, { data: project }] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin.from("projects").select("id").eq("id", projectId).maybeSingle(),
  ]);
  if (!profile || profile.status !== "active" || !isUserRole(profile.role)) {
    return jsonError("Your employee account is not active.", 403);
  }
  if (!canManageProjects(profile.role)) {
    return jsonError("Only project managers and CAD designers can import 3D models.", 403);
  }
  if (!project) return jsonError("Project not found.", 404);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return jsonError("Request is too large.", 413);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const operation = body.operation;
  if (operation === "set-primary") {
    const modelId = typeof body.modelId === "string" ? body.modelId : "";
    if (!UUID_RE.test(modelId)) return jsonError("Invalid model reference.", 400);
    const { error } = await supabase.rpc("set_primary_project_model", {
      p_project_id: projectId,
      p_model_id: modelId,
    });
    if (error) return jsonError("The selected model could not be made primary.", 400);
    return NextResponse.json({ ok: true });
  }

  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  if (!sourceUrl || sourceUrl.length > 2000) {
    return jsonError("Paste a valid Onshape document URL.", 400);
  }

  try {
    const ref = parseOnshapeDocumentUrl(sourceUrl);
    const elements = await listOnshapeElements(ref);
    if (operation === "inspect") {
      if (elements.length === 0) {
        return jsonError("This document has no Part Studio or Assembly tabs to import.", 422);
      }
      return NextResponse.json({
        source: ref,
        elements,
        selectedElementId:
          ref.elementId && elements.some((element) => element.id === ref.elementId)
            ? ref.elementId
            : elements[0].id,
      });
    }

    if (operation !== "import") return jsonError("Unsupported operation.", 400);
    const elementId = typeof body.elementId === "string" ? body.elementId.toLowerCase() : "";
    const resolution = typeof body.resolution === "string" ? body.resolution : "";
    if (!ONSHAPE_ID_RE.test(elementId)) return jsonError("Select an Onshape model tab.", 400);
    if (!RESOLUTIONS.has(resolution as OnshapeResolution)) {
      return jsonError("Select a valid model quality.", 400);
    }
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element) return jsonError("That tab is not an importable Part Studio or Assembly.", 404);

    const requestedName = typeof body.name === "string" ? body.name.trim() : "";
    const modelName = (requestedName || element.name).slice(0, 160);
    if (!modelName) return jsonError("Model name is required.", 400);

    const exported = await exportOnshapeElement({
      ref,
      element,
      resolution: resolution as OnshapeResolution,
    });
    const storagePath = `${projectId}/onshape/${Date.now()}-${randomUUID()}.glb`;
    const { error: uploadError } = await admin.storage
      .from("project-models")
      .upload(storagePath, exported.glb, {
        contentType: "model/gltf-binary",
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      console.error("[onshape-import] storage", uploadError.message);
      return jsonError("The exported model could not be saved.", 500);
    }

    const canonicalElementUrl = `${ref.origin}/documents/${ref.documentId}/${ref.wvm}/${ref.wvmId}/e/${element.id}`;
    const { data: modelId, error: registerError } = await admin.rpc("register_project_model", {
      p_project_id: projectId,
      p_name: modelName,
      p_storage_path: storagePath,
      p_source: "onshape",
      p_file_size_bytes: exported.glb.byteLength,
      p_onshape_document_id: ref.documentId,
      p_onshape_wvm: ref.wvm,
      p_onshape_wvm_id: ref.wvmId,
      p_onshape_element_id: element.id,
      p_onshape_element_type: element.elementType,
      p_onshape_source_url: canonicalElementUrl,
      p_onshape_translation_id: exported.translationId,
      p_onshape_resolution: resolution,
      p_imported_by: user.id,
    });
    if (registerError || !modelId) {
      await admin.storage.from("project-models").remove([storagePath]);
      console.error("[onshape-import] register", registerError?.message ?? "missing model id");
      return jsonError("The model was exported but could not be attached to the project.", 500);
    }

    return NextResponse.json({ ok: true, modelId, name: modelName });
  } catch (caught) {
    if (caught instanceof OnshapeIntegrationError) {
      return jsonError(caught.message, caught.status);
    }
    const message = caught instanceof Error ? caught.message : "Onshape import failed.";
    if (
      message.startsWith("Paste ") ||
      message.startsWith("The Onshape") ||
      message.startsWith("Open an Onshape") ||
      message.startsWith("Only glTF") ||
      message.startsWith("External network")
    ) {
      return jsonError(message, 400);
    }
    console.error("[onshape-import]", caught);
    return jsonError("Onshape import failed. Try again or check the server logs.", 500);
  }
}
