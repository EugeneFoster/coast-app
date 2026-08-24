import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationPaths = [
  "supabase/migrations/20260824000001_billing_invoices.sql",
  "supabase/migrations/20260824000002_billing_integrity_hardening.sql",
  "supabase/migrations/20260824000003_void_invoice_balance.sql",
];
const migrationSql = (
  await Promise.all(migrationPaths.map((path) => readFile(path, "utf8")))
).join("\n");
const { client, projectRef } = await connectToSupabaseDatabase();

async function assumeAuthenticatedUser(profileId) {
  const claims = JSON.stringify({ sub: profileId, role: "authenticated" });
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    profileId,
  ]);
  await client.query(
    "select set_config('request.jwt.claim.role', 'authenticated', true)",
  );
}

async function assumeDatabaseOwner() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
}

async function expectFailure(label, callback) {
  const savepoint = `check_${label.replaceAll(/[^a-z0-9]/gi, "_")}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await callback();
  } catch {
    await client.query(`rollback to savepoint ${savepoint}`);
    return;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  throw new Error(`${label} was not blocked.`);
}

async function expectNoRows(label, callback) {
  const result = await callback();
  if (result.rowCount !== 0) {
    throw new Error(`${label} changed ${result.rowCount} row(s).`);
  }
}

function expectMoney(actual, expected, label) {
  if (Number(actual) !== expected) {
    throw new Error(`${label} expected ${expected}, received ${actual}.`);
  }
}

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id
    from public.profiles
    where status = 'active'
    order by created_at
    limit 1
  `);
  const profile = profileRows[0];
  if (!profile) throw new Error("An active employee is required.");

  await client.query("update public.profiles set role = 'owner' where id = $1", [
    profile.id,
  ]);

  const testId = crypto.randomUUID();
  const { rows: clientRows } = await client.query(
    `insert into public.clients (name, type, created_by)
     values ($1, 'business', $2) returning id`,
    [`P5 customer ${testId}`, profile.id],
  );
  const clientId = clientRows[0].id;

  const { rows: projectRows } = await client.query(
    `insert into public.projects (name, client_id, status, created_by)
     values ($1, $2, 'in_progress', $3) returning id`,
    [`P5 project ${testId}`, clientId, profile.id],
  );
  const projectId = projectRows[0].id;

  const { rows: opportunityRows } = await client.query(
    `insert into public.opportunities (
       client_id, title, status, source, project_id, created_by
     ) values ($1, 'P5 billing check', 'won', 'other', $2, $3)
     returning id`,
    [clientId, projectId, profile.id],
  );
  const opportunityId = opportunityRows[0].id;

  const estimateNumber = `TEST-Q-${testId}`;
  const { rows: estimateRows } = await client.query(
    `insert into public.estimates (
       estimate_number, opportunity_id, client_id, status, title,
       tax_rate_percent, discount_amount, accepted_at, created_by
     ) values ($1, $2, $3, 'accepted', 'P5 test invoice', 10, 0, now(), $4)
     returning id`,
    [estimateNumber, opportunityId, clientId, profile.id],
  );
  const estimateId = estimateRows[0].id;
  await client.query(
    `insert into public.estimate_items (
       estimate_id, item_type, description, quantity, unit, unit_price, sort_order
     ) values
       ($1, 'labor', 'Fabrication labor', 2, 'hr', 100, 0),
       ($1, 'material', 'Marine material', 1, 'ea', 50, 1)`,
    [estimateId],
  );
  await client.query(
    "update public.estimates set discount_amount = 10 where id = $1",
    [estimateId],
  );

  await assumeAuthenticatedUser(profile.id);
  const { rows: ownerAccessRows } = await client.query(`
    select
      public.can_manage_billing() as manage_billing,
      public.can_view_billing() as view_billing,
      public.can_view_profitability() as view_profitability,
      public.can_manage_project_financials() as manage_financials
  `);
  if (
    !ownerAccessRows[0]?.manage_billing ||
    !ownerAccessRows[0]?.view_billing ||
    !ownerAccessRows[0]?.view_profitability ||
    !ownerAccessRows[0]?.manage_financials
  ) {
    throw new Error("Owner billing permissions are incorrect.");
  }

  const { rows: directoryRows } = await client.query(
    "select * from public.billing_estimate_directory() where estimate_id = $1",
    [estimateId],
  );
  if (directoryRows.length !== 1 || directoryRows[0].project_id !== projectId) {
    throw new Error("Accepted estimate directory is incorrect.");
  }

  await expectFailure("mismatched_estimate_link", () =>
    client.query(
      `insert into public.invoices (
         invoice_number, client_id, project_id, source_estimate_id,
         title, tax_rate_percent, created_by
       ) values ($1, $2, null, $3, 'Forged estimate invoice', 10, $4)`,
      [`TEST-INV-FORGED-${testId}`, clientId, estimateId, profile.id],
    ),
  );

  const { rows: invoiceIdRows } = await client.query(
    "select public.create_invoice_from_estimate($1) as id",
    [estimateId],
  );
  const invoiceId = invoiceIdRows[0]?.id;
  if (!invoiceId) throw new Error("Estimate invoice was not created.");

  const { rows: draftRows } = await client.query(
    `select
       status::text, subtotal, discount_amount, tax_amount, total,
       amount_paid, balance_due,
       (select count(*)::integer from public.invoice_items ii
        where ii.invoice_id = i.id) as item_count
     from public.invoices i where id = $1`,
    [invoiceId],
  );
  const draft = draftRows[0];
  if (draft?.status !== "draft" || Number(draft?.item_count) !== 2) {
    throw new Error("Estimate lines were not copied into a draft invoice.");
  }
  expectMoney(draft.subtotal, 250, "Invoice subtotal");
  expectMoney(draft.discount_amount, 10, "Invoice discount");
  expectMoney(draft.tax_amount, 24, "Invoice tax");
  expectMoney(draft.total, 264, "Invoice total");
  expectMoney(draft.amount_paid, 0, "Initial paid amount");
  expectMoney(draft.balance_due, 264, "Initial balance");

  await expectFailure("duplicate_estimate_invoice", () =>
    client.query("select public.create_invoice_from_estimate($1)", [estimateId]),
  );
  await expectFailure("direct_invoice_total", () =>
    client.query("update public.invoices set total = 999 where id = $1", [invoiceId]),
  );
  await expectFailure("direct_invoice_payment_amount", () =>
    client.query("update public.invoices set amount_paid = 1 where id = $1", [invoiceId]),
  );

  const { rows: sentRows } = await client.query(
    `update public.invoices
     set status = 'sent', sent_at = '2000-01-01T00:00:00Z'
     where id = $1
     returning sent_at`,
    [invoiceId],
  );
  if (!sentRows[0]?.sent_at || String(sentRows[0].sent_at).startsWith("2000-01-01")) {
    throw new Error("Invoice Sent timestamp was not normalized by the database.");
  }
  await expectNoRows("sent_invoice_line_edit", () =>
    client.query(
      "update public.invoice_items set quantity = 3 where invoice_id = $1 returning id",
      [invoiceId],
    ),
  );
  await expectFailure("direct_payment_insert", () =>
    client.query(
      `insert into public.invoice_payments (
         invoice_id, payment_type, payment_date, amount, method, created_by
       ) values ($1, 'deposit', current_date, 1, 'cash', $2)`,
      [invoiceId, profile.id],
    ),
  );

  const { rows: depositRows } = await client.query(
    `select public.record_invoice_payment(
       $1, 'deposit', current_date, 100, 'e_transfer', 'P5-DEP', 'Test deposit'
     ) as id`,
    [invoiceId],
  );
  const depositId = depositRows[0]?.id;
  if (!depositId) throw new Error("Deposit was not recorded.");

  const { rows: partialRows } = await client.query(
    "select status::text, amount_paid, balance_due from public.invoices where id = $1",
    [invoiceId],
  );
  if (partialRows[0]?.status !== "partially_paid") {
    throw new Error("Deposit did not set the invoice to Partially paid.");
  }
  expectMoney(partialRows[0].amount_paid, 100, "Partial paid amount");
  expectMoney(partialRows[0].balance_due, 164, "Partial balance");

  await expectFailure("invoice_overpayment", () =>
    client.query(
      `select public.record_invoice_payment(
         $1, 'payment', current_date, 165, 'cash', null, null
       )`,
      [invoiceId],
    ),
  );

  const { rows: finalPaymentRows } = await client.query(
    `select public.record_invoice_payment(
       $1, 'payment', current_date, 164, 'cheque', 'P5-FINAL', null
     ) as id`,
    [invoiceId],
  );
  const finalPaymentId = finalPaymentRows[0]?.id;
  const { rows: paidRows } = await client.query(
    "select status::text, amount_paid, balance_due from public.invoices where id = $1",
    [invoiceId],
  );
  if (paidRows[0]?.status !== "paid") throw new Error("Invoice was not marked Paid.");
  expectMoney(paidRows[0].amount_paid, 264, "Paid amount");
  expectMoney(paidRows[0].balance_due, 0, "Paid balance");
  await expectFailure("void_paid_invoice", () =>
    client.query("update public.invoices set status = 'void' where id = $1", [invoiceId]),
  );

  const { rows: reversalRows } = await client.query(
    "select public.reverse_invoice_payment($1, 'Test correction')::text as status",
    [finalPaymentId],
  );
  if (reversalRows[0]?.status !== "partially_paid") {
    throw new Error("Payment reversal did not reopen the invoice.");
  }
  await expectFailure("duplicate_payment_reversal", () =>
    client.query("select public.reverse_invoice_payment($1, 'Duplicate')", [finalPaymentId]),
  );

  const workOrderNumber = `TEST-WO-P5-${testId}`;
  const { rows: workOrderRows } = await client.query(
    `insert into public.work_orders (
       work_order_number, project_id, title, service_category, status, created_by
     ) values ($1, $2, 'P5 profitability work', 'marine_fabrication', 'ready', $3)
     returning id`,
    [workOrderNumber, projectId, profile.id],
  );
  const workOrderId = workOrderRows[0].id;
  await client.query(
    `insert into public.time_entries (
       work_order_id, profile_id, work_date, hours, note, created_by
     ) values ($1, $2, current_date, 10, 'P5 time', $2)`,
    [workOrderId, profile.id],
  );
  await client.query(
    `insert into public.material_entries (
       work_order_id, description, quantity, unit, unit_cost, entered_by
     ) values ($1, 'P5 material', 2, 'ea', 25, $2)`,
    [workOrderId, profile.id],
  );
  await client.query(
    `insert into public.project_financial_settings (
       project_id, labor_cost_rate, overhead_cost, updated_by
     ) values ($1, 30, 20, $2)`,
    [projectId, profile.id],
  );

  const { rows: profitabilityRows } = await client.query(
    "select * from public.project_profitability($1)",
    [projectId],
  );
  const profitability = profitabilityRows[0];
  if (!profitability) throw new Error("Project profitability was not returned.");
  expectMoney(profitability.invoiced_revenue, 240, "Invoiced revenue");
  expectMoney(profitability.payments_received, 100, "Payments received");
  expectMoney(profitability.outstanding_balance, 164, "Outstanding balance");
  expectMoney(profitability.labor_hours, 10, "Labor hours");
  expectMoney(profitability.labor_cost_rate, 30, "Labor rate");
  expectMoney(profitability.labor_cost, 300, "Labor cost");
  expectMoney(profitability.material_cost, 50, "Material cost");
  expectMoney(profitability.overhead_cost, 20, "Overhead cost");
  expectMoney(profitability.total_cost, 370, "Total cost");
  expectMoney(profitability.gross_profit, -130, "Gross profit");
  expectMoney(profitability.gross_margin_percent, -54.17, "Gross margin");

  await client.query(
    "select public.reverse_invoice_payment($1, 'Close test ledger')",
    [depositId],
  );
  const { rows: voidRows } = await client.query(
    `update public.invoices set status = 'void' where id = $1
     returning status::text, total, balance_due`,
    [invoiceId],
  );
  if (voidRows[0]?.status !== "void") throw new Error("Invoice was not voided.");
  expectMoney(voidRows[0].total, 264, "Voided invoice historical total");
  expectMoney(voidRows[0].balance_due, 0, "Voided invoice balance");
  const { rows: reopenedRows } = await client.query(
    `update public.invoices set status = 'draft' where id = $1
     returning status::text, balance_due`,
    [invoiceId],
  );
  if (reopenedRows[0]?.status !== "draft") throw new Error("Invoice was not reopened.");
  expectMoney(reopenedRows[0].balance_due, 264, "Reopened draft balance");

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'accounting' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: accountingRows } = await client.query(`
    select
      public.can_manage_billing() as manage_billing,
      public.can_view_billing() as view_billing,
      public.can_view_profitability() as view_profitability,
      public.can_manage_project_financials() as manage_financials
  `);
  if (
    !accountingRows[0]?.manage_billing ||
    !accountingRows[0]?.view_billing ||
    !accountingRows[0]?.view_profitability ||
    !accountingRows[0]?.manage_financials
  ) {
    throw new Error("Accounting billing permissions are incorrect.");
  }
  const { rows: accountingInvoiceRows } = await client.query(
    "select id from public.invoices where id = $1",
    [invoiceId],
  );
  if (accountingInvoiceRows.length !== 1) {
    throw new Error("Accounting cannot read invoices.");
  }
  await expectNoRows("direct_payment_update", () =>
    client.query(
      "update public.invoice_payments set amount = 2 where id = $1 returning id",
      [depositId],
    ),
  );

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'sales' where id = $1", [profile.id]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: salesRows } = await client.query(`
    select
      public.can_manage_billing() as manage_billing,
      public.can_view_billing() as view_billing,
      public.can_view_profitability() as view_profitability
  `);
  if (
    salesRows[0]?.manage_billing ||
    !salesRows[0]?.view_billing ||
    salesRows[0]?.view_profitability
  ) {
    throw new Error("Sales billing permissions are incorrect.");
  }
  const { rows: salesInvoiceRows } = await client.query(
    "select id from public.invoices where id = $1",
    [invoiceId],
  );
  const { rows: salesProfitRows } = await client.query(
    "select * from public.project_profitability($1)",
    [projectId],
  );
  if (salesInvoiceRows.length !== 1 || salesProfitRows.length !== 0) {
    throw new Error("Sales financial visibility is too broad or too narrow.");
  }
  await expectNoRows("sales_invoice_update", () =>
    client.query(
      "update public.invoices set notes = 'Unauthorized' where id = $1 returning id",
      [invoiceId],
    ),
  );

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'welder' where id = $1", [profile.id]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: workerRows } = await client.query(
    "select public.can_view_billing() as view_billing",
  );
  const { rows: workerInvoiceRows } = await client.query(
    "select id from public.invoices where id = $1",
    [invoiceId],
  );
  if (workerRows[0]?.view_billing || workerInvoiceRows.length !== 0) {
    throw new Error("Operational staff can see billing data.");
  }

  await client.query("rollback");
  console.log(
    JSON.stringify(
      {
        projectRef,
        ok: true,
        estimateToInvoice: true,
        immutableInvoiceTotals: true,
        immutablePaymentLedger: true,
        depositAndFinalPayment: true,
        paymentReversal: true,
        overpaymentBlocked: true,
        voidBalanceAndReopen: true,
        profitability: {
          revenue: 240,
          received: 100,
          outstanding: 164,
          labor: 300,
          materials: 50,
          overhead: 20,
          grossProfit: -130,
          marginPercent: -54.17,
        },
        accountingManagement: true,
        salesReadOnly: true,
        workerIsolation: true,
        rolledBack: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
