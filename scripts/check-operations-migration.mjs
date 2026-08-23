import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationPath =
  "supabase/migrations/20260823000007_operations_work_orders.sql";
const migrationSql = await readFile(migrationPath, "utf8");
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

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id, role::text as role
    from public.profiles
    where status = 'active'
      and role::text in ('owner', 'project_manager', 'draftsperson')
    order by created_at
    limit 1
  `);
  const { rows: projectRows } = await client.query(`
    select id from public.projects order by created_at limit 1
  `);
  const profile = profileRows[0];
  const projectId = projectRows[0]?.id;
  if (!profile || !projectId) {
    throw new Error("An active operations manager and project are required.");
  }

  const testWorkOrderNumber = `TEST-${crypto.randomUUID()}`;
  const { rows: workOrderRows } = await client.query(
    `insert into public.work_orders (
       work_order_number, project_id, title, service_category, priority,
       scheduled_start, scheduled_end, estimated_hours, created_by
     ) values (
       $1, $2, 'P3 migration check', 'marine_fabrication', 'high',
       current_date, current_date + 2, 8, $3
     ) returning id, work_order_number`,
    [testWorkOrderNumber, projectId, profile.id],
  );
  const workOrderId = workOrderRows[0].id;
  const workOrderNumber = workOrderRows[0].work_order_number;

  await client.query(
    `insert into public.work_order_assignments
       (work_order_id, profile_id, assigned_by)
     values ($1, $2, $2)`,
    [workOrderId, profile.id],
  );
  const { rows: membershipRows } = await client.query(
    `select 1 from public.project_members
     where project_id = $1 and profile_id = $2`,
    [projectId, profile.id],
  );
  if (membershipRows.length !== 1) {
    throw new Error("Work order assignment did not grant project membership.");
  }

  await assumeAuthenticatedUser(profile.id);
  const { rows: managerAccessRows } = await client.query(
    `select
       public.can_manage_operations() as manage,
       public.can_view_work_order($1) as view,
       public.can_log_work_order($1) as log`,
    [workOrderId],
  );
  if (
    !managerAccessRows[0]?.manage ||
    !managerAccessRows[0]?.view ||
    !managerAccessRows[0]?.log
  ) {
    throw new Error("Operations manager permissions were not recognized.");
  }
  const { rows: directoryRows } = await client.query(
    "select id from public.operations_employee_directory() where id = $1",
    [profile.id],
  );
  if (directoryRows.length !== 1) {
    throw new Error("The safe operations employee directory is unavailable.");
  }
  const { rows: projectDirectoryRows } = await client.query(
    "select id from public.operations_project_directory() where id = $1",
    [projectId],
  );
  if (projectDirectoryRows.length !== 1) {
    throw new Error("The safe operations project directory is unavailable.");
  }

  await client.query(
    "select public.update_assigned_work_order_status($1, 'ready')",
    [workOrderId],
  );
  await client.query(
    `insert into public.time_entries
       (work_order_id, profile_id, work_date, hours, note, created_by)
     values ($1, $2, current_date, 2, 'Manager time check', $2)`,
    [workOrderId, profile.id],
  );
  await client.query(
    `insert into public.material_entries
       (work_order_id, description, quantity, unit, unit_cost, entered_by)
     values ($1, 'Aluminum plate', 2, 'ea', 25, $2)`,
    [workOrderId, profile.id],
  );

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'welder' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: workerAccessRows } = await client.query(
    `select
       public.can_manage_operations() as manage,
       public.can_view_work_order($1) as view,
       public.can_log_work_order($1) as log`,
    [workOrderId],
  );
  if (
    workerAccessRows[0]?.manage ||
    !workerAccessRows[0]?.view ||
    !workerAccessRows[0]?.log
  ) {
    throw new Error("Assigned worker permissions are incorrect.");
  }

  const unauthorizedUpdate = await client.query(
    "update public.work_orders set title = 'unauthorized' where id = $1",
    [workOrderId],
  );
  if (unauthorizedUpdate.rowCount !== 0) {
    throw new Error("An assigned worker could edit protected work order fields.");
  }

  await client.query(
    "select public.update_assigned_work_order_status($1, 'in_progress')",
    [workOrderId],
  );
  await client.query(
    `insert into public.time_entries
       (work_order_id, profile_id, work_date, hours, note, created_by)
     values ($1, $2, current_date, 3, 'Fabrication time check', $2)`,
    [workOrderId, profile.id],
  );
  await client.query(
    `insert into public.material_entries
       (work_order_id, description, quantity, unit, unit_cost, entered_by)
     values ($1, 'Welding wire', 3, 'kg', 10, $2)`,
    [workOrderId, profile.id],
  );

  let dailyLimitBlocked = false;
  await client.query("savepoint daily_limit");
  try {
    await client.query(
      `insert into public.time_entries
         (work_order_id, profile_id, work_date, hours, created_by)
       values ($1, $2, current_date, 20, $2)`,
      [workOrderId, profile.id],
    );
  } catch {
    dailyLimitBlocked = true;
    await client.query("rollback to savepoint daily_limit");
  }
  if (!dailyLimitBlocked) {
    throw new Error("Daily time entries could exceed 24 hours.");
  }

  await client.query(
    "select public.update_assigned_work_order_status($1, 'completed')",
    [workOrderId],
  );
  const { rows: completedRows } = await client.query(
    "select status::text, started_at, completed_at from public.work_orders where id = $1",
    [workOrderId],
  );
  if (
    completedRows[0]?.status !== "completed" ||
    !completedRows[0]?.started_at ||
    !completedRows[0]?.completed_at
  ) {
    throw new Error("Work order lifecycle timestamps are incorrect.");
  }

  await assumeDatabaseOwner();
  await client.query(
    "update public.profiles set role = 'accounting' where id = $1",
    [profile.id],
  );
  await assumeAuthenticatedUser(profile.id);
  const { rows: accountingAccessRows } = await client.query(
    `select
       public.can_manage_operations() as manage,
       public.can_view_work_order($1) as view,
       public.can_log_work_order($1) as log`,
    [workOrderId],
  );
  if (
    accountingAccessRows[0]?.manage ||
    !accountingAccessRows[0]?.view ||
    accountingAccessRows[0]?.log
  ) {
    throw new Error("Accounting did not receive read-only operations access.");
  }

  let accountingWriteBlocked = false;
  await client.query("savepoint accounting_write");
  try {
    await client.query(
      `insert into public.time_entries
         (work_order_id, profile_id, work_date, hours, created_by)
       values ($1, $2, current_date, 1, $2)`,
      [workOrderId, profile.id],
    );
  } catch {
    accountingWriteBlocked = true;
    await client.query("rollback to savepoint accounting_write");
  }
  if (!accountingWriteBlocked) {
    throw new Error("Accounting could add time to a work order.");
  }

  const { rows: accountingVisibleTimeRows } = await client.query(
    "select id from public.time_entries where work_order_id = $1 limit 1",
    [workOrderId],
  );
  const accountingDelete = await client.query(
    "delete from public.time_entries where id = $1",
    [accountingVisibleTimeRows[0].id],
  );
  if (accountingDelete.rowCount !== 0) {
    throw new Error("Accounting could delete an existing time entry.");
  }

  let accountingStatusBlocked = false;
  await client.query("savepoint accounting_status");
  try {
    await client.query(
      "select public.update_assigned_work_order_status($1, 'in_progress')",
      [workOrderId],
    );
  } catch {
    accountingStatusBlocked = true;
    await client.query("rollback to savepoint accounting_status");
  }
  if (!accountingStatusBlocked) {
    throw new Error("Accounting could change a work order status.");
  }

  const { rows: totalRows } = await client.query(
    `select
       (select sum(hours) from public.time_entries where work_order_id = $1) as hours,
       (select sum(line_total) from public.material_entries where work_order_id = $1) as materials`,
    [workOrderId],
  );
  if (
    Number(totalRows[0]?.hours) !== 5 ||
    Number(totalRows[0]?.materials) !== 80
  ) {
    throw new Error(`Operations totals are incorrect: ${JSON.stringify(totalRows[0])}`);
  }

  await client.query("rollback");
  console.log(
    JSON.stringify(
      {
        projectRef,
        ok: true,
        workOrderNumber,
        assignmentAddsProjectAccess: true,
        managerAccess: true,
        workerAccess: {
          protectedFields: true,
          statusUpdates: true,
          timeAndMaterials: true,
        },
        accountingReadOnly: true,
        dailyTimeLimit: true,
        totals: { hours: 5, materials: 80 },
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
