import type {
  ClientType,
  EstimateItemType,
  EstimateStatus,
  LeadSource,
  OpportunityStatus,
  ServiceCategory,
} from "@/lib/types";

export type SalesActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_SALES_ACTION_STATE: SalesActionState = {
  status: "idle",
  message: "",
};

export const CLIENT_TYPES: Array<{ value: ClientType; label: string }> = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
];

export const OPPORTUNITY_STATUSES: Array<{
  value: OpportunityStatus;
  label: string;
}> = [
  { value: "new", label: "New lead" },
  { value: "qualified", label: "Qualified" },
  { value: "estimating", label: "Estimating" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const LEAD_SOURCES: Array<{ value: LeadSource; label: string }> = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "walk_in", label: "Walk-in" },
  { value: "repeat", label: "Repeat customer" },
  { value: "other", label: "Other" },
];

export const SERVICE_CATEGORIES: Array<{
  value: ServiceCategory;
  label: string;
}> = [
  { value: "boat_repair", label: "Boat repair" },
  { value: "marine_fabrication", label: "Marine fabrication" },
  { value: "dock_wharf", label: "Dock / wharf" },
  { value: "boat_painting", label: "Boat painting" },
  { value: "marine_mechanics", label: "Marine mechanics" },
  { value: "parts", label: "Parts" },
  { value: "cad_design", label: "CAD design" },
  { value: "haul_transport", label: "Haul & transport" },
  { value: "other", label: "Other" },
];

export const ESTIMATE_STATUSES: Array<{
  value: EstimateStatus;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
];

export const ESTIMATE_ITEM_TYPES: Array<{
  value: EstimateItemType;
  label: string;
}> = [
  { value: "labor", label: "Labor" },
  { value: "material", label: "Material" },
  { value: "part", label: "Part" },
  { value: "subcontract", label: "Subcontract" },
  { value: "other", label: "Other" },
];

function valuesOf<T extends string>(items: Array<{ value: T }>) {
  return new Set<T>(items.map(({ value }) => value));
}

const clientTypes = valuesOf(CLIENT_TYPES);
const opportunityStatuses = valuesOf(OPPORTUNITY_STATUSES);
const leadSources = valuesOf(LEAD_SOURCES);
const serviceCategories = valuesOf(SERVICE_CATEGORIES);
const estimateStatuses = valuesOf(ESTIMATE_STATUSES);
const estimateItemTypes = valuesOf(ESTIMATE_ITEM_TYPES);

export function isClientType(value: string): value is ClientType {
  return clientTypes.has(value as ClientType);
}
export function isOpportunityStatus(value: string): value is OpportunityStatus {
  return opportunityStatuses.has(value as OpportunityStatus);
}
export function isLeadSource(value: string): value is LeadSource {
  return leadSources.has(value as LeadSource);
}
export function isServiceCategory(value: string): value is ServiceCategory {
  return serviceCategories.has(value as ServiceCategory);
}
export function isEstimateStatus(value: string): value is EstimateStatus {
  return estimateStatuses.has(value as EstimateStatus);
}
export function isEstimateItemType(value: string): value is EstimateItemType {
  return estimateItemTypes.has(value as EstimateItemType);
}

export function opportunityStatusLabel(status: OpportunityStatus) {
  return OPPORTUNITY_STATUSES.find(({ value }) => value === status)?.label ?? status;
}
export function estimateStatusLabel(status: EstimateStatus) {
  return ESTIMATE_STATUSES.find(({ value }) => value === status)?.label ?? status;
}
export function serviceCategoryLabel(category: ServiceCategory) {
  return SERVICE_CATEGORIES.find(({ value }) => value === category)?.label ?? category;
}

export function formatCad(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}
