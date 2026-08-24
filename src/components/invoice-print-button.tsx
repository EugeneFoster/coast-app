"use client";

export function InvoicePrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary px-4 py-2 text-sm print-hidden">
      Print / save PDF
    </button>
  );
}
