"use client";

import { useState } from "react";

type EventCoverImageProps = {
  src: string;
  alt: string;
  className: string;
  fallbackClassName?: string;
};

export function EventCoverImage({
  src,
  alt,
  className,
  fallbackClassName,
}: EventCoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div
        aria-label={alt || "Event cover image unavailable"}
        className={`flex items-center justify-center bg-slate-100 px-4 text-center text-sm text-slate-500 ${fallbackClassName ?? className}`}
        role="img"
      >
        Event cover image could not be loaded. Check the image URL.
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
      src={src}
    />
  );
}
