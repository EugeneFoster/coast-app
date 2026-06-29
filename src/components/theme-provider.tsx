"use client";

import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = localStorage.getItem("coast-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored === "dark" || (!stored && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return children;
}

export function ThemeToggle() {
  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("coast-theme", isDark ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded border border-rule px-3 py-1.5 text-sm text-graph hover:text-ink"
      aria-label="Toggle dark mode"
    >
      Theme
    </button>
  );
}
