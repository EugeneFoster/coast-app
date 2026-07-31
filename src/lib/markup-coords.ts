/** Normalized image bbox (0..1) relative to drawing_pages width/height. */
export type NormBbox = { x: number; y: number; w: number; h: number };

export type NormPoint = { x: number; y: number };

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
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
