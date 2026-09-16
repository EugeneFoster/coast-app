export type PackageEvidence = { units: number; source: string };

/** Manufacturer catalogue entries priced as a package, while our matching stock is sold by ea. */
const VERIFIED_PACKAGES: Record<string, PackageEvidence> = {
  "18-24301-9": {
    units: 50,
    source: "https://shop.toadmarinesupply.com/utility/includes/content/sierra/catalogpages/8025-343.pdf",
  },
  "18-2341-1-9": {
    units: 8,
    source: "https://www.marineparts-online.ch/images/content/pdf-kataloge/Komplet_582-864.pdf",
  },
};

/** Only explicit package wording is evidence; SKU suffixes and price ratios are not. */
export function packageEvidence(supplier: string, partNumber: string, description: string | null): PackageEvidence | null {
  if (supplier !== "marinepartssupply") return null;
  const verified = VERIFIED_PACKAGES[partNumber.trim().replace(/\s+/g, " ").toUpperCase()];
  if (verified) return verified;
  if (!description || !/\b(?:priced|price)\s*(?:per|by)\s*(?:pkg\.?|package|pack)\b/i.test(description)) return null;
  const matches = [
    /\b(?:pkg\.?|package|pack)\s*(?:of|contains|:)?\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*[- ]?\s*(?:pk|pack|pieces|pcs)\b/i,
  ].map((pattern) => pattern.exec(description)).filter((match): match is RegExpExecArray => Boolean(match));
  if (matches.length !== 1) return null;
  const units = Number(matches[0][1]);
  if (!Number.isInteger(units) || units < 2 || units > 500) return null;
  return { units, source: "Marine Parts Supply dealer catalogue description" };
}

export function suspiciousPackageDifference(currentSell: number | null, dealerCost: number | null, listPrice: number | null) {
  if (currentSell === null || listPrice === null || currentSell <= 0) return false;
  return listPrice >= currentSell * 3 && (dealerCost === null || dealerCost > currentSell);
}
