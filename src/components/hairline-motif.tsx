/** Three stacked rule lines — brand divider motif on solid bone (masks blueprint grid) */
export function HairlineMotif({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-bone ${className}`} aria-hidden>
      <div className="h-px bg-rule" />
      <div className="mt-1 h-px bg-rule" />
      <div className="mt-1 h-px bg-rule" />
    </div>
  );
}
