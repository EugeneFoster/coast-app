"use client";

import type { MarkupStatus, MarkupWithThread } from "@/lib/types";
import { MARKUP_STATUS, markupStatusStyles } from "@/lib/markup-status";

export function MarkupsListPanel({
  markups,
  open,
  onToggle,
  filterStatus,
  onFilterStatus,
  filterPage,
  onFilterPage,
  pageCount,
  onSelect,
  kindIcon = (k) => (k === "pin" ? "●" : k === "area" ? "▢" : "✎"),
}: {
  markups: MarkupWithThread[];
  open: boolean;
  onToggle: () => void;
  filterStatus: MarkupStatus | "all";
  onFilterStatus: (s: MarkupStatus | "all") => void;
  filterPage: number | "all";
  onFilterPage: (p: number | "all") => void;
  pageCount: number;
  onSelect: (m: MarkupWithThread) => void;
  kindIcon?: (kind: string) => string;
}) {
  const filtered = markups.filter((m) => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterPage !== "all" && m.page_no !== filterPage) return false;
    return true;
  });

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onToggle}
        className="text-sm text-graph hover:text-ink"
      >
        {open ? "Hide markups" : "Show markups"} ({markups.length})
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-rule bg-paper">
          <div className="flex flex-wrap gap-2 border-b border-rule p-3">
            {(["all", "open", "answered", "resolved"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onFilterStatus(s)}
                className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                  filterStatus === s ? "border-ink text-ink" : "border-rule text-graph"
                }`}
              >
                {s === "all" ? "All" : MARKUP_STATUS[s].label}
              </button>
            ))}
            <select
              value={filterPage === "all" ? "all" : String(filterPage)}
              onChange={(e) =>
                onFilterPage(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="ml-auto rounded border border-rule bg-bone px-2 py-0.5 text-xs text-ink"
            >
              <option value="all">All sheets</option>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  Sheet {p}
                </option>
              ))}
            </select>
          </div>

          <ul className="max-h-48 divide-y divide-rule overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="p-4 text-sm text-graph">No markups</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bone"
                  >
                    <span className="font-mono text-xs text-graph">
                      {kindIcon(m.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {m.title ?? (m.kind === "ink" ? "Ink markup" : "Untitled")}
                      {m.carried_from_id && (
                        <span className="ml-1 font-mono text-[0.65rem] text-graph">
                          rev {m.version - 1}
                        </span>
                      )}
                      {m.needs_review && (
                        <span className="ml-1 text-[0.65rem] text-weld">
                          needs review
                        </span>
                      )}
                    </span>
                    <span
                      className="shrink-0 rounded-[14px] border px-1.5 py-0.5 font-mono text-[0.65rem]"
                      style={markupStatusStyles(m.status)}
                    >
                      {MARKUP_STATUS[m.status].label}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-graph">
                      p{m.page_no}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
