import type {
  CounterSaleStatus,
  InvoicePaymentMethod,
} from "@/lib/types";

export type CounterSaleActionState = {
  status: "idle" | "error";
  message: string;
};

export const INITIAL_COUNTER_SALE_ACTION_STATE: CounterSaleActionState = {
  status: "idle",
  message: "",
};

export const COUNTER_SALE_PAYMENT_METHODS: Array<{
  value: InvoicePaymentMethod;
  label: string;
}> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "e_transfer", label: "E-transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

const paymentMethodValues = new Set(
  COUNTER_SALE_PAYMENT_METHODS.map(({ value }) => value),
);

export function isCounterSalePaymentMethod(
  value: string,
): value is InvoicePaymentMethod {
  return paymentMethodValues.has(value as InvoicePaymentMethod);
}

export function counterSalePaymentMethodLabel(method: InvoicePaymentMethod) {
  return COUNTER_SALE_PAYMENT_METHODS.find(({ value }) => value === method)?.label ?? method;
}

export function counterSaleStatusLabel(status: CounterSaleStatus) {
  return status === "completed" ? "Paid" : "Void";
}
