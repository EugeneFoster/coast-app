import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationSql = await readFile(
  "supabase/migrations/20260824000007_paint_yard_kanban.sql",
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

async function resolveStage(jobId, stage) {
  const { rows } = await client.query(
    `select task_id from public.paint_job_checklist($1)
     where stage = $2::public.paint_job_stage and status = 'pending'`,
    [jobId, stage],
  );
  for (const { task_id: taskId } of rows) {
    await client.query(
      "select public.set_paint_job_task_status($1, 'complete', 'P9 migration check')",
      [taskId],
    );
  }
}

const coatingSql = `
  select public.log_paint_coating(
    $1::uuid, $2::public.paint_scope_area, $3::public.coating_operation,
    $4::integer, $5::text, $6::text, $7::text, $8::text, $9::text,
    $10::numeric, $11::text, $12::numeric, $13::text, $14::text,
    $15::public.coating_application_method, $16::numeric, $17::numeric,
    $18::numeric, $19::numeric, $20::numeric, $21::numeric,
    $22::boolean, $23::boolean, $24::boolean, $25::boolean, $26::boolean,
    $27::timestamp without time zone, $28::text
  ) as log_id
`;

function coatingParams(jobId, overrides = {}) {
  const values = {
    area: "bottom",
    operation: "primer",
    coatNumber: 1,
    manufacturer: "Pettit",
    product: "Protect High Build Epoxy",
    productCode: "4700",
    color: "Gray",
    batch: "P9-LOT-001",
    quantity: 1,
    unit: "L",
    unitCost: 87.5,
    mix: "4:1 by volume",
    reducer: null,
    method: "roller",
    ambient: 18,
    substrate: 17,
    humidity: 65,
    dewPoint: 10,
    wetFilm: 7,
    dryFilm: 4,
    tds: true,
    sds: true,
    ppe: true,
    ventilation: true,
    surface: true,
    applied: "2026-08-24 09:30",
    note: "P9 traceability check",
    ...overrides,
  };
  return [
    jobId, values.area, values.operation, values.coatNumber,
    values.manufacturer, values.product, values.productCode, values.color,
    values.batch, values.quantity, values.unit, values.unitCost, values.mix,
    values.reducer, values.method, values.ambient, values.substrate,
    values.humidity, values.dewPoint, values.wetFilm, values.dryFilm,
    values.tds, values.sds, values.ppe, values.ventilation, values.surface,
    values.applied, values.note,
  ];
}

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id from public.profiles where status = 'active'
    order by created_at limit 1
  `);
  const { rows: projectRows } = await client.query(`
    select project.id
    from public.projects project
    join public.clients client on client.id = project.client_id
    where project.status <> 'archived'
    order by project.created_at limit 1
  `);
  const profile = profileRows[0];
  const projectId = projectRows[0]?.id;
  if (!profile || !projectId) throw new Error("An active employee and project are required.");
  await setRole(profile.id, "owner");

  const { rows: createRows } = await client.query(
    `select public.create_paint_job(
       $1, 'P9 Test Vessel', 'Coast 32', 32, 'aluminum',
       array['bottom','topsides']::public.paint_scope_area[], 'high',
       '2026-08-24', '2026-09-04', 40, 100, 500, 12,
       'Row B / Bay 4', 'Bottom preparation and antifouling', array[$2]::uuid[]
     ) as job_id`,
    [projectId, profile.id],
  );
  const jobId = createRows[0]?.job_id;
  if (!jobId) throw new Error("Paint job was not created.");

  const { rows: createdRows } = await client.query(
    `select
       job.work_order_id, job.estimate_id,
       work_order.status::text as work_order_status,
       work_order.service_category::text as service_category,
       estimate.status::text as estimate_status,
       estimate.subtotal, estimate.tax_amount, estimate.total,
       (select count(*)::integer from public.paint_job_tasks task
        where task.paint_job_id = job.id) as tasks,
       (select count(*)::integer from public.paint_job_stage_events event
        where event.paint_job_id = job.id) as events,
       (select count(*)::integer from public.work_order_assignments assignment
        where assignment.work_order_id = job.work_order_id
          and assignment.profile_id = $2) as assignments
     from public.paint_jobs job
     join public.work_orders work_order on work_order.id = job.work_order_id
     join public.estimates estimate on estimate.id = job.estimate_id
     where job.id = $1`,
    [jobId, profile.id],
  );
  const created = createdRows[0];
  if (!created || created.work_order_status !== "planned" || created.service_category !== "boat_painting" || created.estimate_status !== "draft") {
    throw new Error(`Atomic paint job creation is incomplete: ${JSON.stringify(created)}`);
  }
  expectNumber(created.tasks, 31, "Gated checklist task count");
  expectNumber(created.events, 1, "Initial stage event count");
  expectNumber(created.assignments, 1, "Crew assignment count");
  expectNumber(created.subtotal, 4500, "Draft quote subtotal");
  expectNumber(created.tax_amount, 540, "Draft quote tax");
  expectNumber(created.total, 5040, "Draft quote total");

  await expectFailure("duplicate_active_paint_job", () => client.query(
    `select public.create_paint_job(
       $1, 'Duplicate Vessel', null, null, 'unknown',
       array['bottom']::public.paint_scope_area[], 'normal',
       '2026-08-25', '2026-09-05', 10, 100, 0, 12, null, null, '{}'::uuid[]
     )`,
    [projectId],
  ));
  const { rows: duplicateRows } = await client.query(
    "select count(*)::integer as count from public.paint_jobs where project_id = $1",
    [projectId],
  );
  expectNumber(duplicateRows[0]?.count, 1, "Atomic duplicate rejection");

  const directJobUpdate = await client.query(
    "update public.paint_jobs set vessel_name = 'Forged' where id = $1",
    [jobId],
  );
  expectNumber(directJobUpdate.rowCount, 0, "Direct manager job update count");
  await expectFailure("direct_paint_work_order_replan", () => client.query(
    "update public.work_orders set estimated_hours = 99 where id = $1",
    [created.work_order_id],
  ));
  await expectFailure("direct_paint_work_order_status", () => client.query(
    "update public.work_orders set status = 'ready' where id = $1",
    [created.work_order_id],
  ));
  await expectFailure("forward_without_checklist", () => client.query(
    "select public.move_paint_job_stage($1, 'yard_intake', null)",
    [jobId],
  ));
  await resolveStage(jobId, "expected");
  await client.query("select public.move_paint_job_stage($1, 'yard_intake', 'Arrived')", [jobId]);
  await client.query("select public.move_paint_job_stage($1, 'expected', 'Customer rescheduled')", [jobId]);
  await client.query("select public.move_paint_job_stage($1, 'yard_intake', 'Returned to yard')", [jobId]);

  await setRole(profile.id, "painter");
  const { rows: painterRows } = await client.query(
    `select board.*, public.can_work_paint_yard() as can_work,
       public.can_administer_paint_yard() as can_administer
     from public.paint_yard_board() board where board.job_id = $1`,
    [jobId],
  );
  const painterBoard = painterRows[0];
  if (!painterBoard || painterBoard.can_work !== true || painterBoard.can_administer !== false) {
    throw new Error("Painter access to the operational board is incorrect.");
  }
  for (const field of ["opportunity_id", "estimate_id", "estimate_total", "invoice_id", "material_cost"]) {
    if (painterBoard[field] !== null) throw new Error(`Painter received financial field ${field}.`);
  }
  await expectFailure("painter_replan", () => client.query(
    "select public.update_paint_job_plan($1, '2026-08-24', '2026-09-04', 50, 'high', 'Row X', null)",
    [jobId],
  ));
  await expectFailure("painter_cancel", () => client.query(
    "select public.move_paint_job_stage($1, 'cancelled', 'Painter cannot cancel')",
    [jobId],
  ));
  await expectFailure("coating_missing_environment", () => client.query(
    coatingSql,
    coatingParams(jobId, { substrate: null, dewPoint: null }),
  ));
  await expectFailure("coating_dew_point_margin", () => client.query(
    coatingSql,
    coatingParams(jobId, { substrate: 12, dewPoint: 10 }),
  ));
  await expectFailure("coating_outside_scope", () => client.query(
    coatingSql,
    coatingParams(jobId, { area: "deck" }),
  ));
  await expectFailure("coating_missing_lot", () => client.query(
    coatingSql,
    coatingParams(jobId, { batch: null }),
  ));

  const { rows: painterLogRows } = await client.query(
    coatingSql,
    coatingParams(jobId, { unitCost: 999 }),
  );
  const painterLogId = painterLogRows[0]?.log_id;
  if (!painterLogId) throw new Error("Painter coating log was not created.");
  const { rows: painterLogDetailRows } = await client.query(
    `select log.unit_cost, log.applied_at, material.unit_cost as material_unit_cost,
       history.unit_cost as private_history_cost
     from public.paint_coating_logs log
     join public.material_entries material on material.id = log.material_entry_id
     cross join lateral (
       select unit_cost from public.paint_job_coating_history($1)
       where log_id = log.id
     ) history
     where log.id = $2`,
    [jobId, painterLogId],
  );
  const painterLog = painterLogDetailRows[0];
  if (!painterLog || Number(painterLog.unit_cost) !== 0 || Number(painterLog.material_unit_cost) !== 0 || painterLog.private_history_cost !== null) {
    throw new Error(`Painter financial write/read isolation failed: ${JSON.stringify(painterLog)}`);
  }
  if (new Date(painterLog.applied_at).toISOString() !== "2026-08-24T16:30:00.000Z") {
    throw new Error("Vancouver coating timestamp conversion is incorrect.");
  }
  const directLogUpdate = await client.query(
    "update public.paint_coating_logs set color = 'Forged' where id = $1",
    [painterLogId],
  );
  expectNumber(directLogUpdate.rowCount, 0, "Direct painter coating update count");
  await expectFailure("painter_void_log", () => client.query(
    "select public.void_paint_coating_log($1, 'Painter correction')",
    [painterLogId],
  ));
  await resolveStage(jobId, "yard_intake");
  await client.query("select public.move_paint_job_stage($1, 'wash_mask', 'Intake released')", [jobId]);

  await setRole(profile.id, "owner");
  await client.query(
    "select public.void_paint_coating_log($1, 'Incorrect test batch')",
    [painterLogId],
  );
  const { rows: voidRows } = await client.query(
    `select log.voided_at, material.unit_cost, material.description
     from public.paint_coating_logs log
     join public.material_entries material on material.id = log.material_entry_id
     where log.id = $1`,
    [painterLogId],
  );
  if (!voidRows[0]?.voided_at || Number(voidRows[0]?.unit_cost) !== 0 || !voidRows[0]?.description.startsWith("[VOID] ")) {
    throw new Error("Void audit did not neutralize the linked material cost.");
  }
  const { rows: activeLogRows } = await client.query(coatingSql, coatingParams(jobId));
  if (!activeLogRows[0]?.log_id) throw new Error("Manager coating log was not created.");

  await resolveStage(jobId, "wash_mask");
  await client.query("select public.move_paint_job_stage($1, 'surface_prep', 'Washed and masked')", [jobId]);
  await resolveStage(jobId, "surface_prep");
  await client.query("select public.move_paint_job_stage($1, 'primer', 'Surface released')", [jobId]);
  await resolveStage(jobId, "primer");
  await client.query("select public.move_paint_job_stage($1, 'coating', 'Primer released')", [jobId]);
  await resolveStage(jobId, "coating");
  await client.query("select public.move_paint_job_stage($1, 'cure_qc', 'Coating complete')", [jobId]);
  await resolveStage(jobId, "cure_qc");
  await client.query("select public.move_paint_job_stage($1, 'ready', 'QC passed')", [jobId]);

  const { rows: jobLinkRows } = await client.query(
    "select estimate_id, work_order_id from public.paint_jobs where id = $1",
    [jobId],
  );
  const { estimate_id: estimateId, work_order_id: workOrderId } = jobLinkRows[0];
  await client.query(
    "update public.estimates set status = 'accepted', accepted_at = now() where id = $1",
    [estimateId],
  );
  const { rows: invoiceRows } = await client.query(
    "select public.create_paint_job_invoice($1, '2026-09-04', '2026-10-04') as invoice_id",
    [jobId],
  );
  const invoiceId = invoiceRows[0]?.invoice_id;
  if (!invoiceId) throw new Error("Final invoice was not created.");
  const { rows: invoiceDetailRows } = await client.query(
    `select invoice.source_estimate_id, invoice.total, invoice.balance_due,
       job.invoice_id, job.stage::text,
       work_order.status::text as work_order_status,
       (select count(*)::integer from public.paint_job_stage_history($1)) as stage_events
     from public.paint_jobs job
     join public.invoices invoice on invoice.id = job.invoice_id
     join public.work_orders work_order on work_order.id = job.work_order_id
     where job.id = $1`,
    [jobId],
  );
  const invoice = invoiceDetailRows[0];
  if (!invoice || invoice.source_estimate_id !== estimateId || invoice.invoice_id !== invoiceId || invoice.stage !== "ready" || invoice.work_order_status !== "completed") {
    throw new Error(`Paint invoice linkage is incorrect: ${JSON.stringify(invoice)}`);
  }
  expectNumber(invoice.total, 5040, "Final invoice total");
  expectNumber(invoice.balance_due, 5040, "Final invoice balance");

  await expectFailure("deliver_without_ready_checklist", () => client.query(
    "select public.move_paint_job_stage($1, 'delivered', null)",
    [jobId],
  ));
  await resolveStage(jobId, "ready");
  await client.query("select public.move_paint_job_stage($1, 'delivered', 'Customer collected vessel')", [jobId]);
  const { rows: finalRows } = await client.query(
    `select job.stage::text, job.ready_at, job.delivered_at,
       work_order.status::text as work_order_status,
       (select count(*)::integer from public.paint_job_stage_events event
        where event.paint_job_id = job.id) as stage_events,
       (select count(*)::integer from public.paint_coating_logs log
        where log.paint_job_id = job.id and log.voided_at is null) as active_coatings,
       (select coalesce(sum(entry.line_total), 0) from public.material_entries entry
        where entry.work_order_id = $2) as material_cost
     from public.paint_jobs job
     join public.work_orders work_order on work_order.id = job.work_order_id
     where job.id = $1`,
    [jobId, workOrderId],
  );
  const final = finalRows[0];
  if (!final || final.stage !== "delivered" || final.work_order_status !== "completed" || !final.ready_at || !final.delivered_at) {
    throw new Error(`Final delivery state is incorrect: ${JSON.stringify(final)}`);
  }
  expectNumber(final.active_coatings, 1, "Active coating count");
  expectNumber(final.material_cost, 87.5, "Voided-excluded material cost");

  await client.query("rollback");
  console.log(JSON.stringify({
    projectRef,
    ok: true,
    atomicJobWorkOrderQuote: true,
    checklistForwardGates: true,
    reworkBackflowAllowed: true,
    painterOperationalAccess: true,
    painterFinancialIsolation: true,
    coatingSafetyAndDewPointGates: true,
    coatingTraceabilityAndVancouverTime: true,
    immutableCorrectionAudit: true,
    acceptedQuoteToInvoice: true,
    deliveryCompletion: true,
    rolledBack: true,
  }, null, 2));
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}
