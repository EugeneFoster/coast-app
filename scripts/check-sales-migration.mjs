import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const salesMigrationPath = "supabase/migrations/20260823000005_sales_crm.sql";
const privacyMigrationPath =
  "supabase/migrations/20260823000006_client_contact_privacy.sql";
const [salesMigrationSql, privacyMigrationSql] = await Promise.all([
  readFile(salesMigrationPath, "utf8"),
  readFile(privacyMigrationPath, "utf8"),
]);
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

try {
  await client.query("begin");
  await client.query(salesMigrationSql);

  const { rows: profileRows } = await client.query(`
    select id
    from public.profiles
    where status = 'active'
      and role::text in ('owner', 'draftsperson', 'project_manager', 'sales')
    order by created_at
    limit 1
  `);
  const profileId = profileRows[0]?.id;
  if (!profileId) {
    throw new Error("An active sales administrator is required.");
  }

  const { rows: clientRows } = await client.query(
    `insert into public.clients (
       name, type, contact_name, email, phone, service_address, created_by
     ) values (
       'P2 privacy check', 'business', 'Privacy Contact',
       'privacy-check@example.com', '604-555-0100', 'Test service address', $1
     )
     returning id`,
    [profileId],
  );
  const clientId = clientRows[0].id;

  await client.query(privacyMigrationSql);
  const { rows: migratedContactRows } = await client.query(
    `select contact_name, email, phone, service_address
     from public.client_contacts
     where client_id = $1`,
    [clientId],
  );
  const migratedContact = migratedContactRows[0];
  if (
    migratedContact?.contact_name !== "Privacy Contact" ||
    migratedContact?.email !== "privacy-check@example.com" ||
    migratedContact?.phone !== "604-555-0100" ||
    migratedContact?.service_address !== "Test service address"
  ) {
    throw new Error("Customer contact data was not migrated without loss.");
  }

  const { rows: opportunityRows } = await client.query(
    `insert into public.opportunities (
       client_id, title, status, source, assigned_to, created_by
     ) values ($1, 'P2 migration check', 'estimating', 'other', $2, $2)
     returning id`,
    [clientId, profileId],
  );
  const opportunityId = opportunityRows[0].id;

  const { rows: estimateRows } = await client.query(
    `insert into public.estimates (
       estimate_number, opportunity_id, client_id, title,
       tax_rate_percent, discount_amount, assigned_to, created_by
     ) values ($1, $2, $3, 'P2 migration check', 12, 10, $4, $4)
     returning id`,
    [`TEST-${crypto.randomUUID()}`, opportunityId, clientId, profileId],
  );
  const estimateId = estimateRows[0].id;

  await client.query(
    `insert into public.estimate_items
       (estimate_id, item_type, description, quantity, unit, unit_price, sort_order)
     values
       ($1, 'labor', 'Fabrication labor', 2, 'hr', 100, 0),
       ($1, 'material', 'Aluminum plate', 1, 'ea', 50, 1)`,
    [estimateId],
  );

  const { rows: totalRows } = await client.query(
    `select subtotal, tax_amount, total from public.estimates where id = $1`,
    [estimateId],
  );
  const totals = totalRows[0];
  if (
    Number(totals?.subtotal) !== 250 ||
    Number(totals?.tax_amount) !== 28.8 ||
    Number(totals?.total) !== 268.8
  ) {
    throw new Error(`Estimate totals are incorrect: ${JSON.stringify(totals)}`);
  }

  const { rows: originalRoleRows } = await client.query(
    "select role::text from public.profiles where id = $1",
    [profileId],
  );
  const originalRole = originalRoleRows[0].role;
  await client.query(
    "update public.profiles set role = 'accounting' where id = $1",
    [profileId],
  );
  await assumeAuthenticatedUser(profileId);
  const { rows: accountingAccessRows } = await client.query(
    "select public.can_manage_sales() as manage, public.can_view_sales() as view",
  );
  if (accountingAccessRows[0]?.manage || !accountingAccessRows[0]?.view) {
    throw new Error("Accounting role did not receive read-only sales access.");
  }
  const { rows: accountingContactRows } = await client.query(
    "select email from public.client_contacts where client_id = $1",
    [clientId],
  );
  if (accountingContactRows[0]?.email !== "privacy-check@example.com") {
    throw new Error("Accounting could not read customer contact details.");
  }

  let accountingWriteBlocked = false;
  await client.query("savepoint accounting_write");
  try {
    const result = await client.query(
      "update public.opportunities set title = 'unauthorized' where id = $1",
      [opportunityId],
    );
    accountingWriteBlocked = result.rowCount === 0;
  } catch {
    accountingWriteBlocked = true;
    await client.query("rollback to savepoint accounting_write");
  }
  if (!accountingWriteBlocked) {
    throw new Error("Accounting role could mutate a sales opportunity.");
  }

  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
  await client.query(
    "update public.profiles set role = 'welder' where id = $1",
    [profileId],
  );
  await assumeAuthenticatedUser(profileId);
  const { rows: workerClientRows } = await client.query(
    "select name from public.clients where id = $1",
    [clientId],
  );
  const { rows: workerContactRows } = await client.query(
    "select email from public.client_contacts where client_id = $1",
    [clientId],
  );
  if (workerClientRows[0]?.name !== "P2 privacy check") {
    throw new Error("An active worker could not read the project-visible customer name.");
  }
  if (workerContactRows.length !== 0) {
    throw new Error("A worker could read sales-only customer contact details.");
  }

  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
  await client.query(
    "update public.profiles set role = $1::public.user_role where id = $2",
    [originalRole, profileId],
  );

  await assumeAuthenticatedUser(profileId);
  const { rows: accessRows } = await client.query(
    "select public.can_manage_sales() as manage, public.can_view_sales() as view",
  );
  if (!accessRows[0]?.manage || !accessRows[0]?.view) {
    throw new Error("Sales permissions were not recognized for the active administrator.");
  }

  await client.query(
    "update public.estimates set status = 'accepted', accepted_at = now() where id = $1",
    [estimateId],
  );
  const { rows: conversionRows } = await client.query(
    "select public.convert_opportunity_to_project($1) as project_id",
    [estimateId],
  );
  const projectId = conversionRows[0]?.project_id;
  const { rows: convertedRows } = await client.query(
    "select status::text, project_id from public.opportunities where id = $1",
    [opportunityId],
  );
  if (
    !projectId ||
    convertedRows[0]?.status !== "won" ||
    convertedRows[0]?.project_id !== projectId
  ) {
    throw new Error("Accepted estimate did not convert atomically to a won project.");
  }

  await client.query("rollback");
  console.log(
    JSON.stringify(
      {
        projectRef,
        ok: true,
        totals: { subtotal: 250, tax: 28.8, total: 268.8 },
        salesPermissions: true,
        accountingReadOnly: accountingWriteBlocked,
        contactPrivacy: {
          migratedWithoutLoss: true,
          accountingCanRead: true,
          workerCanReadCustomerName: true,
          workerCannotReadContact: true,
        },
        quoteConversion: true,
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
