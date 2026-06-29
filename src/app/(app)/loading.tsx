export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-graph">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-rule border-t-weld" />
        <span className="font-mono text-xs uppercase tracking-wide">
          Loading…
        </span>
      </div>
    </div>
  );
}
