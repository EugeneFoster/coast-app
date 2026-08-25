export type OnshapeDocumentRef = {
  origin: string;
  documentId: string;
  wvm: "w" | "v" | "m";
  wvmId: string;
  elementId: string | null;
  sourceUrl: string;
};

const ONSHAPE_ID_RE = /^[0-9a-f]{24}$/i;

export function isOnshapeHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "onshape.com" || normalized.endsWith(".onshape.com");
}

export function normalizeOnshapeBaseUrl(value?: string) {
  const url = new URL(value?.trim() || "https://cad.onshape.com");
  if (url.protocol !== "https:" || !isOnshapeHostname(url.hostname)) {
    throw new Error("ONSHAPE_BASE_URL must be an HTTPS onshape.com address.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

export function parseOnshapeDocumentUrl(value: string): OnshapeDocumentRef {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a complete Onshape document URL.");
  }

  if (url.protocol !== "https:" || !isOnshapeHostname(url.hostname)) {
    throw new Error("The link must use an HTTPS onshape.com address.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "documents" || segments.length < 4) {
    throw new Error("Open an Onshape document and copy its browser URL.");
  }

  const documentId = segments[1] ?? "";
  const wvm = segments[2]?.toLowerCase();
  const wvmId = segments[3] ?? "";
  const elementId = segments[4] === "e" ? (segments[5] ?? null) : null;

  if (!ONSHAPE_ID_RE.test(documentId) || !ONSHAPE_ID_RE.test(wvmId)) {
    throw new Error("The Onshape document link contains an invalid ID.");
  }
  if (wvm !== "w" && wvm !== "v" && wvm !== "m") {
    throw new Error("The Onshape link must point to a workspace, version, or microversion.");
  }
  if (elementId && !ONSHAPE_ID_RE.test(elementId)) {
    throw new Error("The Onshape element ID is invalid.");
  }

  const canonicalPath = `/documents/${documentId}/${wvm}/${wvmId}${
    elementId ? `/e/${elementId}` : ""
  }`;

  return {
    origin: url.origin,
    documentId: documentId.toLowerCase(),
    wvm,
    wvmId: wvmId.toLowerCase(),
    elementId: elementId?.toLowerCase() ?? null,
    sourceUrl: `${url.origin}${canonicalPath}`,
  };
}

