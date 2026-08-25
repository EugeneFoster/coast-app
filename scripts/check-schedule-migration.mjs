import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationSql = await readFile(
  "supabase/migrations/20260824000006_team_scheduling.sql",
  "utf8",
);
const { client, projectRef } = await connectToSupabaseDatabase();

async function assumeAuthenticatedUser(profileId) {
  const claims = JSON.stringify({ sub: profileId, role: "authenticated" });
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [profileId]);
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
}

async function assumeDatabaseOwner() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
}

async function setRole(profileId, role) {
  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = $2 where id = $1", [profileId, role]);
  await assumeAuthenticatedUser(profileId);
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

function expectNumber(actual, expected, label) {
  if (Number(actual) !== expected) {
    throw new Error(`${label} expected ${expected}, received ${actual}.`);
  }
}

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id from public.profiles
    where status = 'active'
    order by created_at
    limit 1
  `);
  const { rows: projectRows } = await client.query(
    "select id from public.projects order by created_at limit 1",
  );
  const profile = profileRows[0];
  const projectId = projectRows[0]?.id;
  if (!profile || !projectId) {
    throw new Error("An active employee and project are required.");
  }
  await setRole(profile.id, "owner");

  const testId = crypto.randomUUID();
  const { rows: workOrderRows } = await client.query(
    `insert into public.work_orders (
       work_order_number, project_id, title, service_category, priority, created_by
     ) values
       ($1, $3, 'P8 fabrication shift', 'marine_fabrication', 'high', $4),
       ($2, $3, 'P8 mechanical shift', 'marine_mechanics', 'normal', $4)
     returning id, work_order_number`,
    [`P8-A-${testId}`, `P8-B-${testId}`, projectId, profile.id],
  );
  const firstWorkOrderId = workOrderRows.find((row) => row.work_order_number.startsWith("P8-A"))?.id;
  const secondWorkOrderId = workOrderRows.find((row) => row.work_order_number.startsWith("P8-B"))?.id;
  if (!firstWorkOrderId || !secondWorkOrderId) throw new Error("Test work orders were not created.");

  await expectFailure("direct_schedule_insert", () => client.query(
    `insert into public.work_order_schedule_slots (
       work_order_id, profile_id, starts_at, ends_at, created_by, updated_by
     ) values ($1, $2, now(), now() + interval '1 hour', $2, $2)`,
    [firstWorkOrderId, profile.id],
  ));

  const { rows: firstSlotRows } = await client.query(
    `select public.save_work_order_schedule_slot(
       null::uuid, $1, $2,
       '2026-08-24 08:00'::timestamp,
       '2026-08-24 12:00'::timestamp,
       'Bring fabrication drawings'
     ) as slot_id`,
    [firstWorkOrderId, profile.id],
  );
  const firstSlotId = firstSlotRows[0]?.slot_id;
  if (!firstSlotId) throw new Error("First schedule slot was not created.");

  const { rows: firstSlotDetailRows } = await client.query(
    `select
       slot.starts_at,
       slot.ends_at,
       slot.status::text,
       (select count(*)::integer from public.work_order_schedule_events event
        where event.slot_id = slot.id) as events,
       (select count(*)::integer from public.work_order_assignments assignment
        where assignment.work_order_id = slot.work_order_id
          and assignment.profile_id = slot.profile_id) as assignments
     from public.work_order_schedule_slots slot
     where slot.id = $1`,
    [firstSlotId],
  );
  const firstSlot = firstSlotDetailRows[0];
  if (
    !firstSlot ||
    firstSlot.status !== "scheduled" ||
    new Date(firstSlot.starts_at).toISOString() !== "2026-08-24T15:00:00.000Z" ||
    new Date(firstSlot.ends_at).toISOString() !== "2026-08-24T19:00:00.000Z"
  ) throw new Error(`Vancouver schedule conversion is incorrect: ${JSON.stringify(firstSlot)}`);
  expectNumber(firstSlot.events, 1, "Create audit event count");
  expectNumber(firstSlot.assignments, 1, "Automatic work order assignment count");

  await expectFailure("overlapping_shift", () => client.query(
    `select public.save_work_order_schedule_slot(
       null::uuid, $1, $2,
       '2026-08-24 11:00'::timestamp,
       '2026-08-24 13:00'::timestamp,
       null::text
     )`,
    [secondWorkOrderId, profile.id],
  ));
  const { rows: blockedOverlapRows } = await client.query(
    `select
       (select count(*)::integer from public.work_order_schedule_slots) as slots,
       (select count(*)::integer from public.work_order_schedule_events) as events`,
  );
  expectNumber(blockedOverlapRows[0]?.slots, 1, "Slot count after blocked overlap");
  expectNumber(blockedOverlapRows[0]?.events, 1, "Event count after blocked overlap");

  const { rows: secondSlotRows } = await client.query(
    `select public.save_work_order_schedule_slot(
       null::uuid, $1, $2,
       '2026-08-24 12:00'::timestamp,
       '2026-08-24 16:00'::timestamp,
       'Adjacent shift is allowed'
     ) as slot_id`,
    [secondWorkOrderId, profile.id],
  );
  const secondSlotId = secondSlotRows[0]?.slot_id;
  if (!secondSlotId) throw new Error("Adjacent schedule slot was not created.");

  await client.query(
    `select public.save_work_order_schedule_slot(
       $1, $2, $3,
       '2026-08-24 07:00'::timestamp,
       '2026-08-24 11:00'::timestamp,
       'Rescheduled earlier'
     )`,
    [firstSlotId, firstWorkOrderId, profile.id],
  );

  const { rows: managerRows } = await client.query(
    `select
       public.can_manage_schedule() as can_manage,
       (select count(*)::integer from public.team_schedule('2026-08-24', '2026-08-31')) as team_slots,
       (select count(*)::integer from public.schedule_employee_directory() where id = $1) as employees,
       (select count(*)::integer from public.schedule_work_order_directory()
        where id in ($2, $3)) as work_orders,
       (select count(*)::integer from public.work_order_schedule_events) as events`,
    [profile.id, firstWorkOrderId, secondWorkOrderId],
  );
  if (managerRows[0]?.can_manage !== true) throw new Error("Owner cannot manage schedule.");
  expectNumber(managerRows[0]?.team_slots, 2, "Manager team schedule count");
  expectNumber(managerRows[0]?.employees, 1, "Safe employee directory count");
  expectNumber(managerRows[0]?.work_orders, 2, "Safe work order directory count");
  expectNumber(managerRows[0]?.events, 3, "Create and reschedule audit count");

  const directManagerUpdate = await client.query(
    "update public.work_order_schedule_slots set note = 'forged' where id = $1",
    [firstSlotId],
  );
  expectNumber(directManagerUpdate.rowCount, 0, "Direct manager slot update count");

  await setRole(profile.id, "welder");
  const { rows: workerRows } = await client.query(
    `select
       public.can_manage_schedule() as can_manage,
       (select count(*)::integer from public.team_schedule('2026-08-24', '2026-08-31')) as team_slots,
       (select count(*)::integer from public.my_schedule('2026-08-24', '2026-08-25')) as my_slots,
       (select count(*)::integer from public.work_order_schedule_slots) as direct_slots,
       (select count(*)::integer from public.work_order_schedule_events) as visible_events`,
  );
  if (workerRows[0]?.can_manage !== false) throw new Error("Welder received schedule management access.");
  expectNumber(workerRows[0]?.team_slots, 0, "Worker team schedule visibility");
  expectNumber(workerRows[0]?.my_slots, 2, "Worker My day count");
  expectNumber(workerRows[0]?.direct_slots, 2, "Worker own slot visibility");
  expectNumber(workerRows[0]?.visible_events, 3, "Worker own audit visibility");
  await expectFailure("worker_schedule_write", () => client.query(
    `select public.save_work_order_schedule_slot(
       null::uuid, $1, $2,
       '2026-08-25 08:00'::timestamp,
       '2026-08-25 10:00'::timestamp,
       null::text
     )`,
    [firstWorkOrderId, profile.id],
  ));

  await assumeDatabaseOwner();
  const { rows: thirdWorkOrderRows } = await client.query(
    `insert into public.work_orders (
       work_order_number, project_id, title, service_category, priority, created_by
     ) values ($1, $2, 'P8 unscheduled task', 'boat_painting', 'urgent', $3)
     returning id`,
    [`P8-C-${testId}`, projectId, profile.id],
  );
  const thirdWorkOrderId = thirdWorkOrderRows[0].id;
  await client.query(
    `insert into public.work_order_assignments (work_order_id, profile_id, assigned_by)
     values ($1, $2, $2)`,
    [thirdWorkOrderId, profile.id],
  );
  await assumeAuthenticatedUser(profile.id);
  const { rows: unscheduledRows } = await client.query(
    "select work_order_id from public.my_unscheduled_work_orders()",
  );
  if (
    unscheduledRows.length !== 1 ||
    unscheduledRows[0]?.work_order_id !== thirdWorkOrderId
  ) throw new Error("My day unscheduled work is incorrect.");

  await setRole(profile.id, "owner");
  await client.query("select public.cancel_work_order_schedule_slot($1, $2)", [
    firstSlotId,
    "Shift reassigned after customer delay",
  ]);
  const { rows: cancelledRows } = await client.query(
    `select
       slot.status::text,
       slot.cancellation_reason,
       slot.cancelled_at,
       (select count(*)::integer from public.work_order_schedule_events event
        where event.slot_id = slot.id) as events,
       (select count(*)::integer from public.team_schedule('2026-08-24', '2026-08-31')) as active_team_slots
     from public.work_order_schedule_slots slot
     where slot.id = $1`,
    [firstSlotId],
  );
  const cancelled = cancelledRows[0];
  if (
    !cancelled ||
    cancelled.status !== "cancelled" ||
    cancelled.cancellation_reason !== "Shift reassigned after customer delay" ||
    !cancelled.cancelled_at
  ) throw new Error("Schedule cancellation audit is incomplete.");
  expectNumber(cancelled.events, 3, "Cancelled slot audit event count");
  expectNumber(cancelled.active_team_slots, 1, "Active team slots after cancellation");
  await expectFailure("reschedule_cancelled_slot", () => client.query(
    `select public.save_work_order_schedule_slot(
       $1, $2, $3,
       '2026-08-25 08:00'::timestamp,
       '2026-08-25 10:00'::timestamp,
       null::text
     )`,
    [firstSlotId, firstWorkOrderId, profile.id],
  ));

  await client.query("rollback");
  console.log(JSON.stringify({
    projectRef,
    ok: true,
    vancouverTimeConversion: true,
    managerDirectoryAndSchedule: true,
    automaticWorkOrderAssignment: true,
    overlapBlockedAtomically: true,
    adjacentShiftAllowed: true,
    immutableAuditEvents: true,
    workerMyDayPrivate: true,
    workerWriteBlocked: true,
    unscheduledAssignedWorkVisible: true,
    cancellationAudited: true,
    rolledBack: true,
  }, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
