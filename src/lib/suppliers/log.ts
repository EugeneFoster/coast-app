/**
 * Structured, redaction-safe logging for the supplier layer.
 *
 * Rule: only the fields listed in `SupplierLogFields` are ever emitted. Passing
 * an unexpected object through here cannot leak a password, cookie or session
 * token because nothing else is read.
 */

import type { SupplierId } from "@/lib/suppliers/types";

export interface SupplierLogFields {
  supplier: SupplierId;
  operation: string;
  status: string;
  partNumber?: string;
  resultCount?: number;
  durationMs?: number;
  cached?: boolean;
  /** Normalized error code only — never a raw upstream message. */
  code?: string;
  /** Short operator detail. Callers must pre-redact. */
  detail?: string;
}

/** Values that must never appear in a log line, whatever the caller passes. */
const FORBIDDEN_PATTERN =
  /(password|passwd|pwd|cookie|set-cookie|authorization|bearer|session[_-]?id|csrf|token)/i;

function scrub(value: string): string {
  if (FORBIDDEN_PATTERN.test(value)) return "[redacted]";
  // Defensively cap length so a stray HTML blob can never reach the log.
  return value.length > 200 ? `${value.slice(0, 200)}…` : value;
}

function format(fields: SupplierLogFields): string {
  const parts: string[] = [
    `supplier=${fields.supplier}`,
    `operation=${fields.operation}`,
    `status=${fields.status}`,
  ];
  if (fields.partNumber) parts.push(`partNumber=${scrub(fields.partNumber)}`);
  if (typeof fields.resultCount === "number") parts.push(`resultCount=${fields.resultCount}`);
  if (typeof fields.durationMs === "number") {
    parts.push(`durationMs=${Math.round(fields.durationMs)}`);
  }
  if (typeof fields.cached === "boolean") parts.push(`cached=${fields.cached}`);
  if (fields.code) parts.push(`code=${scrub(fields.code)}`);
  if (fields.detail) parts.push(`detail="${scrub(fields.detail)}"`);
  return parts.join(" ");
}

export function logSupplier(fields: SupplierLogFields) {
  console.info(`[suppliers] ${format(fields)}`);
}

export function logSupplierError(fields: SupplierLogFields) {
  console.error(`[suppliers] ${format(fields)}`);
}

export interface ApprovalLogFields {
  approvalRequestId: string;
  action: string;
  status: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  code?: string;
  detail?: string;
}

export function logApproval(fields: ApprovalLogFields) {
  const parts = [
    `approvalRequestId=${fields.approvalRequestId}`,
    `action=${fields.action}`,
    `status=${fields.status}`,
  ];
  if (fields.actorId) parts.push(`actorId=${fields.actorId}`);
  if (fields.entityType) parts.push(`entityType=${fields.entityType}`);
  if (fields.entityId) parts.push(`entityId=${fields.entityId}`);
  if (fields.code) parts.push(`code=${scrub(fields.code)}`);
  if (fields.detail) parts.push(`detail="${scrub(fields.detail)}"`);
  console.info(`[approvals] ${parts.join(" ")}`);
}
