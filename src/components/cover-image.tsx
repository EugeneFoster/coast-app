import { isUploadedCover } from "@/lib/covers";

export function CoverImage({
  src,
  coverPath,
  alt = "",
  className = "h-full w-full object-cover",
}: {
  src: string;
  coverPath: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const isPhoto = isUploadedCover(coverPath);

  if (isPhoto) {
    return (
      <div className="cover-photo-wrap h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={`cover-photo ${className}`} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}
