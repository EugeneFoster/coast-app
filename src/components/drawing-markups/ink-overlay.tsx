"use client";

import type { MarkupWithThread } from "@/lib/types";
import {
  imageStrokeToScreenPx,
  normPathToSvgPoints,
  type NormPoint,
} from "@/lib/markup-coords";
import { MARKUP_STATUS } from "@/lib/markup-status";

export function InkOverlay({
  markups,
  selectedId,
  pageWidth,
  pageHeight,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  osd,
  draftPath,
  draftColor,
  draftWidth,
  draftOpacity,
  onSelect,
}: {
  markups: MarkupWithThread[];
  selectedId: string | null;
  pageWidth: number;
  pageHeight: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  osd: any;
  draftPath?: NormPoint[] | null;
  draftColor?: string;
  draftWidth?: number;
  draftOpacity?: number;
  onSelect: (id: string) => void;
}) {
  if (!viewer || !osd) return null;

  const inkMarkups = markups.filter((m) => m.kind === "ink");

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {inkMarkups.map((m) => {
        const path = (m.path as NormPoint[] | null) ?? [];
        if (path.length < 2) return null;
        const points = normPathToSvgPoints(path, viewer, osd, pageWidth, pageHeight);
        const strokePx = imageStrokeToScreenPx(m.stroke_width ?? pageWidth * 0.002, viewer, osd);
        const selected = selectedId === m.id;
        const status = MARKUP_STATUS[m.status];

        return (
          <g key={m.id}>
            {selected && (
              <polyline
                points={points}
                fill="none"
                stroke={status.border}
                strokeWidth={strokePx + 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.5}
              />
            )}
            <polyline
              points={points}
              fill="none"
              stroke={m.color ?? "#000"}
              strokeWidth={strokePx}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={m.opacity ?? 1}
              className="pointer-events-auto cursor-pointer"
              onClick={() => onSelect(m.id)}
            />
          </g>
        );
      })}
      {draftPath && draftPath.length >= 2 && (
        <polyline
          points={normPathToSvgPoints(draftPath, viewer, osd, pageWidth, pageHeight)}
          fill="none"
          stroke={draftColor ?? "#000"}
          strokeWidth={imageStrokeToScreenPx(draftWidth ?? pageWidth * 0.002, viewer, osd)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={draftOpacity ?? 1}
        />
      )}
    </svg>
  );
}
