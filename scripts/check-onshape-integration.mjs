import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { convertOnshapeExportToGlb } from "../src/lib/onshape/gltf.ts";
import { createOnshapeAuthorization } from "../src/lib/onshape/signature.ts";
import {
  normalizeOnshapeBaseUrl,
  parseOnshapeDocumentUrl,
} from "../src/lib/onshape/url.ts";

const parsed = parseOnshapeDocumentUrl(
  "https://cad.onshape.com/documents/e60c4803eaf2ac8be492c18e/w/d2558da712764516cc9fec62/e/6bed6b43463f6a46a37b4a22?renderMode=0#tab",
);
assert.deepEqual(parsed, {
  origin: "https://cad.onshape.com",
  documentId: "e60c4803eaf2ac8be492c18e",
  wvm: "w",
  wvmId: "d2558da712764516cc9fec62",
  elementId: "6bed6b43463f6a46a37b4a22",
  sourceUrl:
    "https://cad.onshape.com/documents/e60c4803eaf2ac8be492c18e/w/d2558da712764516cc9fec62/e/6bed6b43463f6a46a37b4a22",
});
assert.equal(normalizeOnshapeBaseUrl("https://coast.onshape.com/anything"), "https://coast.onshape.com");
assert.throws(
  () =>
    parseOnshapeDocumentUrl(
      "https://cad.onshape.com.evil.test/documents/e60c4803eaf2ac8be492c18e/w/d2558da712764516cc9fec62",
    ),
  /onshape\.com/,
);
assert.throws(() => normalizeOnshapeBaseUrl("http://cad.onshape.com"), /HTTPS/);

assert.equal(
  createOnshapeAuthorization({
    method: "GET",
    url: "https://cad.onshape.com/api/v10/documents/d/abc?b=2&a=1",
    nonce: "0123456789abcdef",
    date: "Mon, 24 Aug 2026 20:00:00 GMT",
    contentType: "application/json",
    accessKey: "ACCESS",
    secretKey: "SECRET",
  }),
  "On ACCESS:HmacSHA256:RMR+lfRBvdLdRKUSBIfJyt/BKWLfIi+h5sMXfCVByek=",
);

const gltf = {
  asset: { version: "2.0" },
  buffers: [
    { uri: "mesh-a.bin", byteLength: 3 },
    { uri: "nested/mesh-b.bin", byteLength: 4 },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 1, byteLength: 2 },
    { buffer: 1, byteOffset: 2, byteLength: 2 },
  ],
  images: [{ uri: "textures/hull.png" }],
};
const archive = zipSync({
  "export/model.gltf": new TextEncoder().encode(JSON.stringify(gltf)),
  "export/mesh-a.bin": Uint8Array.from([1, 2, 3]),
  "export/nested/mesh-b.bin": Uint8Array.from([4, 5, 6, 7]),
  "export/textures/hull.png": Uint8Array.from([137, 80, 78, 71]),
});
const glb = convertOnshapeExportToGlb(archive);
const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
assert.equal(view.getUint32(0, true), 0x46546c67);
assert.equal(view.getUint32(4, true), 2);
assert.equal(view.getUint32(8, true), glb.byteLength);
const jsonLength = view.getUint32(12, true);
const packed = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonLength)).trim());
assert.deepEqual(packed.buffers, [{ byteLength: 8 }]);
assert.equal(packed.bufferViews[0].byteOffset, 1);
assert.equal(packed.bufferViews[1].byteOffset, 6);
assert.match(packed.images[0].uri, /^data:image\/png;base64,/);
assert.deepEqual(convertOnshapeExportToGlb(glb), glb);

const remoteAsset = zipSync({
  "model.gltf": new TextEncoder().encode(
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "https://evil.test/mesh.bin", byteLength: 1 }],
    }),
  ),
});
assert.throws(() => convertOnshapeExportToGlb(remoteAsset), /External network assets/);

console.log("Onshape integration checks passed.");
