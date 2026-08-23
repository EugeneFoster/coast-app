import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

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
  const { rows } = await client.query(`
    select id, role::text as role
    from public.profiles
    where status = 'active'
      and role::text in ('draftsperson', 'project_manager')
    order by created_at
    limit 1
  `);
  const profile = rows[0];

  if (!profile) {
    throw new Error("An active non-owner administrator is required for the check.");
  }

  let ownerEscalationBlocked = false;
  await client.query("begin");
  try {
    await assumeAuthenticatedUser(profile.id);
    const access = await client.query(
      "select public.is_active_user() as active, public.is_admin() as admin",
    );
    if (!access.rows[0]?.active || !access.rows[0]?.admin) {
      throw new Error("Active administrator access was not recognized.");
    }

    await client.query("update public.profiles set role = 'owner' where id = $1", [
      profile.id,
    ]);
  } catch (error) {
    ownerEscalationBlocked = String(error?.message ?? error).includes(
      "Only an owner can change owner accounts",
    );
  } finally {
    await client.query("rollback");
  }

  if (!ownerEscalationBlocked) {
    throw new Error("A non-owner administrator could promote their profile to owner.");
  }

  await client.query("begin");
  try {
    await client.query(
      "update public.profiles set status = 'disabled' where id = $1",
      [profile.id],
    );
    await assumeAuthenticatedUser(profile.id);
    const access = await client.query(
      "select public.is_active_user() as active, public.is_admin() as admin",
    );
    if (access.rows[0]?.active || access.rows[0]?.admin) {
      throw new Error("A disabled employee retained active or administrator access.");
    }
  } finally {
    await client.query("rollback");
  }

  console.log(
    JSON.stringify(
      {
        projectRef,
        ok: true,
        checkedRole: profile.role,
        ownerEscalationBlocked,
        disabledAccessBlocked: true,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
