/** Three stacked rule lines — brand divider motif on solid bone */
export function HairlineMotif({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-2 bg-bone ${className}`}
      aria-hidden
    >
      <div className="h-px shrink-0 bg-rule" />
      <div className="h-px shrink-0 bg-rule" />
      <div className="h-px shrink-0 bg-rule" />
    </div>
  );
}
