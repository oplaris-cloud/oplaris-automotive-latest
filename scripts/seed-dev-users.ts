/**
 * scripts/seed-dev-users.ts — provisions local dev accounts.
 *
 * Creates 3 staff users inside the Dudley garage — one per role — with
 * well-known credentials for quick local testing. Idempotent: safe to
 * re-run. Uses the service role key, which is why this must never ship
 * in production builds. Reads env via tsx's `--env-file=.env.local` flag
 * (see `pnpm db:seed-dev`).
 *
 * Usage:
 *   pnpm db:seed-dev
 *
 * The three users (credentials below are local-dev only — never reused
 * anywhere else):
 *   manager@dudley.local  / Oplaris-Dev-Password-1!
 *   tester@dudley.local   / Oplaris-Dev-Password-1!
 *   mechanic@dudley.local / Oplaris-Dev-Password-1!
 */
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

const DUDLEY_GARAGE_ID = "00000000-0000-0000-0000-0000000d0d1e";
const DEV_PASSWORD = "Oplaris-Dev-Password-1!";

interface DevUser {
  email: string;
  fullName: string;
  role: "manager" | "mot_tester" | "mechanic";
}

const USERS: DevUser[] = [
  { email: "manager@dudley.local", fullName: "Alice Manager", role: "manager" },
  { email: "tester@dudley.local", fullName: "Adam Tester", role: "mot_tester" },
  { email: "mechanic@dudley.local", fullName: "Anna Mechanic", role: "mechanic" },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.\n" +
        "Copy .env.example to .env.local and fill in the local supabase keys " +
        "(see `supabase status -o env`), then re-run `pnpm db:seed-dev`.",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pg = new PgClient({
    connectionString:
      process.env.SUPABASE_DB_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  await pg.connect();

  try {
    // Page through existing users once; reused across all three upserts.
    const { data: existing, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw listErr;

    for (const user of USERS) {
      console.log(`\n→ ${user.email} (${user.role})`);

      const prior = existing?.users.find((u) => u.email === user.email);
      let userId: string;
      if (prior) {
        userId = prior.id;
        await admin.auth.admin.updateUserById(userId, {
          password: DEV_PASSWORD,
          email_confirm: true,
        });
        console.log("  auth user exists — reset password");
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: user.email,
          password: DEV_PASSWORD,
          email_confirm: true,
        });
        if (error || !data.user) {
          throw error ?? new Error("createUser returned no user");
        }
        userId = data.user.id;
        console.log("  created auth user");
      }

      const { error: staffErr } = await admin.from("staff").upsert(
        {
          id: userId,
          garage_id: DUDLEY_GARAGE_ID,
          full_name: user.fullName,
          email: user.email,
          is_active: true,
        },
        { onConflict: "id" },
      );
      if (staffErr) throw staffErr;
      console.log("  staff row upserted");

      // private.staff_roles isn't exposed via PostgREST, so write it
      // directly over the Postgres protocol.
      await pg.query(
        `insert into private.staff_roles (staff_id, garage_id, role)
         values ($1, $2, $3::private.staff_role)
         on conflict (staff_id) do update
           set garage_id = excluded.garage_id,
               role      = excluded.role`,
        [userId, DUDLEY_GARAGE_ID, user.role],
      );
      console.log("  role assigned");
    }

    console.log("\nDone. Use these credentials at http://localhost:3000/login :");
    for (const u of USERS) {
      console.log(`  ${u.email.padEnd(24)} / ${DEV_PASSWORD}   (${u.role})`);
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
