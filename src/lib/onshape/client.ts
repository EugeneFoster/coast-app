import "server-only";

import { randomBytes } from "node:crypto";
import { convertOnshapeExportToGlb } from "@/lib/onshape/gltf";
import { createOnshapeAuthorization } from "@/lib/onshape/signature";
import {
  normalizeOnshapeBaseUrl,
  type OnshapeDocumentRef,
} from "@/lib/onshape/url";

const JSON_CONTENT_TYPE = "application/json;charset=UTF-8; qs=0.09";
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_GLB_BYTES = 80 * 1024 * 1024;
const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 12000, 15000, 15000, 15000, 15000];

export type OnshapeElement = {
  id: string;
  name: string;
  elementType: "PARTSTUDIO" | "ASSEMBLY";
};

export type OnshapeResolution = "COARSE" | "MEDIUM" | "FINE";

type OnshapeConfig = {
  baseUrl: string;
  accessKey: string;
  secretKey: string;
};

type Translation = {
  id?: string;
  requestState?: string;
  failureReason?: string | null;
  resultExternalDataIds?: string[] | null;
};

export class OnshapeIntegrationError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "OnshapeIntegrationError";
  }
}

function getConfig(): OnshapeConfig {
  const accessKey = process.env.ONSHAPE_ACCESS_KEY?.trim();
  const secretKey = process.env.ONSHAPE_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) {
    throw new OnshapeIntegrationError(
      "Onshape is not configured yet. Add the Onshape API keys in Railway.",
      503,
    );
  }
  return {
    baseUrl: normalizeOnshapeBaseUrl(process.env.ONSHAPE_BASE_URL),
    accessKey,
    secretKey,
  };
}

export function isOnshapeConfigured() {
  if (!process.env.ONSHAPE_ACCESS_KEY?.trim() || !process.env.ONSHAPE_SECRET_KEY?.trim()) {
    return false;
  }
  try {
    normalizeOnshapeBaseUrl(process.env.ONSHAPE_BASE_URL);
    return true;
  } catch {
    return false;
  }
}

function assertMatchingStack(ref: OnshapeDocumentRef, baseUrl: string) {
  if (ref.origin !== baseUrl) {
    throw new OnshapeIntegrationError(
      `This link uses ${ref.origin}, but the COAST Onshape connection is configured for ${baseUrl}.`,
      400,
    );
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLimited(response: Response, limit: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new OnshapeIntegrationError("The Onshape export is larger than 100 MB.", 413);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function errorMessage(status: number, body: string) {
  if (status === 401) return "Onshape rejected the API key. Check the Railway secrets.";
  if (status === 403) {
    return "The connected Onshape account cannot access this document or export models.";
  }
  if (status === 404) return "The Onshape document or element was not found.";
  try {
    const parsed = JSON.parse(body) as { message?: string; moreInfoUrl?: string };
    if (parsed.message) return `Onshape: ${parsed.message}`;
  } catch {
    // Use the generic status below.
  }
  return `Onshape request failed (${status}).`;
}

async function signedFetch(
  path: string,
  init: { method?: "GET" | "POST"; body?: string; accept?: string; timeoutMs?: number } = {},
) {
  const config = getConfig();
  const method = init.method ?? "GET";
  let url = new URL(path, config.baseUrl);
  if (url.origin !== config.baseUrl) {
    throw new OnshapeIntegrationError("Blocked an unsafe Onshape request URL.", 400);
  }

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const nonce = randomBytes(18).toString("hex");
    const date = new Date().toUTCString();
    const authorization = createOnshapeAuthorization({
      method,
      url: url.toString(),
      nonce,
      date,
      contentType: JSON_CONTENT_TYPE,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    const response = await fetch(url, {
      method,
      body: init.body,
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
      headers: {
        Accept: init.accept ?? JSON_CONTENT_TYPE,
        Authorization: authorization,
        "Content-Type": JSON_CONTENT_TYPE,
        Date: date,
        "On-Nonce": nonce,
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) {
        throw new OnshapeIntegrationError("Onshape returned an invalid redirect.");
      }
      const redirected = new URL(location, url);
      if (redirected.protocol !== "https:" || redirected.origin !== config.baseUrl) {
        throw new OnshapeIntegrationError("Onshape redirected to an untrusted download host.");
      }
      url = redirected;
      continue;
    }

    if (!response.ok) {
      const body = (await response.text()).slice(0, 4000);
      throw new OnshapeIntegrationError(errorMessage(response.status, body), response.status);
    }
    return response;
  }
  throw new OnshapeIntegrationError("Onshape redirected too many times.");
}

async function getJson<T>(path: string, init?: { method?: "GET" | "POST"; body?: string }) {
  const response = await signedFetch(path, init);
  return (await response.json()) as T;
}

export async function listOnshapeElements(ref: OnshapeDocumentRef) {
  const config = getConfig();
  assertMatchingStack(ref, config.baseUrl);
  const elements = await getJson<Array<{ id?: string; name?: string; elementType?: string }>>(
    `/api/v10/documents/d/${ref.documentId}/${ref.wvm}/${ref.wvmId}/elements`,
  );
  return elements.flatMap((element): OnshapeElement[] => {
    if (
      !element.id ||
      !/^[0-9a-f]{24}$/i.test(element.id) ||
      (element.elementType !== "PARTSTUDIO" && element.elementType !== "ASSEMBLY")
    ) {
      return [];
    }
    return [
      {
        id: element.id.toLowerCase(),
        name: element.name?.trim().slice(0, 160) || "Untitled model",
        elementType: element.elementType,
      },
    ];
  });
}

async function waitForTranslation(translationId: string) {
  let translation: Translation | null = null;
  for (const waitMs of POLL_DELAYS_MS) {
    await delay(waitMs);
    translation = await getJson<Translation>(`/api/v11/translations/${translationId}`);
    if (translation.requestState === "DONE") return translation;
    if (translation.requestState === "FAILED") {
      throw new OnshapeIntegrationError(
        translation.failureReason
          ? `Onshape could not export this model: ${translation.failureReason}`
          : "Onshape could not export this model.",
      );
    }
  }
  throw new OnshapeIntegrationError(
    "The Onshape export is still processing. Try importing it again in a minute.",
    504,
  );
}

export async function exportOnshapeElement({
  ref,
  element,
  resolution,
}: {
  ref: OnshapeDocumentRef;
  element: OnshapeElement;
  resolution: OnshapeResolution;
}) {
  const config = getConfig();
  assertMatchingStack(ref, config.baseUrl);
  if (ref.wvm === "m") {
    throw new OnshapeIntegrationError(
      "Onshape exports require a workspace or version link, not a microversion link.",
      400,
    );
  }
  const resource = element.elementType === "ASSEMBLY" ? "assemblies" : "partstudios";
  const body = JSON.stringify({
    meshParams: { resolution, unit: "METER" },
    storeInDocument: false,
  });
  const started = await getJson<Translation>(
    `/api/v11/${resource}/d/${ref.documentId}/${ref.wvm}/${ref.wvmId}/e/${element.id}/export/gltf`,
    { method: "POST", body },
  );
  if (!started.id || !/^[0-9a-f]{24}$/i.test(started.id)) {
    throw new OnshapeIntegrationError("Onshape did not return a translation ID.");
  }

  const completed =
    started.requestState === "DONE" ? started : await waitForTranslation(started.id);
  const externalId = completed.resultExternalDataIds?.[0];
  if (!externalId || !/^[0-9a-f]{24}$/i.test(externalId)) {
    throw new OnshapeIntegrationError("Onshape finished the export without a downloadable file.");
  }

  const response = await signedFetch(
    `/api/v6/documents/d/${ref.documentId}/externaldata/${externalId}`,
    { accept: "application/octet-stream", timeoutMs: 120_000 },
  );
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new OnshapeIntegrationError("The Onshape export is larger than 100 MB.", 413);
  }
  const download = await readLimited(response, MAX_DOWNLOAD_BYTES);
  if (download.byteLength === 0 || download.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new OnshapeIntegrationError("The Onshape export is empty or larger than 100 MB.", 413);
  }

  const glb = convertOnshapeExportToGlb(download);
  if (glb.byteLength === 0 || glb.byteLength > MAX_GLB_BYTES) {
    throw new OnshapeIntegrationError("The finished 3D model is larger than the 80 MB project limit.", 413);
  }
  return { glb, translationId: started.id };
}
