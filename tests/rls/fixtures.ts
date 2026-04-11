/**
 * Two-tenant fixture seeded as superuser at the start of every RLS suite.
 * Garage A = Dudley (real seed). Garage B is a fake "Bromley Motors" so we
 * can prove cross-tenant isolation: any time a Garage-A user touches a
 * Garage-B row, RLS must deny.
 *
 * Each tenant has 1 manager + 1 mot_tester + 1 mechanic + 1 customer + 1
 * vehicle + 1 job. The mechanic is assigned to the job in their own garage.
 *
 * Fixtures live OUTSIDE the per-test transactions so they persist across
 * the whole `describe` block. Cleaned up by `tearDownFixtures()`.
 */
import { asSuperuser } from "./db";

export const GARAGE_A = "00000000-0000-0000-0000-0000000d0d1e"; // Dudley (seeded)
export const GARAGE_B = "00000000-0000-0000-0000-00000000b001";

export const A_MANAGER = "00000000-0000-0000-0000-0000000a0001";
export const A_TESTER = "00000000-0000-0000-0000-0000000a0002";
export const A_MECHANIC = "00000000-0000-0000-0000-0000000a0003";
export const A_CUSTOMER = "00000000-0000-0000-0000-0000000ac001";
export const A_VEHICLE = "00000000-0000-0000-0000-0000000a0e01";
export const A_JOB = "00000000-0000-0000-0000-0000000a0b01";

export const B_MANAGER = "00000000-0000-0000-0000-0000000b0001";
export const B_MECHANIC = "00000000-0000-0000-0000-0000000b0003";
export const B_CUSTOMER = "00000000-0000-0000-0000-0000000bc001";
export const B_VEHICLE = "00000000-0000-0000-0000-0000000b0e01";
export const B_JOB = "00000000-0000-0000-0000-0000000b0b01";

export async function setupFixtures(): Promise<void> {
  // Defensive: a previous crashed run may have left fixture rows behind.
  await tearDownFixtures();
  await asSuperuser(async (c) => {
    // Garage B
    await c.query(
      `insert into garages (id, name, slug, status_subdomain)
       values ($1, 'Bromley Motors', 'bromley', 'bromley')
       on conflict (id) do nothing`,
      [GARAGE_B],
    );

    // auth.users rows are needed because staff.id REFERENCES auth.users(id).
    // We insert minimal placeholders directly — fine for RLS tests.
    const users = [
      [A_MANAGER, "a-manager@dudley.test"],
      [A_TESTER, "a-tester@dudley.test"],
      [A_MECHANIC, "a-mechanic@dudley.test"],
      [B_MANAGER, "b-manager@bromley.test"],
      [B_MECHANIC, "b-mechanic@bromley.test"],
    ] as const;
    for (const [id, email] of users) {
      await c.query(
        `insert into auth.users (id, instance_id, aud, role, email,
                                 encrypted_password, email_confirmed_at,
                                 created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
                 'authenticated', $2, '', now(), now(), now())
         on conflict (id) do nothing`,
        [id, email],
      );
    }

    // staff
    const staff = [
      [A_MANAGER, GARAGE_A, "Alice Manager", "a-manager@dudley.test"],
      [A_TESTER, GARAGE_A, "Adam Tester", "a-tester@dudley.test"],
      [A_MECHANIC, GARAGE_A, "Anna Mechanic", "a-mechanic@dudley.test"],
      [B_MANAGER, GARAGE_B, "Ben Manager", "b-manager@bromley.test"],
      [B_MECHANIC, GARAGE_B, "Bob Mechanic", "b-mechanic@bromley.test"],
    ] as const;
    for (const [id, garage, name, email] of staff) {
      await c.query(
        `insert into staff (id, garage_id, full_name, email)
         values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [id, garage, name, email],
      );
    }

    // Roles in the locked-down private schema
    const roles = [
      [A_MANAGER, GARAGE_A, "manager"],
      [A_TESTER, GARAGE_A, "mot_tester"],
      [A_MECHANIC, GARAGE_A, "mechanic"],
      [B_MANAGER, GARAGE_B, "manager"],
      [B_MECHANIC, GARAGE_B, "mechanic"],
    ] as const;
    for (const [id, garage, role] of roles) {
      await c.query(
        `insert into private.staff_roles (staff_id, garage_id, role)
         values ($1,$2,$3::private.staff_role) on conflict (staff_id) do nothing`,
        [id, garage, role],
      );
    }

    // Customer + vehicle + job in each garage
    await c.query(
      `insert into customers (id, garage_id, full_name, phone)
       values ($1,$2,'Carla Customer','+447700900001')
       on conflict (id) do nothing`,
      [A_CUSTOMER, GARAGE_A],
    );
    await c.query(
      `insert into customers (id, garage_id, full_name, phone)
       values ($1,$2,'Carl Customer','+447700900002')
       on conflict (id) do nothing`,
      [B_CUSTOMER, GARAGE_B],
    );
    await c.query(
      `insert into vehicles (id, garage_id, customer_id, registration, make, model)
       values ($1,$2,$3,'AB12CDE','Ford','Focus')
       on conflict (id) do nothing`,
      [A_VEHICLE, GARAGE_A, A_CUSTOMER],
    );
    await c.query(
      `insert into vehicles (id, garage_id, customer_id, registration, make, model)
       values ($1,$2,$3,'BC34DEF','VW','Golf')
       on conflict (id) do nothing`,
      [B_VEHICLE, GARAGE_B, B_CUSTOMER],
    );
    await c.query(
      `insert into jobs (id, garage_id, job_number, customer_id, vehicle_id, status, source)
       values ($1,$2,'TEST-A-001',$3,$4,'in_repair','manager')
       on conflict (id) do nothing`,
      [A_JOB, GARAGE_A, A_CUSTOMER, A_VEHICLE],
    );
    await c.query(
      `insert into jobs (id, garage_id, job_number, customer_id, vehicle_id, status, source)
       values ($1,$2,'TEST-B-001',$3,$4,'in_repair','manager')
       on conflict (id) do nothing`,
      [B_JOB, GARAGE_B, B_CUSTOMER, B_VEHICLE],
    );

    // Mechanic A is assigned to job A. B mechanic is NOT assigned to anything,
    // so we can prove unassigned mechanics see zero jobs.
    await c.query(
      `insert into job_assignments (job_id, staff_id, garage_id)
       values ($1,$2,$3) on conflict do nothing`,
      [A_JOB, A_MECHANIC, GARAGE_A],
    );
  });
}

/**
 * Tear down by predicate, not by id. Survives re-runs where a previous
 * crashed test left orphan rows behind.
 */
export async function tearDownFixtures(): Promise<void> {
  await asSuperuser(async (c) => {
    // Only touch the test fixture rows. Garage A (Dudley) is the real seed
    // and must survive — drop only its test staff/customers/jobs.
    const testEmailPattern = "%@dudley.test";
    const bromleyEmailPattern = "%@bromley.test";

    await c.query(
      `delete from work_logs where job_id in
         (select id from jobs where job_number in ('TEST-A-001','TEST-B-001'))`,
    );
    await c.query(
      `delete from job_assignments where job_id in
         (select id from jobs where job_number in ('TEST-A-001','TEST-B-001'))`,
    );
    await c.query(
      "delete from jobs where job_number in ('TEST-A-001','TEST-B-001')",
    );
    await c.query("delete from vehicles where registration in ('AB12CDE','BC34DEF')");
    await c.query(
      "delete from customers where phone in ('+447700900001','+447700900002')",
    );
    await c.query(
      `delete from private.staff_roles where staff_id in
         (select id from staff where email like $1 or email like $2)`,
      [testEmailPattern, bromleyEmailPattern],
    );
    await c.query("delete from staff where email like $1 or email like $2", [
      testEmailPattern,
      bromleyEmailPattern,
    ]);
    await c.query("delete from auth.users where email like $1 or email like $2", [
      testEmailPattern,
      bromleyEmailPattern,
    ]);
    await c.query("delete from bays where garage_id = $1", [GARAGE_B]);
    await c.query("delete from private.job_number_seq where garage_id = $1", [
      GARAGE_B,
    ]);
    await c.query("delete from garages where id = $1", [GARAGE_B]);
  });
}
