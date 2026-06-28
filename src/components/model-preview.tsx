"use client";

import { createElement, useEffect, useState } from "react";

// Self-hosted Google <model-viewer>: bundled from npm, never loaded from a CDN
// at runtime, so 3D previews work offline on site.
export function ModelPreview({ src }: { src: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-60 items-center justify-center rounded border border-rule bg-ink/[0.03] text-sm text-graph dark:bg-paper/[0.04]">
        Loading 3D preview…
      </div>
    );
  }

  return createElement("model-viewer", {
    src,
    "camera-controls": true,
    "auto-rotate": true,
    "shadow-intensity": "1",
    style: {
      width: "100%",
      height: "240px",
      borderRadius: "0.25rem",
      border: "1px solid var(--rule)",
      backgroundColor: "transparent",
    },
  });
}
