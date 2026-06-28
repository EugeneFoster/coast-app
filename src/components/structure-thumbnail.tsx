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

function Dock() {
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

function Wharf() {
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

function Pontoon() {
  return (
    <>
      <line x1="20" y1="42" x2="180" y2="42" stroke="currentColor" strokeWidth="1" />
      <rect x="34" y="46" width="40" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="80" y="46" width="40" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="126" y="46" width="40" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

function Ramp() {
  return (
    <>
      <line x1="24" y1="40" x2="176" y2="64" stroke="currentColor" strokeWidth="1" />
      <line x1="24" y1="44" x2="176" y2="68" stroke="currentColor" strokeWidth="1" />
      <line x1="60" y1="49" x2="60" y2="62" stroke="currentColor" strokeWidth="0.6" />
      <line x1="120" y1="57" x2="120" y2="70" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

function Generic() {
  return (
    <>
      <rect x="40" y="40" width="120" height="28" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="40" y1="40" x2="60" y2="26" stroke="currentColor" strokeWidth="1" />
      <line x1="160" y1="40" x2="140" y2="26" stroke="currentColor" strokeWidth="1" />
      <line x1="60" y1="26" x2="140" y2="26" stroke="currentColor" strokeWidth="1" />
    </>
  );
}

const drawings: Record<StructureType, () => React.ReactElement> = {
  dock: Dock,
  wharf: Wharf,
  pontoon: Pontoon,
  ramp: Ramp,
  other: Generic,
};

export function StructureThumbnail({
  name,
  structureType,
}: {
  name: string;
  structureType?: string | null;
}) {
  const type = resolveStructureType(name, structureType);
  const Drawing = drawings[type];

  return (
    <div className="relative flex h-32 items-center justify-center overflow-hidden border-b border-rule bg-ink/[0.03] dark:bg-paper/[0.04]">
      <svg
        viewBox="0 0 200 90"
        className="h-full w-full text-ink/40 dark:text-bone/40"
        aria-hidden
      >
        <line x1="10" y1="78" x2="190" y2="78" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 3" />
        <Drawing />
      </svg>
    </div>
  );
}
