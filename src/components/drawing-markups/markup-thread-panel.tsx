"use client";

import type { MarkupWithThread } from "@/lib/types";
import type { MarkupStatus } from "@/lib/types";
import { MARKUP_STATUS, markupStatusStyles } from "@/lib/markup-status";

function authorLabel(m: MarkupWithThread) {
  return m.profiles?.full_name ?? m.profiles?.login ?? "Unknown";
}

function commentAuthor(c: MarkupWithThread["comments"][number]) {
  return c.profiles?.full_name ?? c.profiles?.login ?? "Unknown";
}

export function MarkupThreadPanel({
  markup,
  isAdminUser,
  pending,
  onClose,
  onReply,
  onStatusChange,
  onAttachPhoto,
}: {
  markup: MarkupWithThread;
  isAdminUser: boolean;
  pending?: boolean;
  onClose: () => void;
  onReply: (body: string) => void;
  onStatusChange: (status: MarkupStatus) => void;
  onAttachPhoto: (file: File) => void;
}) {
  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-80 flex-col border-l border-rule bg-paper shadow-lg">
      <div className="flex items-start justify-between gap-2 border-b border-rule p-4">
        <div>
          <p className="font-display text-sm font-medium text-ink">
            {markup.title ?? (markup.kind === "ink" ? "Ink markup" : "Markup")}
          </p>
          <p className="mt-0.5 font-mono text-xs text-graph">
            {authorLabel(markup)} · rev {markup.version}
            {markup.carried_from_id && " · carried"}
            {markup.needs_review && " · needs review"}
          </p>
          {pending && (
            <p className="mt-1 text-xs text-weld">Pending sync</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-graph hover:text-ink"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <span
          className="inline-flex rounded-[14px] border px-2 py-0.5 font-mono text-xs"
          style={markupStatusStyles(markup.status)}
        >
          {MARKUP_STATUS[markup.status].label}
        </span>

        <div className="mt-4 space-y-4">
          {markup.comments.map((c) => (
            <div key={c.id}>
              <p className="text-sm text-ink">{c.body}</p>
              <p className="mt-1 font-mono text-xs text-graph">
                {commentAuthor(c)} ·{" "}
                {new Date(c.created_at).toLocaleString("en-CA", {
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>

        {markup.photos.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {markup.photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded border border-rule">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="h-20 w-full object-cover" />
                ) : (
                  <div className="flex h-20 items-center justify-center bg-bone text-xs text-graph">
                    Photo
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        className="border-t border-rule p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const body = String(fd.get("body") ?? "").trim();
          if (body) {
            onReply(body);
            e.currentTarget.reset();
          }
        }}
      >
        <textarea
          name="body"
          rows={2}
          placeholder="Reply…"
          className="w-full resize-none rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <label className="cursor-pointer text-xs text-graph hover:text-ink">
            Attach photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAttachPhoto(f);
              }}
            />
          </label>
          {isAdminUser && markup.status !== "resolved" && (
            <button
              type="button"
              onClick={() => onStatusChange("resolved")}
              className="ml-auto text-xs text-ink underline hover:text-weld"
            >
              Resolve
            </button>
          )}
          <button
            type="submit"
            className="btn-primary px-3 py-1 text-xs"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
