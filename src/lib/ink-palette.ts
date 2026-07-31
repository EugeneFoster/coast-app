/** Functional ink colours — annotation content, not app chrome. */
export const INK_COLORS = [
  "#E03E2D",
  "#2563EB",
  "#16A34A",
  "#EAB308",
  "#9333EA",
  "#000000",
] as const;

/** UI palette sizes (px); converted to image-space on save. */
export const INK_WIDTHS = [2, 4, 8] as const;

export type InkWidth = (typeof INK_WIDTHS)[number];

export function inkStrokeImageWidth(pageWidth: number, uiWidth: InkWidth) {
  return pageWidth * (uiWidth / 6000);
}

export const HIGHLIGHTER_OPACITY = 0.35;
