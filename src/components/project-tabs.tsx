"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ModelPreview } from "@/components/model-preview";
import { DrawingsViewer, type DrawingFile } from "@/components/drawings-viewer";
import { TasksPanel } from "@/components/tasks-panel";
import { TimeLogPanel } from "@/components/time-log-panel";
import { addGalleryItem, requestGalleryUpload } from "@/lib/actions/projects";
import { createClient } from "@/lib/supabase/client";
import type { Task, TimeLog } from "@/lib/types";

type Media = {
  id: string;
  url: string;
  type: "photo" | "video";
  author: string;
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

type Tab = "overview" | "drawings" | "tasks" | "gallery";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  drawings: "Drawings",
  tasks: "Tasks",
  gallery: "Gallery",
};

export function ProjectTabs({
  projectId,
  name,
  coverUrl,
  description,
  modelUrl,
  drawings,
  gallery,
  tasks,
  members,
  timeLogs,
  totalMinutes,
  canManage,
  canUpload,
  currentUserId,
  weldersSlot,
}: {
  projectId: string;
  name: string;
  coverUrl: string | null;
  description: string | null;
  modelUrl: string | null;
  drawings: DrawingFile[];
  gallery: Media[];
  tasks: Task[];
  members: { id: string; name: string }[];
  timeLogs: TimeLog[];
  totalMinutes: number;
  canManage: boolean;
  canUpload: boolean;
  currentUserId: string;
  weldersSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const openQuestions = drawings.reduce(
    (sum, d) => sum + d.pins.filter((p) => p.status === "open").length,
    0,
  );
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const badges: Partial<Record<Tab, number>> = {
    drawings: openQuestions,
    tasks: openTasks,
  };

  return (
    <div className="mt-8">
      <div className="flex gap-5 overflow-x-auto border-b border-rule sm:gap-6">
        {(["overview", "drawings", "tasks", "gallery"] as Tab[]).map((t) => {
          const badge = badges[t] ?? 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-3 text-sm transition-colors ${
                tab === t ? "text-ink" : "text-graph hover:text-ink"
              }`}
            >
              {TAB_LABELS[t]}
              {badge > 0 && (
                <span className="rounded-full bg-weld px-1.5 text-[0.65rem] font-medium text-paper">
                  {badge}
                </span>
              )}
              {tab === t && (
                <span className="absolute bottom-0 left-0 h-0.5 w-full bg-weld" />
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewPanel
          name={name}
          coverUrl={coverUrl}
          description={description}
          modelUrl={modelUrl}
          stats={{
            drawings: drawings.length,
            openQuestions,
            openTasks,
            photos: gallery.length,
            hours: Math.round((totalMinutes / 60) * 10) / 10,
          }}
          onJump={setTab}
          weldersSlot={weldersSlot}
        />
      )}
      {tab === "drawings" && (
        <div className="mt-6">
          {drawings.length > 0 ? (
            <DrawingsViewer
              files={drawings}
              projectId={projectId}
              canAnnotate={canUpload}
              canManage={canManage}
              currentUserId={currentUserId}
            />
          ) : (
            <p className="text-sm text-graph">No drawings uploaded.</p>
          )}
        </div>
      )}
      {tab === "tasks" && (
        <>
          <TasksPanel
            projectId={projectId}
            tasks={tasks}
            members={members}
            canManage={canManage}
          />
          <TimeLogPanel
            projectId={projectId}
            tasks={tasks}
            logs={timeLogs}
            totalMinutes={totalMinutes}
            canViewAll={canManage}
            currentUserId={currentUserId}
          />
        </>
      )}
      {tab === "gallery" && (
        <GalleryPanel
          projectId={projectId}
          gallery={gallery}
          canUpload={canUpload}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  onClick,
  accent,
}: {
  label: string;
  value: number | string;
  onClick?: () => void;
  accent?: boolean;
}) {
  const cls = `rounded border bg-paper px-3 py-2.5 text-left transition-colors ${
    onClick ? "hover:border-ink/30" : ""
  } ${accent ? "border-weld/50" : "border-rule"}`;
  const inner = (
    <>
      <p
        className={`font-display text-xl font-medium ${accent ? "text-weld" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="text-xs text-graph">{label}</p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function OverviewPanel({
  name,
  coverUrl,
  description,
  modelUrl,
  stats,
  onJump,
  weldersSlot,
}: {
  name: string;
  coverUrl: string | null;
  description: string | null;
  modelUrl: string | null;
  stats: {
    drawings: number;
    openQuestions: number;
    openTasks: number;
    photos: number;
    hours: number;
  };
  onJump: (tab: Tab) => void;
  weldersSlot?: ReactNode;
}) {
  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-6 md:grid-cols-2 md:items-start">
        {coverUrl && (
          <div className="overflow-hidden rounded border border-rule">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={`${name} cover`} className="h-auto w-full" />
          </div>
        )}
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">{name}</h2>
          {description ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-graph">
              {description}
            </p>
          ) : (
            <p className="mt-3 text-sm text-graph">No description.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Drawings"
          value={stats.drawings}
          onClick={() => onJump("drawings")}
        />
        <StatTile
          label="Open questions"
          value={stats.openQuestions}
          accent={stats.openQuestions > 0}
          onClick={() => onJump("drawings")}
        />
        <StatTile
          label="Open tasks"
          value={stats.openTasks}
          accent={stats.openTasks > 0}
          onClick={() => onJump("tasks")}
        />
        <StatTile
          label="Photos & video"
          value={stats.photos}
          onClick={() => onJump("gallery")}
        />
        <StatTile label="Hours logged" value={stats.hours} />
      </section>

      {modelUrl && (
        <section>
          <h2 className="font-display text-lg font-medium text-ink">3D model</h2>
          <div className="mt-4">
            <ModelPreview src={modelUrl} />
          </div>
        </section>
      )}

      {weldersSlot}
    </div>
  );
}

function GalleryPanel({
  projectId,
  gallery,
  canUpload,
}: {
  projectId: string;
  gallery: Media[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered =
    filter === "all" ? gallery : gallery.filter((m) => m.type === filter);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const type: "photo" | "video" = file.type.startsWith("video/")
          ? "video"
          : "photo";

        const signed = await requestGalleryUpload(projectId, file.name);
        if ("error" in signed) throw new Error(signed.error);

        const { error: upErr } = await supabase.storage
          .from("project-gallery")
          .uploadToSignedUrl(signed.path, signed.token, file, {
            contentType: file.type || undefined,
          });
        if (upErr) throw new Error(upErr.message);

        const result = await addGalleryItem(projectId, signed.path, type);
        if (result.error) throw new Error(result.error);
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const filters: { value: "all" | "photo" | "video"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "photo", label: "Photos" },
    { value: "video", label: "Videos" },
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                filter === f.value
                  ? "border-weld bg-weld text-paper"
                  : "border-rule text-graph hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {canUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded border border-rule px-4 py-2 text-sm text-ink transition-colors hover:border-weld hover:text-weld disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "↑ Upload"}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          {error}
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="overflow-hidden rounded border border-rule bg-paper"
            >
              <div className="relative aspect-video bg-ink/[0.04] dark:bg-paper/[0.04]">
                <span className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-ink/70 px-2 py-1 text-xs text-paper">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-weld font-mono text-[0.6rem]">
                    {initials(m.author)}
                  </span>
                  {m.author}
                </span>
                {m.type === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={m.url}
                    controls
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-sm text-graph">
          {canUpload
            ? "No media yet — upload photos or videos."
            : "No media yet."}
        </p>
      )}
    </div>
  );
}
