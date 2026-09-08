/**
 * Shared vocabulary for the supplier intelligence layer.
 *
 * Nothing in this module touches credentials or the network — it is safe to
 * import from client components when only the types are needed. Anything that
 * reads supplier credentials lives in `./config` and is server-only.
 */

export const SUPPLIER_IDS = ["mercury", "marinepartssupply", "westernmarine"] as const;

export type SupplierId = (typeof SUPPLIER_IDS)[number];

const supplierIdSet = new Set<string>(SUPPLIER_IDS);

export function isSupplierId(value: unknown): value is SupplierId {
  return typeof value === "string" && supplierIdSet.has(value);
}

export const SUPPLIER_LABELS: Record<SupplierId, string> = {
  mercury: "Mercury",
  marinepartssupply: "Marine Parts Supply",
  westernmarine: "Western Marine",
};

/**
 * Availability is deliberately coarse. Suppliers describe stock in wildly
 * different ways, and inventing a finer scale would imply precision we do not
 * have. `unknown` is used whenever the portal does not say.
 */
export type StockStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "backorder"
  | "special_order"
  | "discontinued"
  | "unknown";

/**
 * How a result relates to what the user typed.
 *
 * - `exact`      — the supplier returned the same part number that was searched.
 * - `superseded` — the searched number is retired and the supplier named a
 *                  replacement. `supersededBy` carries the new number.
 * - `related`    — a fuzzy/suggested match. Never present these as exact.
 */
export type MatchType = "exact" | "superseded" | "related";

/**
 * The single shape every adapter returns. A field is `null` when the supplier
 * does not publish it — adapters must never invent a value to fill a gap.
 */
export interface SupplierPartResult {
  supplier: SupplierId;
  supplierName: string;

  /** Exactly what the caller searched for, after whitespace normalization. */
  searchedPartNumber: string;

  /** The manufacturer / OEM part number this result describes. */
  partNumber: string;

  /**
   * The supplier's own catalogue number, when it differs from the manufacturer
   * part number. Kept separate so a Western Marine SKU is never mistaken for an
   * OEM number.
   */
  supplierSku: string | null;

  description: string | null;
  manufacturer: string | null;
  brand: string | null;

  /** Account/dealer price. */
  dealerCost: number | null;
  /** Published list / MSRP / retail price. */
  listPrice: number | null;
  /** ISO 4217, e.g. "CAD". Null when the portal does not state a currency. */
  currency: string | null;

  stockStatus: StockStatus;
  quantityAvailable: number | null;
  warehouse: string | null;
  /** Free-text or ISO date, exactly as the supplier expressed it. */
  eta: string | null;
  backorder: boolean | null;

  /** Set when the searched number is retired in favour of another. */
  supersededBy: string | null;
  /** Older numbers this part replaces, when the supplier lists them. */
  replaces: string[];

  productUrl: string | null;
  imageUrl: string | null;

  matchType: MatchType;
  /** Convenience mirror of `matchType === "exact"`. */
  exactMatch: boolean;

  /** ISO timestamp of when this data was actually read from the supplier. */
  checkedAt: string;
}

/**
 * What a given portal can actually tell us. The UI reads this to distinguish
 * "this supplier does not publish quantities" from "quantity is zero".
 */
export interface SupplierCapabilities {
  dealerCost: boolean;
  listPrice: boolean;
  availability: boolean;
  quantity: boolean;
  supersession: boolean;
  images: boolean;
  warehouse: boolean;
  eta: boolean;
  supplierSku: boolean;
  /** Whether authenticated purchasing/delivery data can be imported. */
  orders?: boolean;
}

export const NO_CAPABILITIES: SupplierCapabilities = {
  dealerCost: false,
  listPrice: false,
  availability: false,
  quantity: false,
  supersession: false,
  images: false,
  warehouse: false,
  eta: false,
  supplierSku: false,
};

export type SupplierHealthState =
  | "ready"
  | "not_configured"
  | "portal_contract_unconfirmed"
  | "auth_intervention_required"
  | "unreachable";

export interface SupplierHealth {
  supplier: SupplierId;
  supplierName: string;
  state: SupplierHealthState;
  /** Operator-facing detail. Never contains credentials or session material. */
  detail: string;
  checkedAt: string;
}

/**
 * Every supplier integration implements this. Supplier-specific selectors,
 * endpoints and quirks belong inside the adapter and nowhere else.
 */
export interface SupplierAdapter {
  readonly id: SupplierId;
  readonly name: string;
  readonly capabilities: SupplierCapabilities;

  /** True when every required environment variable is present. */
  isConfigured(): boolean;

  /**
   * Establish a session. Callers normally rely on `searchPart` to do this
   * lazily; it is exposed for health checks and warm-up.
   */
  ensureAuthenticated(signal?: AbortSignal): Promise<void>;

  searchPart(partNumber: string, signal?: AbortSignal): Promise<SupplierPartResult[]>;

  getPartDetails(
    partNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult | null>;

  /** Optional authenticated inbound-order feed. Never places an order. */
  listInboundOrders?(signal?: AbortSignal): Promise<SupplierInboundOrder[]>;

  healthCheck(signal?: AbortSignal): Promise<SupplierHealth>;

  /** Release sessions/resources. Safe to call repeatedly. */
  close(): Promise<void>;
}

export type SupplierDeliveryStatus =
  | "ordered"
  | "confirmed"
  | "processing"
  | "backordered"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "unknown";

export interface SupplierInboundOrderItem {
  externalLineId: string;
  partNumber: string;
  description: string;
  quantity: number;
  quantityShipped: number;
  quantityBackordered: number;
  unitPrice: number;
}

export interface SupplierInboundOrder {
  supplier: SupplierId;
  externalId: string;
  orderNumber: string;
  purchaseOrderNumber: string | null;
  status: SupplierDeliveryStatus;
  rawStatus: string | null;
  orderedAt: string;
  expectedAt: string | null;
  subtotal: number;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  items: SupplierInboundOrderItem[];
}

/** Per-supplier outcome of one search fan-out. */
export type SupplierSearchStatus =
  | "success"
  | "not_found"
  | "auth_failed"
  | "auth_intervention_required"
  | "timeout"
  | "unavailable"
  | "parsing_failed"
  | "rate_limited"
  | "not_configured"
  | "portal_contract_unconfirmed";

export interface SupplierSearchOutcome {
  supplier: SupplierId;
  supplierName: string;
  status: SupplierSearchStatus;
  /** Safe, user-facing text. Internal detail stays in the server log. */
  message: string | null;
  results: SupplierPartResult[];
  capabilities: SupplierCapabilities;
  /** Whether these results came from the short-lived lookup cache. */
  cached: boolean;
  checkedAt: string;
  durationMs: number;
}

export interface SupplierSearchResponse {
  query: string;
  normalizedQuery: string;
  results: SupplierPartResult[];
  supplierStatus: Record<string, SupplierSearchStatus>;
  outcomes: SupplierSearchOutcome[];
}
