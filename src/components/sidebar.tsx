"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { signOut } from "@/lib/actions/session";

const navItems: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: "/projects", label: "Projects" },
  { href: "/chat", label: "Chat" },
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

export function Sidebar({
  profile,
  isAdminUser,
}: {
  profile: Profile;
  isAdminUser: boolean;
}) {
  const pathname = usePathname();
  const admin = isAdminUser;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-rule bg-ink text-bone">
      <div className="border-b border-rule/20 px-5 py-6">
        <p className="font-display text-2xl font-semibold uppercase tracking-[0.35em]">
          COAST
        </p>
        <p className="mt-1 text-[0.7rem] uppercase tracking-[0.3em] text-bone/50">
          metal works
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems
          .filter((item) => !item.adminOnly || admin)
          .map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/settings" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-bone/10 text-bone"
                    : "text-bone/60 hover:bg-bone/5 hover:text-bone"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded bg-weld" />
                )}
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-rule/20 px-4 py-4">
        <div className="flex items-center gap-3">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bone/10 text-xs font-mono">
              {initials(profile)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {profile.full_name ?? profile.login}
            </p>
            <p className="truncate text-xs text-bone/50">{profile.role}</p>
          </div>
        </div>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="w-full rounded px-3 py-1.5 text-left text-xs text-bone/50 transition-colors hover:bg-bone/5 hover:text-bone"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
