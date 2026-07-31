import type { StructureType } from "@/lib/types";

export function resolveStructureType(
  name: string,
  explicit?: string | null,
): StructureType {
  const raw = (explicit ?? name.split("·")[0] ?? "").trim().toLowerCase();
  if (raw.includes("dock")) return "dock";
  if (raw.includes("wharf")) return "wharf";
  if (raw.includes("pontoon")) return "pontoon";
  if (raw.includes("ramp")) return "ramp";
  return "other";
}

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

function DockA() {
  return (
    <>
      <line x1="20" y1="46" x2="180" y2="46" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="50" x2="180" y2="50" stroke="currentColor" strokeWidth="1" />
      <line x1="40" y1="46" x2="40" y2="66" stroke="currentColor" strokeWidth="1" />
      <line x1="160" y1="46" x2="160" y2="66" stroke="currentColor" strokeWidth="1" />
      <line x1="100" y1="46" x2="100" y2="66" stroke="currentColor" strokeWidth="1" />
      <line x1="30" y1="62" x2="58" y2="50" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

function DockB() {
  return (
    <>
      <line x1="24" y1="48" x2="176" y2="48" stroke="currentColor" strokeWidth="1" />
      <line x1="24" y1="52" x2="176" y2="52" stroke="currentColor" strokeWidth="1" />
      <line x1="48" y1="48" x2="48" y2="68" stroke="currentColor" strokeWidth="1" />
      <line x1="96" y1="48" x2="96" y2="68" stroke="currentColor" strokeWidth="1" />
      <line x1="144" y1="48" x2="144" y2="68" stroke="currentColor" strokeWidth="1" />
      <rect x="70" y="54" width="60" height="8" fill="none" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

function WharfA() {
  return (
    <>
      <line x1="20" y1="44" x2="180" y2="44" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="48" x2="150" y2="48" stroke="currentColor" strokeWidth="1" />
      <line x1="150" y1="48" x2="180" y2="64" stroke="currentColor" strokeWidth="1" />
      <line x1="50" y1="48" x2="50" y2="68" stroke="currentColor" strokeWidth="1" />
      <line x1="110" y1="48" x2="110" y2="68" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

function WharfB() {
  return (
    <>
      <line x1="16" y1="42" x2="184" y2="42" stroke="currentColor" strokeWidth="1" />
      <line x1="16" y1="46" x2="140" y2="46" stroke="currentColor" strokeWidth="1" />
      <line x1="140" y1="46" x2="184" y2="66" stroke="currentColor" strokeWidth="1" />
      <line x1="60" y1="46" x2="60" y2="70" stroke="currentColor" strokeWidth="1" />
      <line x1="120" y1="46" x2="120" y2="70" stroke="currentColor" strokeWidth="1" />
      <line x1="160" y1="46" x2="160" y2="62" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

function PontoonA() {
  return (
    <>
      <line x1="20" y1="42" x2="180" y2="42" stroke="currentColor" strokeWidth="1" />
      <rect x="34" y="46" width="40" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="80" y="46" width="40" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="126" y="46" width="40" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

function PontoonB() {
  return (
    <>
      <line x1="24" y1="44" x2="176" y2="44" stroke="currentColor" strokeWidth="1" />
      <rect x="30" y="48" width="50" height="12" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="88" y="48" width="50" height="12" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="55" y1="48" x2="55" y2="60" stroke="currentColor" strokeWidth="0.5" />
      <line x1="113" y1="48" x2="113" y2="60" stroke="currentColor" strokeWidth="0.5" />
    </>
  );
}

function RampA() {
  return (
    <>
      <line x1="24" y1="40" x2="176" y2="64" stroke="currentColor" strokeWidth="1" />
      <line x1="24" y1="44" x2="176" y2="68" stroke="currentColor" strokeWidth="1" />
      <line x1="60" y1="49" x2="60" y2="62" stroke="currentColor" strokeWidth="0.6" />
      <line x1="120" y1="57" x2="120" y2="70" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

function RampB() {
  return (
    <>
      <line x1="28" y1="38" x2="172" y2="62" stroke="currentColor" strokeWidth="1" />
      <line x1="28" y1="42" x2="172" y2="66" stroke="currentColor" strokeWidth="1" />
      <line x1="80" y1="48" x2="80" y2="58" stroke="currentColor" strokeWidth="0.6" />
      <line x1="130" y1="55" x2="130" y2="65" stroke="currentColor" strokeWidth="0.6" />
      <line x1="28" y1="38" x2="40" y2="38" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

function PierA() {
  return (
    <>
      <line x1="10" y1="50" x2="190" y2="50" stroke="currentColor" strokeWidth="1" />
      <line x1="30" y1="50" x2="30" y2="72" stroke="currentColor" strokeWidth="1" />
      <line x1="70" y1="50" x2="70" y2="72" stroke="currentColor" strokeWidth="1" />
      <line x1="110" y1="50" x2="110" y2="72" stroke="currentColor" strokeWidth="1" />
      <line x1="150" y1="50" x2="150" y2="72" stroke="currentColor" strokeWidth="1" />
      <line x1="170" y1="50" x2="170" y2="68" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

function PierB() {
  return (
    <>
      <line x1="14" y1="48" x2="186" y2="48" stroke="currentColor" strokeWidth="1" />
      <line x1="14" y1="52" x2="120" y2="52" stroke="currentColor" strokeWidth="1" />
      <line x1="120" y1="52" x2="186" y2="68" stroke="currentColor" strokeWidth="1" />
      <line x1="40" y1="48" x2="40" y2="70" stroke="currentColor" strokeWidth="1" />
      <line x1="90" y1="48" x2="90" y2="70" stroke="currentColor" strokeWidth="1" />
      <line x1="150" y1="52" x2="150" y2="70" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

function GenericA() {
  return (
    <>
      <rect x="40" y="40" width="120" height="28" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="40" y1="40" x2="60" y2="26" stroke="currentColor" strokeWidth="1" />
      <line x1="160" y1="40" x2="140" y2="26" stroke="currentColor" strokeWidth="1" />
      <line x1="60" y1="26" x2="140" y2="26" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

function GenericB() {
  return (
    <>
      <rect x="50" y="38" width="100" height="32" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="50" y1="54" x2="150" y2="54" stroke="currentColor" strokeWidth="0.6" />
      <line x1="100" y1="38" x2="100" y2="70" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

type DrawingFn = () => React.ReactElement;

const variantsByType: Record<StructureType, DrawingFn[]> = {
  dock: [DockA, DockB],
  wharf: [WharfA, WharfB],
  pontoon: [PontoonA, PontoonB],
  ramp: [RampA, RampB],
  other: [PierA, PierB, GenericA, GenericB],
};

function pickDrawingIndex(projectId: string, structureType: StructureType): number {
  const variants = variantsByType[structureType];
  return hashSeed(projectId) % variants.length;
}

function renderDrawing(type: StructureType, index: number) {
  const Drawing = variantsByType[type][index];
  return <Drawing />;
}

export function StructureThumbnail({
  projectId,
  name,
  structureType,
}: {
  projectId: string;
  name: string;
  structureType?: string | null;
}) {
  const type = resolveStructureType(name, structureType);
  const drawingIndex = pickDrawingIndex(projectId, type);

  return (
    <div className="relative flex h-32 items-center justify-center overflow-hidden border-b border-rule bg-paper p-4">
      <svg
        viewBox="0 0 200 90"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full text-ink/45"
        aria-hidden
      >
        <line
          x1="10"
          y1="78"
          x2="190"
          y2="78"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray="2 3"
        />
        {renderDrawing(type, drawingIndex)}
      </svg>
    </div>
  );
}
