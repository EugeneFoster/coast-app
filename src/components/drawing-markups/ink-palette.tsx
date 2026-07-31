"use client";

import {
  INK_COLORS,
  INK_WIDTHS,
  type InkWidth,
} from "@/lib/ink-palette";

export function InkPalette({
  color,
  width,
  onColor,
  onWidth,
}: {
  color: string;
  width: InkWidth;
  onColor: (c: string) => void;
  onWidth: (w: InkWidth) => void;
}) {
  return (
    <div className="absolute left-4 top-4 z-10 rounded-xl border border-rule bg-paper p-2 shadow-md">
      <div className="flex gap-1">
        {INK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Ink colour ${c}`}
            onClick={() => onColor(c)}
            className={`h-6 w-6 rounded-full border-2 ${
              color === c ? "border-ink" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        {INK_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onWidth(w)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
              width === w ? "border-ink bg-bone" : "border-rule"
            }`}
            aria-label={`Stroke width ${w}`}
          >
            <span
              className="block rounded-full bg-ink"
              style={{ width: w + 2, height: w + 2 }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
