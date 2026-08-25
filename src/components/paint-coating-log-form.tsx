"use client";

import { useActionState } from "react";
import { logPaintCoatingAction } from "@/lib/actions/paint-yard";
import {
  APPLICATION_METHODS,
  COATING_OPERATIONS,
  INITIAL_PAINT_YARD_ACTION_STATE,
  isoDateTimeLocal,
  PAINT_SCOPE_AREAS,
} from "@/lib/paint-yard";

export function PaintCoatingLogForm({
  jobId,
  projectId,
  workOrderId,
  allowedAreas,
  canViewFinancials,
}: {
  jobId: string;
  projectId: string;
  workOrderId: string;
  allowedAreas: string[];
  canViewFinancials: boolean;
}) {
  const submit = logPaintCoatingAction.bind(null, jobId, projectId, workOrderId);
  const [state, action, pending] = useActionState(submit, INITIAL_PAINT_YARD_ACTION_STATE);
  const inputClass = "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink disabled:opacity-50";
  const areas = PAINT_SCOPE_AREAS.filter(({ value }) => allowedAreas.includes(value));

  return (
    <form action={action} className="rounded border border-rule bg-bone p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-weld">Traceability</p>
        <h2 className="mt-2 font-display text-xl font-medium text-ink">Log coating / product use</h2>
        <p className="mt-2 text-sm leading-6 text-graph">
          One immutable record per product or layer. Vancouver application time is converted in Postgres.
        </p>
      </div>
      {state.message && (
        <p className={`mt-4 rounded border px-3 py-2 text-sm ${state.status === "error" ? "border-weld/40 bg-weld/10 text-weld" : "border-rule bg-paper text-ink"}`} aria-live="polite">
          {state.message}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium text-ink">Area<select name="area" required defaultValue={areas[0]?.value ?? ""} disabled={pending} className={inputClass}>{areas.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}</select></label>
        <label className="text-xs font-medium text-ink">Operation<select name="operation" required defaultValue="primer" disabled={pending} className={inputClass}>{COATING_OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}</select></label>
        <label className="text-xs font-medium text-ink">Pass / coat number<input name="coat_number" type="number" min="1" max="20" step="1" required defaultValue="1" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Applied at (Vancouver)<input name="applied_local" type="datetime-local" required defaultValue={isoDateTimeLocal()} disabled={pending} className={inputClass} /></label>

        <label className="text-xs font-medium text-ink">Manufacturer<input name="manufacturer" required maxLength={120} placeholder="International, Awlgrip, Pettit…" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Product name<input name="product_name" required maxLength={160} placeholder="InterProtect, Hydrocoat…" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Product code<input name="product_code" maxLength={80} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Batch / lot<input name="batch_lot" required maxLength={100} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Color<input name="color" maxLength={100} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Quantity used<input name="quantity_used" type="number" min="0.001" step="0.001" required disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Unit<input name="quantity_unit" required maxLength={20} defaultValue="L" disabled={pending} className={inputClass} /></label>
        {canViewFinancials ? (
          <label className="text-xs font-medium text-ink">Unit cost<input name="unit_cost" type="number" min="0" step="0.01" required defaultValue="0" disabled={pending} className={inputClass} /></label>
        ) : (
          <input type="hidden" name="unit_cost" value="0" />
        )}
        <label className="text-xs font-medium text-ink">Mix ratio<input name="mix_ratio" maxLength={80} placeholder="2:1 by volume" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Reducer / thinner<input name="reducer_thinner" maxLength={120} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Application method<select name="application_method" defaultValue="roller" disabled={pending} className={inputClass}>{APPLICATION_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>

        <label className="text-xs font-medium text-ink">Ambient °C<input name="ambient_temp_c" type="number" min="-30" max="70" step="0.1" placeholder="18" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Substrate °C<input name="substrate_temp_c" type="number" min="-30" max="90" step="0.1" placeholder="17" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Relative humidity %<input name="relative_humidity_pct" type="number" min="0" max="100" step="0.1" placeholder="65" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Dew point °C<input name="dew_point_c" type="number" min="-40" max="60" step="0.1" placeholder="10" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Wet film (mils)<input name="wet_film_mils" type="number" min="0.01" step="0.01" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Dry film (mils)<input name="dry_film_mils" type="number" min="0.01" step="0.01" disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink sm:col-span-2">Application / recoat note<input name="note" maxLength={1000} placeholder="Pot life, induction time, recoat target, coverage observation…" disabled={pending} className={inputClass} /></label>
      </div>

      <fieldset className="mt-5 rounded border border-rule bg-paper p-4">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink">Required release checks</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="flex items-start gap-2 text-xs leading-5 text-graph"><input name="tds_checked" type="checkbox" required disabled={pending} className="mt-1" />Current product TDS checked</label>
          <label className="flex items-start gap-2 text-xs leading-5 text-graph"><input name="sds_checked" type="checkbox" required disabled={pending} className="mt-1" />SDS / hazards checked</label>
          <label className="flex items-start gap-2 text-xs leading-5 text-graph"><input name="ppe_checked" type="checkbox" required disabled={pending} className="mt-1" />PPE appropriate</label>
          <label className="flex items-start gap-2 text-xs leading-5 text-graph"><input name="ventilation_checked" type="checkbox" required disabled={pending} className="mt-1" />Ventilation / containment safe</label>
          <label className="flex items-start gap-2 text-xs leading-5 text-graph"><input name="surface_clean_dry" type="checkbox" required disabled={pending} className="mt-1" />Surface sound, clean & dry</label>
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending || areas.length === 0} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Logging…" : "Log product + material cost"}
        </button>
        <p className="text-xs text-graph">Substrate must be at least 3°C above recorded dew point.</p>
      </div>
    </form>
  );
}
