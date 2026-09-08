"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

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
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("coast-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextDark = stored === "dark" || (!stored && prefersDark);
    document.documentElement.classList.toggle("dark", nextDark);
    setDark(nextDark);
  }, []);

  function select(nextDark: boolean) {
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("coast-theme", nextDark ? "dark" : "light");
    setDark(nextDark);
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
