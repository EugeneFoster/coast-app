"use client";

export function SheetProcessingPlaceholder({
  failed,
  processing,
}: {
  failed?: boolean;
  processing?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rule py-20 text-center">
      {failed ? (
        <>
          <p className="font-display text-lg text-weld">Sheet processing failed</p>
          <p className="mt-2 max-w-md text-sm text-graph">
            Deep zoom tiles could not be generated. Re-upload the drawing or use
            Retry from the drawings list once the tiling worker is running.
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-lg text-ink">Preparing sheets…</p>
          <p className="mt-2 max-w-md text-sm text-graph">
            The drawing is being tiled for the deep-zoom viewer. Markup tools
            will be available once processing completes
            {processing ? " — this view updates automatically." : "."}
          </p>
        </>
      )}
    </div>
  );
}
