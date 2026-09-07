import "server-only";

import { statusesForFilter, type ApprovalFilter } from "@/lib/approvals";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification, ChangeApprovalRequest } from "@/lib/types";

const REQUEST_COLUMNS = `
  id, action_type, entity_type, entity_id, parent_entity_id,
  supplier, source_part_number, proposed_part_number,
  summary, proposed_changes, current_values,
  xero_impact, xero_impact_detail, supplier_checked_at,
  status, requested_by, created_at, expires_at,
  decided_at, decided_by, rejection_reason,
  executing_at, executed_at, execution_status, execution_error, result_entity_id,
  external_sync_status, external_sync_error, external_sync_at,
  idempotency_key, updated_at,
  requester:profiles!change_approval_requests_requested_by_fkey (full_name, login),
  decider:profiles!change_approval_requests_decided_by_fkey (full_name, login)
`;

export async function getApprovalRequests(
  filter: ApprovalFilter,
  limit = 100,
): Promise<ChangeApprovalRequest[]> {
  const supabase = await createClient();
  let query = supabase
    .from("change_approval_requests")
    .select(REQUEST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  const statuses = statusesForFilter(filter);
  if (statuses) query = query.in("status", statuses);

  const { data, error } = await query;
  if (error) {
    console.error("[approvals-data] list", error.message);
    return [];
  }
  return (data ?? []) as unknown as ChangeApprovalRequest[];
}

export async function getApprovalRequest(
  id: string,
): Promise<ChangeApprovalRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("change_approval_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[approvals-data] read", error.message);
    return null;
  }
  return (data ?? null) as unknown as ChangeApprovalRequest | null;
}

/** Approvals raised against one work order, newest first. */
export async function getApprovalRequestsForParent(
  parentEntityId: string,
  limit = 20,
): Promise<ChangeApprovalRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("change_approval_requests")
    .select(REQUEST_COLUMNS)
    .eq("parent_entity_id", parentEntityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[approvals-data] parent", error.message);
    return [];
  }
  return (data ?? []) as unknown as ChangeApprovalRequest[];
}

export async function getNotifications(limit = 30): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[approvals-data] notifications", error.message);
    return [];
  }
  return (data ?? []) as AppNotification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) {
    console.error("[approvals-data] unread", error.message);
    return 0;
  }
  return count ?? 0;
}

export interface ApprovalCounts {
  pending: number;
  failed: number;
}

export async function getApprovalCounts(): Promise<ApprovalCounts> {
  const supabase = await createClient();
  const [pending, failed] = await Promise.all([
    supabase
      .from("change_approval_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_approval", "stale_requires_reapproval"]),
    supabase
      .from("change_approval_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  return {
    pending: pending.count ?? 0,
    failed: failed.count ?? 0,
  };
}
