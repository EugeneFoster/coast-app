// Manual end-to-end test:
//   node src/run-once.js <drawingId> <version> <pdfStorageKey>
import { processDrawing } from "./process.js";

const [drawingId, version, pdfStorageKey] = process.argv.slice(2);
if (!drawingId || !version || !pdfStorageKey) {
  console.error(
    "Usage: node src/run-once.js <drawingId> <version> <pdfStorageKey>",
  );
  process.exit(1);
}

processDrawing({ drawingId, version: Number(version), pdfStorageKey })
  .then((r) => {
    console.log("done", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
