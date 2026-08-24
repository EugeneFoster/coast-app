import Link from "next/link";
import { NewInvoiceForm } from "@/components/new-invoice-form";
import { getBillingDirectories } from "@/lib/billing-data";
import { requireBillingManager } from "@/lib/auth";

function dateInVancouver(offsetDays = 0) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localToday = formatter.format(new Date());
  const value = new Date(`${localToday}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

export default async function NewInvoicePage() {
  await requireBillingManager();
  const directories = await getBillingDirectories();
  return (
    <main className="mt-7">
      <Link href="/billing" className="text-sm text-graph hover:text-ink">← Billing</Link>
      <div className="mt-4">
        <h2 className="font-display text-2xl font-medium text-ink">New invoice</h2>
        <p className="mt-1 text-sm text-graph">
          Start from an accepted quote when possible to keep scope and pricing aligned.
        </p>
      </div>
      <div className="mt-6">
        <NewInvoiceForm
          {...directories}
          issueDate={dateInVancouver()}
          dueDate={dateInVancouver(30)}
        />
      </div>
    </main>
  );
}
