import type {
  InvoicePaymentMethod,
  InvoicePaymentType,
  InvoiceStatus,
} from "@/lib/types";

export type BillingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type BillingInventoryOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
  selling_price: number | null;
};

export const INITIAL_BILLING_ACTION_STATE: BillingActionState = {
  status: "idle",
  message: "",
};

export const INVOICE_STATUSES: Array<{ value: InvoiceStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

export const INVOICE_PAYMENT_TYPES: Array<{
  value: InvoicePaymentType;
  label: string;
}> = [
  { value: "deposit", label: "Deposit" },
  { value: "payment", label: "Payment" },
];

export const INVOICE_PAYMENT_METHODS: Array<{
  value: InvoicePaymentMethod;
  label: string;
}> = [
  { value: "e_transfer", label: "E-transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

const invoiceStatuses = new Set(INVOICE_STATUSES.map(({ value }) => value));
const paymentTypes = new Set(INVOICE_PAYMENT_TYPES.map(({ value }) => value));
const paymentMethods = new Set(INVOICE_PAYMENT_METHODS.map(({ value }) => value));

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return invoiceStatuses.has(value as InvoiceStatus);
}

export function isInvoicePaymentType(value: string): value is InvoicePaymentType {
  return paymentTypes.has(value as InvoicePaymentType);
}

export function isInvoicePaymentMethod(value: string): value is InvoicePaymentMethod {
  return paymentMethods.has(value as InvoicePaymentMethod);
}

export function invoiceStatusLabel(status: InvoiceStatus) {
  return INVOICE_STATUSES.find(({ value }) => value === status)?.label ?? status;
}

export function invoicePaymentTypeLabel(type: InvoicePaymentType) {
  return INVOICE_PAYMENT_TYPES.find(({ value }) => value === type)?.label ?? type;
}

export function invoicePaymentMethodLabel(method: InvoicePaymentMethod) {
  return INVOICE_PAYMENT_METHODS.find(({ value }) => value === method)?.label ?? method;
}
