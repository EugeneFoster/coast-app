import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

// P11: verify the supplier change-approval workflow against the real database
// inside a transaction that is always rolled back.
//
// The property under test throughout: a proposal never changes business data,
// and an approved proposal changes it exactly once.

const migrationSql = await readFile(
  "supabase/migrations/20260907000001_supplier_change_approvals.sql",
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

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected}, received ${actual}.`);
  }
}

async function createUser(login, role) {
  await assumeDatabaseOwner();
  const id = crypto.randomUUID();
  await client.query(
    `insert into auth.users (id, email, aud, role)
     values ($1, $2, 'authenticated', 'authenticated')`,
    [id, login],
  );
  await client.query(
    `insert into public.profiles (id, login, role, status, full_name)
     values ($1, $2, $3, 'active', $4)`,
    [id, login, role, login],
  );
  return id;
}

async function materialCount(workOrderId) {
  const { rows } = await client.query(
    "select count(*)::integer as total from public.material_entries where work_order_id = $1",
    [workOrderId],
  );
  return Number(rows[0].total);
}

async function propose(overrides = {}) {
  const payload = {
    actionType: "add_work_order_material",
    entityType: "material_entry",
    entityId: null,
    parentEntityId: null,
    supplier: "westernmarine",
    sourcePartNumber: "18-3214",
    proposedPartNumber: "18-3214",
    summary: "Add Water Pump Kit to work order",
    proposedChanges: { description: "Water Pump Kit", quantity: 1, unit_cost: 94.3 },
    currentValues: {},
    xeroImpact: "not_configured",
    xeroImpactDetail: null,
    supplierCheckedAt: new Date().toISOString(),
    idempotencyKey: `check-${crypto.randomUUID()}`,
    ...overrides,
  };

  const { rows } = await client.query(
    `select public.create_change_approval_request(
       $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::timestamptz, $14
     ) as id`,
    [
      payload.actionType,
      payload.entityType,
      payload.entityId,
      payload.parentEntityId,
      payload.supplier,
      payload.sourcePartNumber,
      payload.proposedPartNumber,
      payload.summary,
      JSON.stringify(payload.proposedChanges),
      JSON.stringify(payload.currentValues),
      payload.xeroImpact,
      payload.xeroImpactDetail,
      payload.supplierCheckedAt,
      payload.idempotencyKey,
    ],
  );
  return { id: rows[0].id, idempotencyKey: payload.idempotencyKey };
}

async function decide(requestId, decision, reason = null) {
  const { rows } = await client.query(
    "select public.decide_change_approval_request($1, $2, $3) as result",
    [requestId, decision, reason],
  );
  return rows[0].result;
}

async function readRequest(requestId) {
  await assumeDatabaseOwner();
  const { rows } = await client.query(
    "select * from public.change_approval_requests where id = $1",
    [requestId],
  );
  return rows[0];
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
  const seed = profileRows[0];
  if (!seed) throw new Error("An active employee is required.");

  const suffix = crypto.randomUUID();
  const approverB = await createUser(`p11-approver-${suffix}@example.test`, "owner");
  const welder = await createUser(`p11-welder-${suffix}@example.test`, "welder");

  // --- fixture: a work order with one existing material line --------------
  await setRole(seed.id, "owner");
  await assumeDatabaseOwner();
  const { rows: clientRows } = await client.query(
    "insert into public.clients (name) values ($1) returning id",
    [`P11 Approval Check ${suffix}`],
  );
  const { rows: projectRows } = await client.query(
    "insert into public.projects (name, client_id, created_by) values ($1, $2, $3) returning id",
    [`P11 Approval Project ${suffix}`, clientRows[0].id, seed.id],
  );
  const projectId = projectRows[0].id;
  const { rows: workOrderRows } = await client.query(
    `insert into public.work_orders (project_id, title, service_category, created_by)
     values ($1, $2, 'boat_repair', $3) returning id`,
    [projectId, `P11 Work Order ${suffix}`, seed.id],
  );
  const workOrderId = workOrderRows[0].id;
  const { rows: materialRows } = await client.query(
    `insert into public.material_entries
       (work_order_id, description, quantity, unit, unit_cost, entered_by)
     values ($1, 'Existing impeller', 1, 'ea', 88.00, $2)
     returning id`,
    [workOrderId, seed.id],
  );
  const existingMaterialId = materialRows[0].id;
  const baselineMaterials = await materialCount(workOrderId);
  expectNumber(baselineMaterials, 1, "Baseline material count");

  // --- authorization -------------------------------------------------------
  await setRole(welder, "welder");
  await expectFailure("welder_propose", () => propose({ parentEntityId: workOrderId }));

  await setRole(seed.id, "owner");
  const { id: rejectedId } = await propose({ parentEntityId: workOrderId });

  await setRole(welder, "welder");
  await expectFailure("welder_approve", () => decide(rejectedId, "approved"));

  // A user who is neither an approver nor the requester sees nothing.
  const { rows: hiddenRows } = await client.query(
    "select count(*)::integer as total from public.change_approval_requests where id = $1",
    [rejectedId],
  );
  expectNumber(hiddenRows[0].total, 0, "Non-approver visibility");

  // --- proposal must not mutate business data ------------------------------
  await assumeDatabaseOwner();
  expectNumber(
    await materialCount(workOrderId),
    baselineMaterials,
    "Material count after proposal",
  );
  const pending = await readRequest(rejectedId);
  expectEqual(pending.status, "pending_approval", "Proposal status");
  expectEqual(pending.decided_at, null, "Proposal decided_at");

  const { rows: notifyRows } = await client.query(
    `select count(*)::integer as total
     from public.notifications
     where approval_request_id = $1 and kind = 'approval_request'`,
    [rejectedId],
  );
  if (Number(notifyRows[0].total) < 1) {
    throw new Error("Proposal did not notify any approver.");
  }

  // --- reject changes nothing ---------------------------------------------
  await setRole(seed.id, "owner");
  const rejection = await decide(rejectedId, "rejected", "Keep the old number");
  if (rejection.ok !== true || rejection.code !== "rejected") {
    throw new Error(`Reject failed: ${JSON.stringify(rejection)}`);
  }

  const rejected = await readRequest(rejectedId);
  expectEqual(rejected.status, "rejected", "Rejected status");
  expectEqual(rejected.decided_by, seed.id, "Rejected decided_by");
  expectEqual(rejected.rejection_reason, "Keep the old number", "Rejection reason");
  if (!rejected.decided_at) throw new Error("Rejection did not record decided_at.");
  expectNumber(
    await materialCount(workOrderId),
    baselineMaterials,
    "Material count after reject",
  );

  // Rejected requests can never be executed.
  await setRole(seed.id, "owner");
  const { rows: rejectedClaim } = await client.query(
    "select public.begin_change_approval_execution($1) as result",
    [rejectedId],
  );
  expectEqual(rejectedClaim[0].result.ok, false, "Rejected request claimable");
  expectEqual(rejectedClaim[0].result.code, "not_executable", "Rejected claim code");

  // Deciding twice loses the race cleanly.
  const secondDecision = await decide(rejectedId, "approved");
  expectEqual(secondDecision.ok, false, "Second decision ok");
  expectEqual(secondDecision.code, "already_decided", "Second decision code");

  // --- approve executes exactly once --------------------------------------
  const { id: approvedId } = await propose({ parentEntityId: workOrderId });
  const approval = await decide(approvedId, "approved");
  expectEqual(approval.code, "approved", "Approval code");

  // Approval alone still changes nothing — execution is a separate, claimed step.
  await assumeDatabaseOwner();
  expectNumber(
    await materialCount(workOrderId),
    baselineMaterials,
    "Material count after approve (before execute)",
  );

  await setRole(seed.id, "owner");
  const { rows: firstClaim } = await client.query(
    "select public.begin_change_approval_execution($1) as result",
    [approvedId],
  );
  expectEqual(firstClaim[0].result.ok, true, "First execution claim");

  // The double-click case: a second claim must not succeed.
  const { rows: secondClaim } = await client.query(
    "select public.begin_change_approval_execution($1) as result",
    [approvedId],
  );
  expectEqual(secondClaim[0].result.ok, false, "Second execution claim");
  expectEqual(secondClaim[0].result.code, "not_executable", "Second claim code");

  await assumeDatabaseOwner();
  const { rows: insertedRows } = await client.query(
    `insert into public.material_entries
       (work_order_id, description, part_number, quantity, unit, unit_cost, entered_by)
     values ($1, 'Water Pump Kit', '18-3214', 1, 'ea', 94.30, $2)
     returning id`,
    [workOrderId, seed.id],
  );
  await setRole(seed.id, "owner");
  const { rows: completion } = await client.query(
    "select public.complete_change_approval_execution($1, $2, $3, $4) as result",
    [approvedId, insertedRows[0].id, "failed", "Xero is not configured"],
  );
  expectEqual(completion[0].result.ok, true, "Completion ok");

  const executed = await readRequest(approvedId);
  expectEqual(executed.status, "executed", "Executed status");
  expectEqual(executed.execution_status, "succeeded", "Execution status");
  expectEqual(executed.external_sync_status, "failed", "Sync status");
  expectEqual(executed.result_entity_id, insertedRows[0].id, "Result entity");
  expectNumber(
    await materialCount(workOrderId),
    baselineMaterials + 1,
    "Material count after execute",
  );

  // A failed accounting sync must be visible, not swallowed.
  const { rows: syncNotifications } = await client.query(
    `select count(*)::integer as total
     from public.notifications
     where approval_request_id = $1 and kind = 'sync_failed'`,
    [approvedId],
  );
  if (Number(syncNotifications[0].total) < 1) {
    throw new Error("Failed Xero sync did not raise a notification.");
  }

  // --- stale supplier data forces re-approval ------------------------------
  await setRole(seed.id, "owner");
  const { id: staleId } = await propose({ parentEntityId: workOrderId });
  await decide(staleId, "approved");
  const { rows: staleResult } = await client.query(
    `select public.mark_change_approval_stale(
       $1, 'Supplier price moved from $124.50 to $139.20', $2::jsonb, $3::jsonb
     ) as result`,
    [staleId, JSON.stringify({ dealerCost: 139.2 }), JSON.stringify({ reason: "price_changed" })],
  );
  expectEqual(staleResult[0].result.ok, true, "Stale marking ok");

  const stale = await readRequest(staleId);
  expectEqual(stale.status, "stale_requires_reapproval", "Stale status");
  expectEqual(stale.decided_at, null, "Stale decision cleared");
  expectEqual(stale.decided_by, null, "Stale decider cleared");

  await setRole(seed.id, "owner");
  const { rows: staleClaim } = await client.query(
    "select public.begin_change_approval_execution($1) as result",
    [staleId],
  );
  expectEqual(staleClaim[0].result.ok, false, "Stale request claimable");

  // It can be decided again, which is the whole point.
  const reapproval = await decide(staleId, "approved");
  expectEqual(reapproval.ok, true, "Re-approval ok");

  // --- idempotent proposals ------------------------------------------------
  const repeatKey = `check-repeat-${suffix}`;
  const first = await propose({ parentEntityId: workOrderId, idempotencyKey: repeatKey });
  const second = await propose({ parentEntityId: workOrderId, idempotencyKey: repeatKey });
  expectEqual(second.id, first.id, "Repeated proposal id");
  await assumeDatabaseOwner();
  const { rows: repeatRows } = await client.query(
    "select count(*)::integer as total from public.change_approval_requests where idempotency_key = $1",
    [repeatKey],
  );
  expectNumber(repeatRows[0].total, 1, "Repeated proposal row count");

  // --- audit trail is append-only -----------------------------------------
  await assumeDatabaseOwner();
  const { rows: eventRows } = await client.query(
    "select id, event_type from public.change_approval_events where request_id = $1 order by created_at",
    [approvedId],
  );
  const eventTypes = eventRows.map((row) => row.event_type);
  for (const required of ["proposed", "approved", "execution_started", "executed"]) {
    if (!eventTypes.includes(required)) {
      throw new Error(`Audit trail is missing the ${required} event.`);
    }
  }
  await expectFailure("audit_event_update", () =>
    client.query("update public.change_approval_events set detail = '{}'::jsonb where id = $1", [
      eventRows[0].id,
    ]),
  );
  await expectFailure("audit_event_delete", () =>
    client.query("delete from public.change_approval_events where id = $1", [eventRows[0].id]),
  );

  // --- direct writes are impossible from a client session ------------------
  await setRole(seed.id, "owner");
  // There is no UPDATE policy at all, so a direct write matches no rows rather
  // than raising. Either way the status must be untouched.
  const directUpdate = await client.query(
    "update public.change_approval_requests set status = 'executed' where id = $1",
    [rejectedId],
  );
  expectNumber(directUpdate.rowCount, 0, "Direct status update rows");
  const stillRejected = await readRequest(rejectedId);
  expectEqual(stillRejected.status, "rejected", "Status after direct update attempt");

  await setRole(seed.id, "owner");
  await expectFailure("direct_request_insert", () =>
    client.query(
      `insert into public.change_approval_requests
         (action_type, entity_type, summary, proposed_changes, requested_by, idempotency_key)
       values ('add_work_order_material', 'material_entry', 'forged', '{}'::jsonb, $1, $2)`,
      [seed.id, `forged-${suffix}`],
    ),
  );

  await assumeDatabaseOwner();
  void existingMaterialId;

  console.log(`Supplier approval workflow checks passed for project ${projectRef}.`);
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
