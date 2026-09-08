"use client";

import Link from "next/link";
import { CloudDownload, PackageCheck, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { syncSupplierOrdersAction } from "@/lib/actions/supplier-orders";
import { syncXeroInventoryAction } from "@/lib/actions/xero";

type XeroStatus =
  | { connected: false }
  | {
      connected: true;
      tenant_name?: string | null;
      last_item_pull_at?: string | null;
      last_success_at?: string | null;
      last_error?: string | null;
    };

function timeLabel(value?: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function IntegrationSyncPanel({
  xero,
  canManage,
  inboundOrders,
}: {
  xero: XeroStatus;
  canManage: boolean;
  inboundOrders: number;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMessage("");
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
    });
  }

  return (
    <section className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-[4px] border border-rule bg-paper p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-graph">Accounting catalogue</p>
            <h2 className="mt-1.5 font-display text-lg font-medium text-ink">Xero {xero.connected ? "connected" : "not connected"}</h2>
          </div>
          <CloudDownload size={20} className={xero.connected ? "text-emerald-700" : "text-graph"} aria-hidden />
        </div>
        <p className="mt-2 text-xs leading-5 text-graph">
          {xero.connected
            ? `${xero.tenant_name ?? "Xero organisation"} · ${timeLabel(xero.last_item_pull_at)}`
            : "Connect once to import every Xero item. CRM catalogue edits are pushed back automatically."}
        </p>
        {xero.connected && xero.last_error && <p className="mt-2 text-xs text-weld-text">{xero.last_error}</p>}
        {canManage && (
          <div className="mt-3 flex flex-wrap gap-2">
            {xero.connected ? (
              <button type="button" disabled={pending} onClick={() => run(syncXeroInventoryAction)} className="btn-secondary flex h-9 items-center gap-2 px-3 text-xs disabled:opacity-50">
                <RefreshCw size={14} className={pending ? "animate-spin" : ""} aria-hidden />
                Sync Xero now
              </button>
            ) : (
              <Link href="/api/xero/connect" className="btn-primary flex h-9 items-center px-3 text-xs">Connect Xero</Link>
            )}
          </div>
        )}
      </div>

      <div className="rounded-[4px] border border-rule bg-paper p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-graph">Inbound purchasing</p>
            <h2 className="mt-1.5 font-display text-lg font-medium text-ink">{inboundOrders} supplier orders in transit</h2>
          </div>
          <PackageCheck size={20} className="text-weld-text" aria-hidden />
        </div>
        <p className="mt-2 text-xs leading-5 text-graph">
          Marine Parts Supply backorders are available now. Web-order and shipment tracking will activate when the supplier grants this dealer account the required permission.
        </p>
        {canManage && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(syncSupplierOrdersAction)} className="btn-secondary flex h-9 items-center gap-2 px-3 text-xs disabled:opacity-50">
              <RefreshCw size={14} className={pending ? "animate-spin" : ""} aria-hidden />
              Sync supplier data
            </button>
            <Link href="/inventory/purchase-orders" className="flex h-9 items-center px-2 text-xs font-medium text-weld-text">View delivery statuses</Link>
          </div>
        )}
      </div>
      {message && <p className="lg:col-span-2 rounded-[4px] border border-rule bg-paper px-3 py-2 text-xs text-ink" aria-live="polite">{message}</p>}
    </section>
  );
}
