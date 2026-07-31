/** Normalized image bbox (0..1) relative to drawing_pages width/height. */
export type NormBbox = { x: number; y: number; w: number; h: number };

export type NormPoint = { x: number; y: number };

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function bboxFromPath(path: NormPoint[]): NormBbox {
  if (path.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = path[0].x;
  let minY = path[0].y;
  let maxX = path[0].x;
  let maxY = path[0].y;
  for (const p of path.slice(1)) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Distance from normalized point to polyline segment in norm space. */
export function distToPath(path: NormPoint[], nx: number, ny: number): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) {
    return Math.hypot(path[0].x - nx, path[0].y - ny);
  }
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1].x;
    const ay = path[i - 1].y;
    const bx = path[i].x;
    const by = path[i].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((nx - ax) * dx + (ny - ay) * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.hypot(px - nx, py - ny));
  }
  return best;
}

/** Normalized path → SVG points string in overlay pixel space. */
export function normPathToSvgPoints(
  path: NormPoint[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OSD: any,
  pageWidth: number,
  pageHeight: number,
): string {
  return path
    .map((p) => {
      const pt = normToViewportPixel(p.x, p.y, viewer, OSD, pageWidth, pageHeight);
      return `${pt.x},${pt.y}`;
    })
    .join(" ");
}

/** Image-space stroke width → screen pixels at current zoom. */
export function imageStrokeToScreenPx(
  strokeWidth: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OSD: any,
): number {
  const a = viewer.viewport.imageToViewportCoordinates(new OSD.Point(0, 0));
  const b = viewer.viewport.imageToViewportCoordinates(new OSD.Point(strokeWidth, 0));
  const pa = viewer.viewport.pixelFromPoint(a);
  const pb = viewer.viewport.pixelFromPoint(b);
  return Math.max(1, Math.abs(pb.x - pa.x));
}

/** Screen drag rect → normalized bbox (same convention as Ask crop). */
export function screenRectToNormBbox(
  rect: { x: number; y: number; w: number; h: number },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OSD: any,
  pageWidth: number,
  pageHeight: number,
): NormBbox {
  const tl = viewer.viewport.pointFromPixel(new OSD.Point(rect.x, rect.y));
  const br = viewer.viewport.pointFromPixel(
    new OSD.Point(rect.x + rect.w, rect.y + rect.h),
  );
  const itl = viewer.viewport.viewportToImageCoordinates(tl);
  const ibr = viewer.viewport.viewportToImageCoordinates(br);

  return {
    x: clamp01(itl.x / pageWidth),
    y: clamp01(itl.y / pageHeight),
    w: clamp01((ibr.x - itl.x) / pageWidth),
    h: clamp01((ibr.y - itl.y) / pageHeight),
  };
}

/** Screen point → normalized point. */
export function screenPointToNorm(
  px: number,
  py: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OSD: any,
  pageWidth: number,
  pageHeight: number,
): NormPoint {
  const vp = viewer.viewport.pointFromPixel(new OSD.Point(px, py));
  const img = viewer.viewport.viewportToImageCoordinates(vp);
  return {
    x: clamp01(img.x / pageWidth),
    y: clamp01(img.y / pageHeight),
  };
}

/** Normalized point → viewport pixel coords for overlay positioning. */
export function normToViewportPixel(
  nx: number,
  ny: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OSD: any,
  pageWidth: number,
  pageHeight: number,
) {
  const img = new OSD.Point(nx * pageWidth, ny * pageHeight);
  const vp = viewer.viewport.imageToViewportCoordinates(img);
  return viewer.viewport.pixelFromPoint(vp);
}

/** Normalized bbox → screen rect in overlay pixels. */
export function normBboxToScreenRect(
  bbox: NormBbox,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OSD: any,
  pageWidth: number,
  pageHeight: number,
) {
  const tl = normToViewportPixel(bbox.x, bbox.y, viewer, OSD, pageWidth, pageHeight);
  const br = normToViewportPixel(
    bbox.x + bbox.w,
    bbox.y + bbox.h,
    viewer,
    OSD,
    pageWidth,
    pageHeight,
  );
  return {
    x: tl.x,
    y: tl.y,
    w: br.x - tl.x,
    h: br.y - tl.y,
  };
}
