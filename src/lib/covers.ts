/** Uploaded image stored in the public project-covers bucket. */
export function isUploadedCover(coverUrl: string | null | undefined): boolean {
  return !!coverUrl && !coverUrl.startsWith("drawings/");
}

/** Auto-generated cover from a tiled drawing page preview in R2. */
export function isDrawingPreviewCover(
  coverUrl: string | null | undefined,
): boolean {
  return !!coverUrl && coverUrl.startsWith("drawings/");
}

function tilePreviewUrl(drawingId: string, version: number, pageNo: number) {
  return `/api/tiles/${drawingId}/${version}/${pageNo}/preview.webp`;
}

/** Resolve a cover_url column value to a fetchable URL, or null. */
export function resolveCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) return null;

  if (isDrawingPreviewCover(coverUrl)) {
    const match = coverUrl.match(
      /^drawings\/([^/]+)\/v(\d+)\/p(\d+)\/preview\.webp$/,
    );
    if (match) {
      return tilePreviewUrl(match[1], Number(match[2]), Number(match[3]));
    }
    return null;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/project-covers/${coverUrl}`;
}
