/** Three stacked rule lines — brand divider motif */
export function HairlineMotif({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="h-px bg-rule" />
      <div className="mt-1 h-px bg-rule" />
      <div className="mt-1 h-px bg-rule" />
    </div>
  );
}
