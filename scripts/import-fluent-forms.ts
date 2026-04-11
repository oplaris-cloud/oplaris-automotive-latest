/**
 * scripts/import-fluent-forms.ts
 *
 * Imports customer + vehicle records from a Fluent Forms CSV export.
 *
 * Usage:
 *   pnpm import:customers -- --file data/customers.csv              # dry-run
 *   pnpm import:customers -- --file data/customers.csv --commit     # live write
 *
 * Expected CSV columns (case-insensitive, flexible order):
 *   full_name | name     — customer name (required)
 *   phone                — UK phone (required)
 *   email                — optional
 *   address_line1        — optional
 *   address_line2        — optional
 *   postcode             — optional
 *   registration | reg   — vehicle reg (optional; creates a vehicle if present)
 *   make                 — optional
 *   model                — optional
 *   year                 — optional
 *   notes                — optional (goes to customer.notes)
 *
 * Security:
 *   - Uses a MANAGER session (via email+password signin), never service_role.
 *   - All writes go through PostgREST + RLS, not raw SQL.
 *   - Dry-run is default — produces import-report.json without touching the DB.
 *
 * Output: writes `import-report.json` to cwd with per-row status.
 */
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// tsx has an ESM↔CJS interop bug with libphonenumber-js's metadata
// wrapper (`export default` gets wrapped in `{ default: ... }`).
// Use the core directly with metadata loaded via CJS.
import { parsePhoneNumberWithError as _parse } from "libphonenumber-js/core";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const metadata = _require("libphonenumber-js/metadata.min.json");
function parsePhoneNumberWithError(number: string, country: "GB") {
  return _parse(number, country, metadata);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    file: { type: "string" },
    commit: { type: "boolean", default: false },
    email: { type: "string", default: "manager@dudley.local" },
    password: { type: "string", default: "Oplaris-Dev-Password-1!" },
  },
  strict: true,
  allowPositionals: true,
});

if (!args.file) {
  console.error("Usage: tsx scripts/import-fluent-forms.ts --file <path.csv> [--commit]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CSV parsing (lightweight, no dep)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function readCsv(
  path: string,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const rl = createInterface({ input: createReadStream(path, "utf8") });
  let headers: string[] = [];
  const rows: Record<string, string>[] = [];
  let first = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (first) {
      headers = parseCsvLine(line).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      first = false;
      continue;
    }
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = vals[i] ?? "";
    }
    rows.push(row);
  }
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalisePhone(raw: string): string | null {
  try {
    const phone = parsePhoneNumberWithError(raw.trim(), "GB");
    return phone.isValid() ? phone.format("E.164") : null;
  } catch {
    return null;
  }
}

function normaliseReg(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Import logic
// ---------------------------------------------------------------------------

interface RowResult {
  row: number;
  name: string;
  phone: string;
  status: "ok" | "skipped" | "error" | "dupe";
  reason?: string;
  customerId?: string;
  vehicleId?: string;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  // Authenticate as a manager — NOT service_role
  const supabase: SupabaseClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: args.email!,
    password: args.password!,
  });
  if (authErr || !authData.session) {
    console.error("Login failed:", authErr?.message ?? "no session");
    process.exit(1);
  }
  // The hook writes garage_id into the JWT claims, not the user object.
  // Decode the JWT to read them.
  const [, payload] = authData.session.access_token.split(".");
  const claims = JSON.parse(
    Buffer.from(payload!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
  );
  const garageId = claims.app_metadata?.garage_id as string | undefined;
  if (!garageId) {
    console.error("Login succeeded but JWT has no garage_id. Is the auth hook running?");
    process.exit(1);
  }
  console.log(`Logged in as ${args.email} (garage ${garageId})`);

  const { headers, rows } = await readCsv(args.file!);
  console.log(`Read ${rows.length} rows, columns: ${headers.join(", ")}`);

  const results: RowResult[] = [];
  const seenPhones = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = col(row, "full_name", "name");
    const rawPhone = col(row, "phone");
    const result: RowResult = { row: i + 2, name, phone: rawPhone, status: "ok" };

    if (!name) {
      result.status = "skipped";
      result.reason = "missing name";
      results.push(result);
      continue;
    }
    if (!rawPhone) {
      result.status = "skipped";
      result.reason = "missing phone";
      results.push(result);
      continue;
    }

    const phone = normalisePhone(rawPhone);
    if (!phone) {
      result.status = "error";
      result.reason = `invalid phone: ${rawPhone}`;
      results.push(result);
      continue;
    }

    if (seenPhones.has(phone)) {
      result.status = "dupe";
      result.reason = `duplicate phone within CSV: ${phone}`;
      results.push(result);
      continue;
    }
    seenPhones.add(phone);

    if (!args.commit) {
      result.reason = "dry-run — would insert";
      results.push(result);
      continue;
    }

    // Check for existing customer by phone (partial unique index doesn't
    // support ON CONFLICT, so we use a select-then-insert pattern).
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    let customer: { id: string };
    if (existing) {
      customer = existing;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("customers")
        .insert({
          garage_id: garageId,
          full_name: name,
          phone,
          email: col(row, "email") || null,
          address_line1: col(row, "address_line1") || null,
          address_line2: col(row, "address_line2") || null,
          postcode: col(row, "postcode") || null,
          notes: col(row, "notes") || null,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        result.status = "error";
        result.reason = insertErr?.message ?? "insert failed";
        results.push(result);
        continue;
      }
      customer = inserted;
    }
    const custErr = null;

    void custErr; // null — errors handled above
    result.customerId = customer.id;

    // Insert vehicle if registration present
    const rawReg = col(row, "registration", "reg");
    if (rawReg) {
      const reg = normaliseReg(rawReg);
      const { data: existingVeh } = await supabase
        .from("vehicles")
        .select("id")
        .eq("registration", reg)
        .maybeSingle();

      if (existingVeh) {
        result.vehicleId = existingVeh.id;
      } else {
        const { data: vehicle, error: vehErr } = await supabase
          .from("vehicles")
          .insert({
            garage_id: garageId,
            customer_id: customer.id,
            registration: reg,
            make: col(row, "make") || null,
            model: col(row, "model") || null,
            year: col(row, "year") ? parseInt(col(row, "year"), 10) : null,
          })
          .select("id")
          .single();

        if (vehErr) {
          result.reason = `customer ok, vehicle failed: ${vehErr.message}`;
        } else if (vehicle) {
          result.vehicleId = vehicle.id;
        }
      }
    }

    results.push(result);
  }

  // Report
  const report = {
    file: args.file,
    mode: args.commit ? "commit" : "dry-run",
    total: rows.length,
    ok: results.filter((r) => r.status === "ok").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    dupes: results.filter((r) => r.status === "dupe").length,
    rows: results,
  };

  const reportPath = "import-report.json";
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${reportPath}`);
  console.log(
    `  ${report.ok} ok, ${report.skipped} skipped, ${report.errors} errors, ${report.dupes} dupes`,
  );

  if (!args.commit) {
    console.log("  (dry-run — no data was written. Pass --commit to import.)");
  }

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
