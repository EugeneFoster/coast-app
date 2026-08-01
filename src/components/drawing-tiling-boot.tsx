"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DrawingFile } from "@/components/drawings-viewer";

/** Kick off tiling for processing drawings without blocking page SSR. */
export function DrawingTilingBoot({ drawings }: { drawings: DrawingFile[] }) {
  const router = useRouter();
  const started = useRef(new Set<string>());

  useEffect(() => {
    const pending = drawings.filter(
      (d) => d.status === "processing" && d.pages.length === 0,
    );
    if (pending.length === 0) return;

    let cancelled = false;

    (async () => {
      for (const d of pending) {
        if (started.current.has(d.id)) continue;
        started.current.add(d.id);
        try {
          await fetch(`/api/drawings/${d.id}/process`, { method: "POST" });
        } catch {
          // ignore — user can Retry manually
        }
      }
      if (!cancelled) {
        router.refresh();
      }
    })();

    const poll = window.setInterval(() => router.refresh(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [drawings, router]);

  return null;
}
