"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const THEME_EVENT = "coast-theme-change";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

function currentTheme() {
  return document.documentElement.classList.contains("dark");
}

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
  const dark = useSyncExternalStore(subscribeTheme, currentTheme, () => false);

  function select(nextDark: boolean) {
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("coast-theme", nextDark ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div className="flex overflow-hidden rounded-[4px] border border-rule" aria-label="Color theme">
      <button
        type="button"
        onClick={() => select(false)}
        className={`flex h-9 w-9 items-center justify-center ${!dark ? "bg-ink text-bone" : "bg-paper text-graph"}`}
        aria-label="Use light theme"
        aria-pressed={!dark}
      >
        <Sun size={16} strokeWidth={1.5} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => select(true)}
        className={`flex h-9 w-9 items-center justify-center ${dark ? "bg-ink text-bone" : "bg-paper text-graph"}`}
        aria-label="Use dark theme"
        aria-pressed={dark}
      >
        <Moon size={16} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
