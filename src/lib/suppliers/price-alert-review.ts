/** A large proposed jump while our current price is below dealer Net may be a unit or mapping error. */
export function requiresPriceAlertReview(
  currentSellingPrice: number | null,
  dealerCost: number | null,
  suggestedSellingPrice: number | null,
) {
  if (currentSellingPrice === null || dealerCost === null || suggestedSellingPrice === null) return false;
  if (dealerCost <= currentSellingPrice || suggestedSellingPrice <= currentSellingPrice) return false;
  return currentSellingPrice === 0 || suggestedSellingPrice >= currentSellingPrice * 3;
}
