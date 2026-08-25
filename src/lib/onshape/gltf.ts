import { unzipSync } from "fflate";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;

type GltfDocument = {
  asset?: { version?: string };
  buffers?: Array<{ byteLength?: number; uri?: string }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
  images?: Array<{ uri?: string; mimeType?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

function align4(value: number) {
  return (value + 3) & ~3;
}

function assertSafeZipSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("The Onshape ZIP export is incomplete.");
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("The Onshape ZIP directory is invalid.");
    }
    const unpackedSize = view.getUint32(offset + 24, true);
    if (unpackedSize === 0xffffffff) {
      throw new Error("ZIP64 Onshape exports are not supported.");
    }
    total += unpackedSize;
    if (total > MAX_UNPACKED_BYTES) {
      throw new Error("The expanded Onshape model is larger than 200 MB.");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function normalizeArchivePath(path: string) {
  const parts: string[] = [];
  for (const part of decodeURIComponent(path).replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function resolveAsset(
  files: Map<string, Uint8Array>,
  gltfPath: string,
  uri: string,
) {
  const relative = normalizeArchivePath(`${dirname(gltfPath)}/${uri}`);
  const exact = files.get(relative) ?? files.get(normalizeArchivePath(uri));
  if (exact) return exact;

  const basename = normalizeArchivePath(uri).split("/").at(-1);
  const matches = [...files.entries()].filter(([name]) => name.split("/").at(-1) === basename);
  return matches.length === 1 ? matches[0][1] : null;
}

function decodeDataUri(uri: string) {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
  if (!match) throw new Error("The glTF contains an invalid data URI.");
  const value = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return new Uint8Array(value);
}

function mimeForPath(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "ktx2") return "image/ktx2";
  return "application/octet-stream";
}

function validateGlb(bytes: Uint8Array) {
  if (bytes.byteLength < 12) throw new Error("The exported GLB is incomplete.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error("Onshape returned an invalid GLB file.");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error("The exported GLB length is invalid.");
  }
}

function packGlb(gltf: GltfDocument, binary: Uint8Array) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = align4(jsonBytes.byteLength);
  const binLength = align4(binary.byteLength);
  const totalLength = 12 + 8 + jsonLength + (binLength > 0 ? 8 + binLength : 0);
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(jsonBytes, 20);

  if (binLength > 0) {
    const binHeader = 20 + jsonLength;
    view.setUint32(binHeader, binLength, true);
    view.setUint32(binHeader + 4, BIN_CHUNK, true);
    output.set(binary, binHeader + 8);
  }
  return output;
}

function gltfToGlb(
  gltfBytes: Uint8Array,
  gltfPath: string,
  files: Map<string, Uint8Array>,
) {
  let gltf: GltfDocument;
  try {
    gltf = JSON.parse(new TextDecoder().decode(gltfBytes)) as GltfDocument;
  } catch {
    throw new Error("Onshape returned glTF JSON that could not be read.");
  }
  if (gltf.asset?.version !== "2.0") {
    throw new Error("Only glTF 2.0 exports are supported.");
  }

  const sourceBuffers = gltf.buffers ?? [];
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let binaryLength = 0;

  for (const buffer of sourceBuffers) {
    const uri = buffer.uri;
    if (!uri) throw new Error("The glTF contains an unsupported embedded GLB buffer.");
    if (/^(https?:)?\/\//i.test(uri)) {
      throw new Error("External network assets are not allowed in imported models.");
    }
    const bytes = uri.startsWith("data:")
      ? decodeDataUri(uri)
      : resolveAsset(files, gltfPath, uri);
    if (!bytes) throw new Error(`The glTF asset “${uri}” is missing from the export.`);
    if (buffer.byteLength && bytes.byteLength < buffer.byteLength) {
      throw new Error(`The glTF buffer “${uri}” is incomplete.`);
    }
    binaryLength = align4(binaryLength);
    offsets.push(binaryLength);
    chunks.push(bytes);
    binaryLength += bytes.byteLength;
  }

  const binary = new Uint8Array(align4(binaryLength));
  chunks.forEach((chunk, index) => binary.set(chunk, offsets[index]));
  for (const view of gltf.bufferViews ?? []) {
    if (!Number.isInteger(view.buffer) || !offsets[view.buffer]) {
      if (view.buffer !== 0 || offsets[0] === undefined) {
        throw new Error("The glTF references an invalid binary buffer.");
      }
    }
    view.byteOffset = (view.byteOffset ?? 0) + offsets[view.buffer];
    view.buffer = 0;
  }
  gltf.buffers = binary.byteLength > 0 ? [{ byteLength: binary.byteLength }] : [];

  for (const image of gltf.images ?? []) {
    if (!image.uri || image.uri.startsWith("data:")) continue;
    if (/^(https?:)?\/\//i.test(image.uri)) {
      throw new Error("External network images are not allowed in imported models.");
    }
    const imageBytes = resolveAsset(files, gltfPath, image.uri);
    if (!imageBytes) throw new Error(`The glTF image “${image.uri}” is missing from the export.`);
    image.uri = `data:${image.mimeType || mimeForPath(image.uri)};base64,${Buffer.from(imageBytes).toString("base64")}`;
  }

  return packGlb(gltf, binary);
}

export function convertOnshapeExportToGlb(download: Uint8Array) {
  if (download.byteLength >= 4) {
    const view = new DataView(download.buffer, download.byteOffset, download.byteLength);
    if (view.getUint32(0, true) === GLB_MAGIC) {
      validateGlb(download);
      return download;
    }
  }

  if (download[0] === 0x50 && download[1] === 0x4b) {
    assertSafeZipSize(download);
    const unpacked = unzipSync(download);
    const entries = Object.entries(unpacked).filter(([name]) => !name.endsWith("/"));
    const unpackedBytes = entries.reduce((total, [, bytes]) => total + bytes.byteLength, 0);
    if (unpackedBytes > MAX_UNPACKED_BYTES) {
      throw new Error("The expanded Onshape model is larger than 200 MB.");
    }
    const files = new Map(entries.map(([name, bytes]) => [normalizeArchivePath(name), bytes]));
    const glb = entries.find(([name]) => name.toLowerCase().endsWith(".glb"));
    if (glb) {
      validateGlb(glb[1]);
      return glb[1];
    }
    const gltfEntries = entries
      .filter(([name]) => name.toLowerCase().endsWith(".gltf"))
      .sort(([a], [b]) => a.length - b.length);
    if (gltfEntries.length === 0) {
      throw new Error("The Onshape export does not contain a glTF or GLB model.");
    }
    return gltfToGlb(gltfEntries[0][1], normalizeArchivePath(gltfEntries[0][0]), files);
  }

  const files = new Map<string, Uint8Array>();
  return gltfToGlb(download, "model.gltf", files);
}
