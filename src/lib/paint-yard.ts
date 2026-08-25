import type {
  CoatingApplicationMethod,
  CoatingOperation,
  PaintJobStage,
  PaintScopeArea,
  PaintTaskStatus,
  VesselHullMaterial,
} from "@/lib/types";

export type PaintYardActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_PAINT_YARD_ACTION_STATE: PaintYardActionState = {
  status: "idle",
  message: "",
};

export const PAINT_JOB_STAGES: Array<{
  value: PaintJobStage;
  label: string;
  shortLabel: string;
}> = [
  { value: "expected", label: "Expected / booked", shortLabel: "Expected" },
  { value: "yard_intake", label: "At yard / intake", shortLabel: "At yard" },
  { value: "wash_mask", label: "Wash & masking", shortLabel: "Wash & mask" },
  { value: "surface_prep", label: "Surface preparation", shortLabel: "Surface prep" },
  { value: "primer", label: "Primer / barrier", shortLabel: "Primer" },
  { value: "coating", label: "Paint / antifouling", shortLabel: "Coating" },
  { value: "cure_qc", label: "Cure & quality control", shortLabel: "Cure & QC" },
  { value: "ready", label: "Ready / invoice", shortLabel: "Ready" },
  { value: "delivered", label: "Delivered", shortLabel: "Delivered" },
  { value: "on_hold", label: "On hold", shortLabel: "On hold" },
  { value: "cancelled", label: "Cancelled", shortLabel: "Cancelled" },
];

export const ACTIVE_PAINT_STAGES: PaintJobStage[] = [
  "expected",
  "yard_intake",
  "wash_mask",
  "surface_prep",
  "primer",
  "coating",
  "cure_qc",
  "ready",
  "on_hold",
];

export const PAINT_SCOPE_AREAS: Array<{ value: PaintScopeArea; label: string }> = [
  { value: "bottom", label: "Bottom / antifouling" },
  { value: "topsides", label: "Topsides" },
  { value: "deck", label: "Deck" },
  { value: "superstructure", label: "Superstructure" },
  { value: "touch_up", label: "Touch-up" },
  { value: "other", label: "Other" },
];

export const HULL_MATERIALS: Array<{ value: VesselHullMaterial; label: string }> = [
  { value: "fiberglass", label: "Fiberglass / GRP" },
  { value: "aluminum", label: "Aluminum" },
  { value: "steel", label: "Steel" },
  { value: "wood", label: "Wood" },
  { value: "composite", label: "Other composite" },
  { value: "unknown", label: "To be confirmed at intake" },
];

export const COATING_OPERATIONS: Array<{ value: CoatingOperation; label: string }> = [
  { value: "cleaner_dewaxer", label: "Cleaner / de-waxer" },
  { value: "filler_fairing", label: "Filler / fairing compound" },
  { value: "primer", label: "Primer" },
  { value: "barrier_coat", label: "Barrier coat" },
  { value: "tie_coat", label: "Tie coat" },
  { value: "topcoat", label: "Topcoat" },
  { value: "antifouling", label: "Antifouling" },
  { value: "clearcoat", label: "Clearcoat" },
  { value: "other", label: "Other coating product" },
];

export const APPLICATION_METHODS: Array<{
  value: CoatingApplicationMethod;
  label: string;
}> = [
  { value: "brush", label: "Brush" },
  { value: "roller", label: "Roller" },
  { value: "spray", label: "Spray" },
  { value: "trowel", label: "Trowel" },
  { value: "wipe", label: "Wipe" },
  { value: "other", label: "Other" },
];

const STAGE_TRANSITIONS: Record<PaintJobStage, PaintJobStage[]> = {
  expected: ["yard_intake", "on_hold"],
  yard_intake: ["expected", "wash_mask", "on_hold"],
  wash_mask: ["yard_intake", "surface_prep", "on_hold"],
  surface_prep: ["wash_mask", "primer", "coating", "on_hold"],
  primer: ["surface_prep", "coating", "on_hold"],
  coating: ["surface_prep", "primer", "cure_qc", "on_hold"],
  cure_qc: ["surface_prep", "coating", "ready", "on_hold"],
  ready: ["cure_qc", "delivered", "on_hold"],
  delivered: [],
  on_hold: [
    "expected",
    "yard_intake",
    "wash_mask",
    "surface_prep",
    "primer",
    "coating",
    "cure_qc",
    "ready",
  ],
  cancelled: [],
};

export function paintStageLabel(stage: PaintJobStage) {
  return PAINT_JOB_STAGES.find(({ value }) => value === stage)?.label ?? stage;
}

export function paintStageShortLabel(stage: PaintJobStage) {
  return PAINT_JOB_STAGES.find(({ value }) => value === stage)?.shortLabel ?? stage;
}

export function paintScopeLabel(scope: PaintScopeArea) {
  return PAINT_SCOPE_AREAS.find(({ value }) => value === scope)?.label ?? scope;
}

export function hullMaterialLabel(material: VesselHullMaterial) {
  return HULL_MATERIALS.find(({ value }) => value === material)?.label ?? material;
}

export function coatingOperationLabel(operation: CoatingOperation) {
  return COATING_OPERATIONS.find(({ value }) => value === operation)?.label ?? operation;
}

export function applicationMethodLabel(method: CoatingApplicationMethod) {
  return APPLICATION_METHODS.find(({ value }) => value === method)?.label ?? method;
}

export function paintTaskStatusLabel(status: PaintTaskStatus) {
  return status === "complete" ? "Complete" : status === "not_applicable" ? "N/A" : "Pending";
}

export function allowedPaintStageTransitions(stage: PaintJobStage, admin: boolean) {
  const targets = [...STAGE_TRANSITIONS[stage]];
  if (admin && !["delivered", "cancelled"].includes(stage)) targets.push("cancelled");
  if (admin && stage === "delivered") targets.push("ready");
  if (admin && stage === "cancelled") targets.push("expected");
  return [...new Set(targets)];
}

export function paintDeadlineState(dueDate: string, stage: PaintJobStage, today: string) {
  if (["delivered", "cancelled"].includes(stage)) return "closed" as const;
  const days = Math.round(
    (new Date(`${dueDate}T12:00:00Z`).valueOf() - new Date(`${today}T12:00:00Z`).valueOf()) /
      86_400_000,
  );
  if (days < 0) return "overdue" as const;
  if (days <= 2) return "due_soon" as const;
  return "on_track" as const;
}

export function isoDateTimeLocal(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
