import type { SupplierId, SupplierSearchStatus } from "@/lib/suppliers/types";

/**
 * Normalized failure vocabulary. Adapters throw these; the search orchestrator
 * turns them into a per-supplier status so one failing portal never breaks the
 * others.
 */
export type SupplierErrorCode =
  | "NOT_FOUND"
  | "AUTH_FAILED"
  | "SESSION_EXPIRED"
  | "SUPPLIER_TIMEOUT"
  | "SUPPLIER_UNAVAILABLE"
  | "PARSING_FAILED"
  | "AUTH_INTERVENTION_REQUIRED"
  | "RATE_LIMITED"
  | "CONFIGURATION_ERROR"
  | "PORTAL_CONTRACT_UNCONFIRMED";

/**
 * Messages shown to CRM users. They never name internal endpoints, selectors or
 * session state — those stay in the server log.
 */
const USER_MESSAGES: Record<SupplierErrorCode, string> = {
  NOT_FOUND: "No matching part at this supplier.",
  AUTH_FAILED: "Could not sign in to this supplier. Check the stored account details.",
  SESSION_EXPIRED: "The supplier session expired. Try the search again.",
  SUPPLIER_TIMEOUT: "This supplier did not respond in time.",
  SUPPLIER_UNAVAILABLE: "This supplier's portal is currently unavailable.",
  PARSING_FAILED: "This supplier's response could not be read.",
  AUTH_INTERVENTION_REQUIRED:
    "This supplier needs a manual sign-in (verification or additional security step).",
  RATE_LIMITED: "This supplier is rate limiting requests. Try again shortly.",
  CONFIGURATION_ERROR: "This supplier is not configured on the server.",
  PORTAL_CONTRACT_UNCONFIRMED:
    "This supplier integration is not activated yet — its portal details still need to be confirmed.",
};

const STATUS_BY_CODE: Record<SupplierErrorCode, SupplierSearchStatus> = {
  NOT_FOUND: "not_found",
  AUTH_FAILED: "auth_failed",
  SESSION_EXPIRED: "auth_failed",
  SUPPLIER_TIMEOUT: "timeout",
  SUPPLIER_UNAVAILABLE: "unavailable",
  PARSING_FAILED: "parsing_failed",
  AUTH_INTERVENTION_REQUIRED: "auth_intervention_required",
  RATE_LIMITED: "rate_limited",
  CONFIGURATION_ERROR: "not_configured",
  PORTAL_CONTRACT_UNCONFIRMED: "portal_contract_unconfirmed",
};

export class SupplierError extends Error {
  readonly code: SupplierErrorCode;
  readonly supplier: SupplierId;
  /** Operator-facing detail for the server log. Never sent to the browser. */
  readonly internalDetail: string | null;

  constructor(
    supplier: SupplierId,
    code: SupplierErrorCode,
    internalDetail?: string | null,
    options?: { cause?: unknown },
  ) {
    super(`${supplier}: ${code}`, options);
    this.name = "SupplierError";
    this.supplier = supplier;
    this.code = code;
    this.internalDetail = internalDetail ?? null;
  }

  /** Text that is safe to return in an API response. */
  get userMessage() {
    return USER_MESSAGES[this.code];
  }

  get searchStatus(): SupplierSearchStatus {
    return STATUS_BY_CODE[this.code];
  }
}

export function isSupplierError(value: unknown): value is SupplierError {
  return value instanceof SupplierError;
}

/**
 * Map anything thrown inside an adapter onto the normalized vocabulary. Unknown
 * failures become SUPPLIER_UNAVAILABLE rather than leaking a raw message.
 */
export function toSupplierError(supplier: SupplierId, caught: unknown): SupplierError {
  if (isSupplierError(caught)) return caught;

  if (caught instanceof DOMException && caught.name === "AbortError") {
    return new SupplierError(supplier, "SUPPLIER_TIMEOUT", "aborted", { cause: caught });
  }
  if (caught instanceof Error) {
    if (caught.name === "AbortError" || caught.name === "TimeoutError") {
      return new SupplierError(supplier, "SUPPLIER_TIMEOUT", caught.name, { cause: caught });
    }
    return new SupplierError(supplier, "SUPPLIER_UNAVAILABLE", caught.message, {
      cause: caught,
    });
  }
  return new SupplierError(supplier, "SUPPLIER_UNAVAILABLE", "unknown failure");
}

export function userMessageForCode(code: SupplierErrorCode) {
  return USER_MESSAGES[code];
}
