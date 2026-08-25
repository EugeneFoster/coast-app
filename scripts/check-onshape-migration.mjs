import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationSql = await readFile(
  "supabase/migrations/20260824000008_onshape_project_models.sql",
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
  const profile = profileRows[0];
  if (!profile) throw new Error("An active employee is required.");
  await setRole(profile.id, "owner");

  const testId = crypto.randomUUID();
  const { rows: clientRows } = await client.query(
    "insert into public.clients (name) values ($1) returning id",
    [`P10 Onshape Check ${testId}`],
  );
  const { rows: projectRows } = await client.query(
    `insert into public.projects (name, client_id, created_by)
     values ($1, $2, $3) returning id`,
    [`P10 Model Project ${testId}`, clientRows[0].id, profile.id],
  );
  const projectId = projectRows[0].id;

  await expectFailure("direct_model_insert", () =>
    client.query(
      `insert into public.project_models (project_id, name, storage_path, imported_by)
       values ($1, 'Forged', $2, $3)`,
      [projectId, `${projectId}/forged.glb`, profile.id],
    ),
  );

  const { rows: uploadRows } = await client.query(
    `select public.register_project_model(
       $1, 'Uploaded hull', $2, 'upload', 1024,
       null, null, null, null, null, null, null, null, $3
     ) as model_id`,
    [projectId, `${projectId}/uploaded.glb`, profile.id],
  );
  const uploadedModelId = uploadRows[0]?.model_id;
  if (!uploadedModelId) throw new Error("Uploaded model was not registered.");

  const { rows: onshapeRows } = await client.query(
    `select public.register_project_model(
       $1, 'Onshape assembly', $2, 'onshape', 4096,
       'e60c4803eaf2ac8be492c18e', 'w', 'd2558da712764516cc9fec62',
       '6bed6b43463f6a46a37b4a22', 'ASSEMBLY',
       'https://cad.onshape.com/documents/e60c4803eaf2ac8be492c18e/w/d2558da712764516cc9fec62/e/6bed6b43463f6a46a37b4a22',
       '111111111111111111111111', 'FINE', $3
     ) as model_id`,
    [projectId, `${projectId}/onshape.glb`, profile.id],
  );
  const onshapeModelId = onshapeRows[0]?.model_id;
  if (!onshapeModelId) throw new Error("Onshape model was not registered.");

  const { rows: registryRows } = await client.query(
    `select
       count(*)::integer as models,
       count(*) filter (where is_primary)::integer as primary_models,
       max(source) filter (where is_primary) as primary_source,
       (select model_url from public.projects where id = $1) as project_model_url
     from public.project_models where project_id = $1`,
    [projectId],
  );
  expectNumber(registryRows[0]?.models, 2, "Model history count");
  expectNumber(registryRows[0]?.primary_models, 1, "Primary model count");
  if (registryRows[0]?.primary_source !== "onshape") {
    throw new Error("Latest Onshape import was not made primary.");
  }
  if (registryRows[0]?.project_model_url !== `${projectId}/onshape.glb`) {
    throw new Error("projects.model_url was not synchronized.");
  }

  await client.query("select public.set_primary_project_model($1, $2)", [
    projectId,
    uploadedModelId,
  ]);
  const { rows: primaryRows } = await client.query(
    `select
       (select count(*)::integer from public.project_models
        where project_id = $1 and id = $2 and is_primary) as selected,
       (select model_url from public.projects where id = $1) as project_model_url`,
    [projectId, uploadedModelId],
  );
  expectNumber(primaryRows[0]?.selected, 1, "Selected primary model count");
  if (primaryRows[0]?.project_model_url !== `${projectId}/uploaded.glb`) {
    throw new Error("Selecting a primary model did not synchronize the project.");
  }

  await assumeDatabaseOwner();
  await client.query(
    "insert into public.project_members (project_id, profile_id) values ($1, $2)",
    [projectId, profile.id],
  );
  await setRole(profile.id, "welder");
  const { rows: memberRows } = await client.query(
    "select count(*)::integer as models from public.project_models where project_id = $1",
    [projectId],
  );
  expectNumber(memberRows[0]?.models, 2, "Assigned member model visibility");
  await expectFailure("worker_register_model", () =>
    client.query(
      `select public.register_project_model(
         $1, 'Worker model', $2, 'upload', null,
         null, null, null, null, null, null, null, null, $3
       )`,
      [projectId, `${projectId}/worker.glb`, profile.id],
    ),
  );
  const directUpdate = await client.query(
    "update public.project_models set name = 'Forged' where id = $1",
    [onshapeModelId],
  );
  expectNumber(directUpdate.rowCount, 0, "Direct worker model update count");

  await assumeDatabaseOwner();
  await client.query(
    "delete from public.project_members where project_id = $1 and profile_id = $2",
    [projectId, profile.id],
  );
  await assumeAuthenticatedUser(profile.id);
  const { rows: unrelatedRows } = await client.query(
    "select count(*)::integer as models from public.project_models where project_id = $1",
    [projectId],
  );
  expectNumber(unrelatedRows[0]?.models, 0, "Unassigned employee model visibility");

  console.log(`Onshape migration checks passed for Supabase project ${projectRef}.`);
} finally {
  try {
    await client.query("rollback");
    await client.query("reset role");
  } finally {
    await client.end();
  }
}
