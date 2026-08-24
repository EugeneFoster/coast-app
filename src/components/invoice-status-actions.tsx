"use client";

import { useActionState } from "react";
import { updateInvoiceStatusAction } from "@/lib/actions/billing";
import { INITIAL_BILLING_ACTION_STATE } from "@/lib/billing";
import type { InvoiceStatus } from "@/lib/types";

export function InvoiceStatusActions({
  invoiceId,
  status,
  amountPaid,
  hasStockLines,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  amountPaid: number;
  hasStockLines: boolean;
}) {
  const updateStatus = updateInvoiceStatusAction.bind(null, invoiceId);
  const [state, action, pending] = useActionState(
    updateStatus,
    INITIAL_BILLING_ACTION_STATE,
  );

  return (
    <form action={action} className="print-hidden mt-10 border-t border-rule pt-6">
      <div className="flex flex-wrap gap-3">
        {status === "draft" && (
          <>
            <button
              type="submit"
              name="next_status"
              value="sent"
              disabled={pending}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {pending
                ? "Updating…"
                : hasStockLines
                  ? "Mark sent & issue stock"
                  : "Mark sent"}
            </button>
            <button
              type="submit"
              name="next_status"
              value="void"
              disabled={pending}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
            >
              Void draft
            </button>
          </>
        )}
        {status === "sent" && amountPaid === 0 && (
          <button
            type="submit"
            name="next_status"
            value="void"
            disabled={pending}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
          >
            {hasStockLines ? "Void invoice & return stock" : "Void unpaid invoice"}
          </button>
        )}
        {status === "void" && (
          <button
            type="submit"
            name="next_status"
            value="draft"
            disabled={pending}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
          >
            Reopen as draft
          </button>
        )}
      </div>
      {hasStockLines && status === "draft" && (
        <p className="mt-3 text-xs text-graph">
          Sending is atomic: if any linked SKU is short, the invoice remains Draft and no stock is issued.
        </p>
      )}
      {state.message && (
        <p
          className={`mt-3 text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
