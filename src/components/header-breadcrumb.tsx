"use client";

import { usePathname } from "next/navigation";

/** Human labels for the first path segment. Falls back to a title-cased slug. */
const SECTION_LABELS: Record<string, string> = {
  projects: "Projects",
  "my-day": "My day",
  "work-orders": "Work orders",
  "paint-yard": "Paint yard",
  schedule: "Team schedule",
  inventory: "Inventory",
  sales: "Sales CRM",
  billing: "Billing",
  "counter-sales": "Counter sales",
  approvals: "Approvals",
  chat: "Chat",
  library: "Library",
  archive: "Archive",
  settings: "Settings",
};

function labelFor(segment: string) {
  return (
    SECTION_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * The top-bar breadcrumb: a fixed "Workspace" root and the current section,
 * in the kicker style. Mirrors the redesign's "WORKSPACE / PROJECTS".
 */
export function HeaderBreadcrumb() {
  const pathname = usePathname();
  const segment = pathname.split("/").filter(Boolean)[0];

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2">
      <span className="kicker">Workspace</span>
      {segment && (
        <>
          <span className="kicker" aria-hidden>
            /
          </span>
          <span className="kicker kicker-weld">{labelFor(segment)}</span>
        </>
      )}
    </nav>
  );
}
