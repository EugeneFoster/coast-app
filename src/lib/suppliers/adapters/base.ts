import {
  getSupplierCredentials,
  isSupplierConfigured,
  missingEnvKeys,
  type SupplierCredentials,
} from "@/lib/suppliers/config";
import { SupplierError } from "@/lib/suppliers/errors";
import { resolveAgainstBase, supplierFetch, type SupplierRequestInit, type SupplierResponse } from "@/lib/suppliers/http";
import {
  SupplierSessionManager,
  type LoginResult,
  type SupplierSession,
} from "@/lib/suppliers/session";
import {
  SUPPLIER_LABELS,
  type SupplierAdapter,
  type SupplierCapabilities,
  type SupplierHealth,
  type SupplierId,
  type SupplierPartResult,
} from "@/lib/suppliers/types";
import { partNumbersMatch } from "@/lib/suppliers/normalize";

/**
 * What we must know about a portal before its adapter can run for real.
 *
 * Supplier portals are not documented APIs. Rather than guess at selectors and
 * ship an integration that silently returns wrong prices, each adapter declares
 * the flow it expects and whether that flow has actually been verified against
 * the live portal. Until `confirmed` is true the adapter refuses to search and
 * reports `PORTAL_CONTRACT_UNCONFIRMED`, which the search fan-out surfaces as a
 * per-supplier status without affecting the other suppliers.
 *
 * Activating a supplier is therefore a data change (fill in the paths, set
 * `confirmed: true`) plus a parser — not an architecture change.
 */
export interface PortalContract {
  /** Flip to true only once the flow below has been verified end to end. */
  readonly confirmed: boolean;
  /** Path (relative to the configured base URL) that renders the login form. */
  readonly loginPath: string | null;
  /** Path that accepts the login POST. */
  readonly loginSubmitPath: string | null;
  /** Form field names for the credentials. */
  readonly loginFields: { user: string; password: string } | null;
  /** Path used to search for a part number. */
  readonly searchPath: string | null;
  /** A cheap authenticated path used to test whether a session is still alive. */
  readonly sessionProbePath: string | null;
  /** Exactly what an operator still has to confirm. Shown in health checks. */
  readonly openQuestions: readonly string[];
}

export abstract class BaseSupplierAdapter implements SupplierAdapter {
  abstract readonly id: SupplierId;
  abstract readonly capabilities: SupplierCapabilities;
  abstract readonly contract: PortalContract;

  private sessionManager: SupplierSessionManager | null = null;

  get name() {
    return SUPPLIER_LABELS[this.id];
  }

  protected get sessions() {
    if (!this.sessionManager) {
      this.sessionManager = new SupplierSessionManager(this.id);
    }
    return this.sessionManager;
  }

  isConfigured(): boolean {
    return isSupplierConfigured(this.id);
  }

  /** Credentials, or a thrown CONFIGURATION_ERROR naming the missing vars. */
  protected requireCredentials(): SupplierCredentials {
    const credentials = getSupplierCredentials(this.id);
    if (!credentials) {
      const missing = missingEnvKeys(this.id);
      throw new SupplierError(
        this.id,
        "CONFIGURATION_ERROR",
        missing.length > 0
          ? `missing environment variables: ${missing.join(", ")}`
          : "supplier base URL is not a valid https URL",
      );
    }
    return credentials;
  }

  /**
   * Guard every outward call. Adapters never run against an unconfigured
   * deployment or an unverified portal contract.
   */
  protected assertReady() {
    this.requireCredentials();
    if (!this.contract.confirmed) {
      throw new SupplierError(
        this.id,
        "PORTAL_CONTRACT_UNCONFIRMED",
        `portal flow not yet verified; open questions: ${this.contract.openQuestions.length}`,
      );
    }
  }

  /** Build a URL inside the configured origin. Never accepts caller input. */
  protected url(path: string): string {
    const { baseUrl } = this.requireCredentials();
    return resolveAgainstBase(this.id, baseUrl, path);
  }

  protected request(
    session: SupplierSession,
    path: string,
    init: SupplierRequestInit = {},
  ): Promise<SupplierResponse> {
    return supplierFetch(this.id, this.url(path), { ...init, jar: session.jar });
  }

  /** Authenticate against the portal and return the resulting session material. */
  protected abstract login(signal?: AbortSignal): Promise<LoginResult>;

  /** Perform the actual lookup. Called with a live session. */
  protected abstract performSearch(
    session: SupplierSession,
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult[]>;

  async ensureAuthenticated(signal?: AbortSignal): Promise<void> {
    this.assertReady();
    await this.sessions.acquire((s) => this.login(s), signal);
  }

  async searchPart(
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult[]> {
    this.assertReady();
    return this.sessions.run(
      (s) => this.login(s),
      (session) => this.performSearch(session, normalizedPartNumber, signal),
      signal,
    );
  }

  /**
   * Default detail lookup: search, then prefer an exact hit, then a
   * supersession, then nothing. Adapters with a dedicated detail endpoint
   * should override.
   */
  async getPartDetails(
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult | null> {
    const results = await this.searchPart(normalizedPartNumber, signal);
    const exact = results.find(
      (result) =>
        result.exactMatch && partNumbersMatch(result.partNumber, normalizedPartNumber),
    );
    if (exact) return exact;
    return results.find((result) => result.matchType === "superseded") ?? null;
  }

  async healthCheck(signal?: AbortSignal): Promise<SupplierHealth> {
    const checkedAt = new Date().toISOString();
    const base = { supplier: this.id, supplierName: this.name, checkedAt } as const;

    if (!this.isConfigured()) {
      const missing = missingEnvKeys(this.id);
      return {
        ...base,
        state: "not_configured",
        detail:
          missing.length > 0
            ? `Missing environment variables: ${missing.join(", ")}.`
            : "Supplier base URL is not a valid https URL.",
      };
    }

    if (!this.contract.confirmed) {
      return {
        ...base,
        state: "portal_contract_unconfirmed",
        detail: `Portal flow not verified. Outstanding: ${this.contract.openQuestions.join(" ")}`,
      };
    }

    try {
      await this.ensureAuthenticated(signal);
      return { ...base, state: "ready", detail: "Authenticated session available." };
    } catch (caught) {
      if (caught instanceof SupplierError) {
        if (caught.code === "AUTH_INTERVENTION_REQUIRED") {
          return {
            ...base,
            state: "auth_intervention_required",
            detail: caught.userMessage,
          };
        }
        return { ...base, state: "unreachable", detail: caught.userMessage };
      }
      return { ...base, state: "unreachable", detail: "Portal could not be reached." };
    }
  }

  async close(): Promise<void> {
    this.sessionManager?.close();
    this.sessionManager = null;
  }
}
