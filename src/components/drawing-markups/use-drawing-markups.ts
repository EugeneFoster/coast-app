"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MarkupWithThread } from "@/lib/types";
import {
  createMarkupAction,
  addMarkupCommentAction,
  updateMarkupStatusAction,
  registerMarkupPhoto,
  requestMarkupPhotoUpload,
} from "@/lib/actions/markups";
import {
  enqueueMarkupOp,
  listPendingOps,
  removePendingOp,
  isOnline,
  onConnectivityChange,
} from "@/lib/offline/markup-queue";

export function useDrawingMarkups({
  drawingId,
  version,
  projectId,
  initial,
}: {
  drawingId: string;
  version: number;
  projectId: string;
  initial: MarkupWithThread[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [markups, setMarkups] = useState<MarkupWithThread[]>(initial);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    setMarkups(initial);
  }, [initial]);

  useEffect(() => {
    return onConnectivityChange(setOnline);
  }, []);

  const refreshPending = useCallback(async () => {
    const ops = await listPendingOps();
    setPendingIds(new Set(ops.map((o) => o.clientId)));
  }, []);

  const flushQueue = useCallback(async () => {
    if (!isOnline()) return;
    const ops = await listPendingOps();

    for (const op of ops) {
      try {
        if (op.type === "create_markup") {
          await createMarkupAction({
            ...op.payload,
            clientId: op.clientId,
          });
        } else if (op.type === "add_comment") {
          await addMarkupCommentAction(
            op.payload.markupId,
            op.payload.body,
            op.payload.projectId,
          );
        } else if (op.type === "upload_photo") {
          const signed = await requestMarkupPhotoUpload(
            op.payload.markupId,
            op.payload.fileName,
          );
          if ("error" in signed) throw new Error(signed.error);
          const { error: upErr } = await supabase.storage
            .from("markup-photos")
            .uploadToSignedUrl(signed.path, signed.token, op.payload.blob, {
              contentType: op.payload.blob.type || undefined,
            });
          if (upErr) throw new Error(upErr.message);
          await registerMarkupPhoto(
            op.payload.markupId,
            signed.path,
            op.payload.projectId,
            op.payload.commentId,
          );
        }
        await removePendingOp(op.id);
      } catch (err) {
        console.error("[markup-sync]", op.type, err);
      }
    }
    await refreshPending();
  }, [refreshPending, supabase]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (online) void flushQueue();
  }, [online, flushQueue]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`markups-${drawingId}-v${version}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drawing_markups",
          filter: `drawing_id=eq.${drawingId}`,
        },
        async () => {
          const { data } = await supabase
            .from("drawing_markups")
            .select("*, profiles:created_by(full_name, login)")
            .eq("drawing_id", drawingId)
            .eq("version", version)
            .order("created_at");
          if (!data) return;

          const ids = data.map((m) => m.id);
          const { data: comments } = await supabase
            .from("markup_comments")
            .select("*, profiles:author(full_name, login)")
            .in("markup_id", ids)
            .order("created_at");
          const { data: photos } = await supabase
            .from("markup_photos")
            .select("*")
            .in("markup_id", ids)
            .order("created_at");

          const commentsBy = new Map<string, NonNullable<typeof comments>>();
          (comments ?? []).forEach((c) => {
            const list = commentsBy.get(c.markup_id) ?? [];
            list.push(c);
            commentsBy.set(c.markup_id, list);
          });
          const photosBy = new Map<string, NonNullable<typeof photos>>();
          (photos ?? []).forEach((p) => {
            const list = photosBy.get(p.markup_id) ?? [];
            list.push({ ...p, url: null });
            photosBy.set(p.markup_id, list);
          });

          setMarkups(
            data.map((m) => ({
              ...m,
              comments: commentsBy.get(m.id) ?? [],
              photos: photosBy.get(m.id) ?? [],
            })) as MarkupWithThread[],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "markup_comments",
        },
        () => {
          void flushQueue();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, drawingId, version, flushQueue]);

  const createMarkup = useCallback(
    async (input: {
      kind: "pin" | "area";
      pageNo: number;
      x: number;
      y: number;
      w?: number | null;
      h?: number | null;
      title: string;
      commentBody: string;
    }) => {
      const clientId = crypto.randomUUID();
      const optimistic: MarkupWithThread = {
        id: clientId,
        drawing_id: drawingId,
        version,
        page_no: input.pageNo,
        kind: input.kind,
        x: input.x,
        y: input.y,
        w: input.w ?? null,
        h: input.h ?? null,
        path: null,
        status: "open",
        title: input.title,
        created_by: null,
        carried_from_id: null,
        needs_review: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        comments: [
          {
            id: `${clientId}-c1`,
            markup_id: clientId,
            body: input.commentBody,
            author: null,
            created_at: new Date().toISOString(),
          },
        ],
        photos: [],
      };

      setMarkups((prev) => [...prev, optimistic]);
      setPendingIds((s) => new Set(s).add(clientId));

      const payload = {
        drawingId,
        version,
        pageNo: input.pageNo,
        kind: input.kind,
        x: input.x,
        y: input.y,
        w: input.w,
        h: input.h,
        title: input.title,
        commentBody: input.commentBody,
        projectId,
      };

      if (!isOnline()) {
        await enqueueMarkupOp({ type: "create_markup", clientId, payload });
        return clientId;
      }

      try {
        const { id } = await createMarkupAction({ ...payload, clientId });
        setMarkups((prev) =>
          prev.map((m) => (m.id === clientId ? { ...m, id } : m)),
        );
        setPendingIds((s) => {
          const n = new Set(s);
          n.delete(clientId);
          return n;
        });
        return id;
      } catch {
        await enqueueMarkupOp({ type: "create_markup", clientId, payload });
        return clientId;
      }
    },
    [drawingId, version, projectId],
  );

  const addComment = useCallback(
    async (markupId: string, body: string) => {
      if (!isOnline()) {
        const clientId = crypto.randomUUID();
        await enqueueMarkupOp({
          type: "add_comment",
          clientId,
          payload: { markupId, body, projectId },
        });
        setMarkups((prev) =>
          prev.map((m) =>
            m.id === markupId
              ? {
                  ...m,
                  comments: [
                    ...m.comments,
                    {
                      id: clientId,
                      markup_id: markupId,
                      body,
                      author: null,
                      created_at: new Date().toISOString(),
                    },
                  ],
                }
              : m,
          ),
        );
        setPendingIds((s) => new Set(s).add(clientId));
        return;
      }
      await addMarkupCommentAction(markupId, body, projectId);
    },
    [projectId],
  );

  const setStatus = useCallback(
    async (markupId: string, status: "open" | "answered" | "resolved") => {
      setMarkups((prev) =>
        prev.map((m) => (m.id === markupId ? { ...m, status } : m)),
      );
      if (isOnline()) {
        await updateMarkupStatusAction(markupId, status, projectId);
      }
    },
    [projectId],
  );

  return {
    markups,
    pendingIds,
    online,
    createMarkup,
    addComment,
    setStatus,
    flushQueue,
  };
}
