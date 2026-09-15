"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { DesignIcon } from "@/components/design-icon";

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
    const frame = requestAnimationFrame(() => setDark(nextDark));
    return () => cancelAnimationFrame(frame);
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

export function SidebarThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("coast-theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      className="coast-sidebar-link flex h-9 flex-1 items-center justify-center rounded-[4px] border border-sidebar-rule text-sidebar-graph"
    >
      <DesignIcon name={dark ? "sun" : "moon"} size={16} />
    </button>
  );
}
