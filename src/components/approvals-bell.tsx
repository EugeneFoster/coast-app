import Link from "next/link";
import { getApprovalCounts, getUnreadNotificationCount } from "@/lib/approvals-data";

/**
 * The CRM's notification indicator.
 *
 * Server-rendered so it stays in step with the page it is shown on, and so the
 * unread count is never computed from data the browser could tamper with. It
 * intentionally shows the *approval* count with emphasis: an outstanding
 * decision is the one notification that blocks work.
 */
export async function ApprovalsBell() {
  const [counts, unread] = await Promise.all([
    getApprovalCounts(),
    getUnreadNotificationCount(),
  ]);

  const needsAttention = counts.pending + counts.failed;
  const badge = needsAttention > 0 ? needsAttention : unread;

  return (
    <Link
      href="/approvals"
      aria-label={
        needsAttention > 0
          ? `Approvals — ${needsAttention} need attention`
          : "Approvals"
      }
      className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors ${
        needsAttention > 0
          ? "border-weld text-weld"
          : "border-rule text-graph hover:text-ink"
      }`}
    >
      <span aria-hidden="true">🔔</span>
      <span>Approvals</span>
      {badge > 0 && (
        <span className="rounded-[10px] bg-weld px-1.5 py-0.5 font-mono text-xs text-paper">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
