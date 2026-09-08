"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { automaticInventorySyncAction } from "@/lib/actions/automatic-inventory-sync";

export function InventoryAutoSync({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const running = useRef(false);
  const run = useCallback(async () => {
    if (!enabled || running.current || document.visibilityState === "hidden") return;
    running.current = true;
    try {
      const result = await automaticInventorySyncAction();
      if (result.ok && result.changed) router.refresh();
    } finally {
      running.current = false;
    }
  }, [enabled, router]);

  useEffect(() => {
    if (!enabled) return;
    void run();
    const timer = window.setInterval(() => void run(), 60_000);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [enabled, run]);

  return null;
}
