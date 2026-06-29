"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { signOut } from "@/lib/actions/session";
import { ThemeToggle } from "@/components/theme-provider";

const navItems: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/questions", label: "Questions" },
  { href: "/library", label: "Library" },
  { href: "/archive", label: "Archive" },
  { href: "/settings", label: "Settings" },
];

function initials(profile: Profile) {
  if (profile.full_name) {
    return profile.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return profile.login.slice(0, 2).toUpperCase();
}

function isActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/settings" &&
      href !== "/dashboard" &&
      pathname.startsWith(href)) ||
    (href === "/settings" && pathname.startsWith("/settings")) ||
    (href === "/dashboard" && pathname === "/dashboard")
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-4 py-2">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`relative rounded px-3 py-2.5 text-[0.95rem] transition-colors ${
              active
                ? "font-medium text-weld"
                : "text-ink/65 hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-weld" />
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="px-6 py-7">
      <p className="font-display text-2xl font-semibold uppercase tracking-[0.3em] text-ink">
        COAST
      </p>
      <p className="mt-1.5 text-[0.65rem] uppercase tracking-[0.35em] text-ink/45">
        metal works
      </p>
    </div>
  );
}

function ProfileBlock({ profile }: { profile: Profile }) {
  return (
    <div className="border-t border-rule px-5 py-5">
      <div className="flex items-center gap-3">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 font-mono text-xs font-semibold text-ink">
            {initials(profile)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {profile.full_name ?? profile.login}
          </p>
          <p className="truncate text-xs lowercase text-ink/45">
            {profile.role}
          </p>
        </div>
      </div>
      <form action={signOut} className="mt-3">
        <button
          type="submit"
          className="w-full rounded px-3 py-1.5 text-left text-xs text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="blueprint-panel sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-rule text-ink lg:flex">
        <Brand />
        <NavLinks />
        <ProfileBlock profile={profile} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="blueprint-panel absolute left-0 top-0 flex h-full w-64 flex-col border-r border-rule text-ink shadow-xl">
            <Brand />
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <ProfileBlock profile={profile} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="blueprint-panel sticky top-0 z-30 flex items-center justify-between border-b border-rule px-4 py-3 text-ink lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded border border-rule/60 text-ink"
          >
            <span className="sr-only">Menu</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <p className="font-display text-lg font-semibold uppercase tracking-[0.25em]">
            COAST
          </p>
          <ThemeToggle />
        </header>

        {/* Desktop top bar */}
        <header className="hidden items-center justify-end px-6 py-3 lg:flex">
          <ThemeToggle />
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
