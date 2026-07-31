"use client";

export function MarkupComposePopover({
  kind,
  onSubmit,
  onCancel,
}: {
  kind: "pin" | "area";
  onSubmit: (title: string, body: string, photo: File | null) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-4 z-30 w-80 -translate-x-1/2 rounded-xl border border-rule bg-paper p-4 shadow-lg">
      <p className="font-display text-sm font-medium text-ink">
        New {kind === "pin" ? "pin" : "area"} markup
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const title = String(fd.get("title") ?? "").trim();
          const body = String(fd.get("body") ?? "").trim();
          const photoInput = e.currentTarget.querySelector<HTMLInputElement>(
            'input[type="file"]',
          );
          const photo = photoInput?.files?.[0] ?? null;
          if (title && body) onSubmit(title, body, photo);
        }}
      >
        <input
          name="title"
          placeholder="Short label"
          required
          className="w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
        />
        <textarea
          name="body"
          rows={3}
          placeholder="Question or note…"
          required
          className="w-full resize-none rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
        />
        <label className="block text-xs text-graph">
          Photo (optional)
          <input type="file" accept="image/*" className="mt-1 block text-sm" />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-ink px-3 py-1.5 text-sm text-ink"
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary px-3 py-1.5 text-sm">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
