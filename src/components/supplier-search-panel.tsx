"use client";

import { useCallback, useState, useTransition } from "react";
import { proposeSupplierChangeAction } from "@/lib/actions/suppliers";
import { formatCad, formatCheckedAt } from "@/lib/approvals";
import { partNumbersMatch } from "@/lib/suppliers/normalize";
import {
  SUPPLIER_IDS,
  SUPPLIER_LABELS,
  type StockStatus,
  type SupplierId,
  type SupplierPartResult,
  type SupplierSearchOutcome,
} from "@/lib/suppliers/types";

type PanelState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "done"; outcome: SupplierSearchOutcome }
  | { phase: "error"; message: string };

interface ExistingMaterial {
  id: string;
  description: string;
  partNumber: string;
  unitCost: number;
}

const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  backorder: "Backorder",
  special_order: "Special order",
  discontinued: "Discontinued",
  unknown: "Availability not published",
};

const MATCH_LABELS: Record<SupplierPartResult["matchType"], string> = {
  exact: "Exact match",
  superseded: "Superseded — number replaced",
  related: "Related suggestion",
};

function initialStates(): Record<SupplierId, PanelState> {
  return Object.fromEntries(SUPPLIER_IDS.map((id) => [id, { phase: "idle" }])) as Record<
    SupplierId,
    PanelState
  >;
}

/** Money that the supplier did not publish shows as a dash, never as zero. */
function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  const formatted = formatCad(value);
  return currency && currency !== "CAD" ? `${formatted} ${currency}` : formatted;
}

export function SupplierSearchPanel({
  workOrderId,
  existingMaterials,
}: {
  workOrderId: string;
  existingMaterials: ExistingMaterial[];
}) {
  const [query, setQuery] = useState("");
  const [states, setStates] = useState<Record<SupplierId, PanelState>>(initialStates);
  const [searched, setSearched] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ status: string; message: string } | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [isProposing, startProposing] = useTransition();

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length < 2) return;

    setSearched(trimmed);
    setProposal(null);
    const matchingMaterial = existingMaterials.find((entry) =>
      partNumbersMatch(entry.partNumber, trimmed),
    );
    setSelectedMaterialId(matchingMaterial?.id ?? "");
    setStates(
      Object.fromEntries(SUPPLIER_IDS.map((id) => [id, { phase: "searching" }])) as Record<
        SupplierId,
        PanelState
      >,
    );

    // One request per supplier so each card resolves on its own — a slow portal
    // never holds up the ones that already answered.
    await Promise.all(
      SUPPLIER_IDS.map(async (id) => {
        try {
          const response = await fetch("/api/suppliers/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: trimmed, suppliers: [id] }),
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            setStates((current) => ({
              ...current,
              [id]: { phase: "error", message: payload.error ?? "Search failed." },
            }));
            return;
          }
          const payload = (await response.json()) as { outcomes: SupplierSearchOutcome[] };
          const outcome = payload.outcomes.find((entry) => entry.supplier === id);
          setStates((current) => ({
            ...current,
            [id]: outcome
              ? { phase: "done", outcome }
              : { phase: "error", message: "No response from this supplier." },
          }));
        } catch {
          setStates((current) => ({
            ...current,
            [id]: { phase: "error", message: "Search failed." },
          }));
        }
      }),
    );
  }, [existingMaterials]);

  const propose = (
    result: SupplierPartResult,
    actionType:
      | "add_work_order_material"
      | "update_work_order_material_cost"
      | "replace_superseded_part",
  ) => {
    startProposing(async () => {
      const state = await proposeSupplierChangeAction({
        actionType,
        supplier: result.supplier,
        partNumber: result.partNumber,
        workOrderId,
        materialEntryId:
          actionType === "add_work_order_material" ? undefined : selectedMaterialId,
        quantity: 1,
      });
      setProposal(state);
    });
  };

  return (
    <section className="rounded border border-rule bg-paper p-4">
      <header>
        <h3 className="font-display text-lg font-medium text-ink">Search suppliers</h3>
        <p className="mt-1 text-sm text-graph">
          Looks up pricing and availability at Mercury, Marine Parts Supply and Western Marine.
          Searching changes nothing — adding, repricing, or replacing a part raises a request
          for approval first.
        </p>
      </header>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={64}
          placeholder="Part number — e.g. 8M0123456 or 18-3214"
          aria-label="Supplier part number"
          className="min-w-0 flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
        />
        <button type="submit" className="btn-primary px-4 py-2 text-sm">
          Search suppliers
        </button>
      </form>

      {existingMaterials.length > 0 && (
        <label className="mt-3 block text-sm text-graph">
          Existing material line for price or supersession proposals
          <select
            value={selectedMaterialId}
            onChange={(event) => setSelectedMaterialId(event.target.value)}
            className="mt-1 block w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          >
            <option value="">None — add as a new line</option>
            {existingMaterials.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.partNumber} · {entry.description} · {formatCad(entry.unitCost)}
              </option>
            ))}
          </select>
        </label>
      )}

      {searched && (
        <div className="mt-4 space-y-3">
          {SUPPLIER_IDS.map((id) => {
            const state = states[id];
            return (
              <div key={id} className="rounded border border-rule p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{SUPPLIER_LABELS[id]}</p>
                  <p className="font-mono text-xs text-graph">
                    {state.phase === "searching" && "Searching…"}
                    {state.phase === "error" && "Unavailable"}
                    {state.phase === "done" &&
                      (state.outcome.results.length > 0
                        ? `${state.outcome.results.length} result${
                            state.outcome.results.length === 1 ? "" : "s"
                          }`
                        : state.outcome.status.replace(/_/g, " "))}
                  </p>
                </div>

                {state.phase === "error" && (
                  <p className="mt-2 text-sm text-graph">{state.message}</p>
                )}

                {state.phase === "done" && state.outcome.results.length === 0 && (
                  <p className="mt-2 text-sm text-graph">
                    {state.outcome.message ?? "No matching part at this supplier."}
                  </p>
                )}

                {state.phase === "done" &&
                  state.outcome.results.map((result) => (
                    <article
                      key={`${result.supplier}-${result.partNumber}`}
                      className="mt-3 border-t border-rule pt-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-mono text-sm text-ink">{result.partNumber}</p>
                        <span
                          className={`font-mono text-xs ${
                            result.exactMatch ? "text-graph" : "text-weld"
                          }`}
                        >
                          {MATCH_LABELS[result.matchType]}
                        </span>
                      </div>

                      {result.description && (
                        <p className="mt-1 text-sm text-ink">{result.description}</p>
                      )}

                      {result.supersededBy && (
                        <p className="mt-1 text-sm text-weld">
                          Replaced by {result.supersededBy}
                        </p>
                      )}
                      {result.supplierSku && result.supplierSku !== result.partNumber && (
                        <p className="mt-1 text-xs text-graph">
                          Supplier SKU {result.supplierSku}
                        </p>
                      )}

                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="inline text-graph">Dealer cost: </dt>
                          <dd className="inline font-mono text-ink">
                            {state.outcome.capabilities.dealerCost
                              ? money(result.dealerCost, result.currency)
                              : "not published"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-graph">List: </dt>
                          <dd className="inline font-mono text-ink">
                            {state.outcome.capabilities.listPrice
                              ? money(result.listPrice, result.currency)
                              : "not published"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-graph">Availability: </dt>
                          <dd className="inline text-ink">
                            {STOCK_LABELS[result.stockStatus]}
                            {result.quantityAvailable !== null
                              ? ` · ${result.quantityAvailable} available`
                              : ""}
                          </dd>
                        </div>
                        {result.warehouse && (
                          <div>
                            <dt className="inline text-graph">Warehouse: </dt>
                            <dd className="inline text-ink">{result.warehouse}</dd>
                          </div>
                        )}
                        {result.eta && (
                          <div>
                            <dt className="inline text-graph">ETA: </dt>
                            <dd className="inline text-ink">{result.eta}</dd>
                          </div>
                        )}
                        {result.manufacturer && (
                          <div>
                            <dt className="inline text-graph">Manufacturer: </dt>
                            <dd className="inline text-ink">{result.manufacturer}</dd>
                          </div>
                        )}
                      </dl>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isProposing}
                          onClick={() => propose(result, "add_work_order_material")}
                          className="btn-primary px-3 py-1.5 text-sm disabled:opacity-60"
                        >
                          {isProposing ? "Sending…" : "Request to add"}
                        </button>
                        {selectedMaterialId &&
                          existingMaterials.some(
                            (entry) =>
                              entry.id === selectedMaterialId &&
                              partNumbersMatch(entry.partNumber, result.partNumber),
                          ) &&
                          result.dealerCost !== null && (
                            <button
                              type="button"
                              disabled={isProposing}
                              onClick={() =>
                                propose(result, "update_work_order_material_cost")
                              }
                              className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-60"
                            >
                              Request cost update
                            </button>
                          )}
                        {selectedMaterialId &&
                          existingMaterials.some(
                            (entry) =>
                              entry.id === selectedMaterialId &&
                              partNumbersMatch(entry.partNumber, result.partNumber),
                          ) &&
                          result.supersededBy && (
                            <button
                              type="button"
                              disabled={isProposing}
                              onClick={() => propose(result, "replace_superseded_part")}
                              className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-60"
                            >
                              Request replacement
                            </button>
                          )}
                        {result.productUrl && (
                          <a
                            href={result.productUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="btn-secondary px-3 py-1.5 text-sm"
                          >
                            Open at supplier
                          </a>
                        )}
                        <span className="font-mono text-xs text-graph">
                          {formatCheckedAt(result.checkedAt)}
                          {state.outcome.cached ? " · cached" : ""}
                        </span>
                      </div>
                    </article>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {proposal && (
        <p
          className={`mt-3 text-sm ${proposal.status === "error" ? "text-weld" : "text-graph"}`}
          aria-live="polite"
        >
          {proposal.message}
        </p>
      )}
    </section>
  );
}
