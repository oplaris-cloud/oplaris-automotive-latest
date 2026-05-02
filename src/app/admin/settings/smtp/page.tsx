import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/session";
import { readImpersonationCookie } from "@/lib/auth/super-admin-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, AlertTriangle } from "lucide-react";

import { saveSmtpSettings, sendTestEmail } from "./actions";

/**
 * B6.2 — SMTP settings form. Super_admin only, scoped to the
 * impersonated garage. The password field is write-only (never
 * round-tripped through HTML so a leaked screen-share can't echo it).
 */
export default async function AdminSmtpSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; sent?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const impersonation = await readImpersonationCookie();
  if (!impersonation) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.rpc("get_smtp_settings_meta", {
    p_garage_id: impersonation.garageId,
  });
  const meta = Array.isArray(rows) ? rows[0] : null;

  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">SMTP settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-garage email relay credentials. Password is encrypted at
          rest via pgcrypto. Used by quote / invoice email sends.
        </p>
      </div>

      {params.saved ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-4 text-sm">SMTP settings saved.</CardContent>
        </Card>
      ) : null}
      {params.sent ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-4 text-sm">Test email sent.</CardContent>
        </Card>
      ) : null}
      {params.error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {params.error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-4 w-4" /> Relay
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <form action={saveSmtpSettings} className="grid gap-4 sm:grid-cols-2">
            <Field
              name="host"
              label="Host"
              defaultValue={meta?.host ?? ""}
              placeholder="smtp.gmail.com"
              required
            />
            <Field
              name="port"
              label="Port"
              type="number"
              defaultValue={meta?.port?.toString() ?? "587"}
              required
            />
            <Field
              name="username"
              label="Username"
              defaultValue={meta?.username ?? ""}
              placeholder="hello@your-garage.co.uk"
              required
            />
            <Field
              name="password"
              label={
                meta
                  ? "Password (leave blank to keep existing)"
                  : "Password"
              }
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required={!meta}
            />
            <Field
              name="from_email"
              label="From email"
              type="email"
              defaultValue={meta?.from_email ?? ""}
              placeholder="invoices@your-garage.co.uk"
              required
            />
            <Field
              name="from_name"
              label="From name"
              defaultValue={meta?.from_name ?? "Your Garage"}
              required
            />
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="smtp-secure"
                name="secure"
                type="checkbox"
                defaultChecked={meta?.secure ?? true}
                className="size-4"
              />
              <Label htmlFor="smtp-secure" className="m-0 cursor-pointer">
                Use TLS / SSL (recommended)
              </Label>
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button type="submit">Save settings</Button>
              {meta ? (
                <span className="text-xs text-muted-foreground">
                  Last updated{" "}
                  {new Date(meta.updated_at).toLocaleString("en-GB")}
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {meta ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Send test email</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <form action={sendTestEmail} className="flex flex-wrap items-end gap-3">
              <div className="grid flex-1 gap-1">
                <Label htmlFor="smtp-test-to">To</Label>
                <Input
                  id="smtp-test-to"
                  name="to"
                  type="email"
                  required
                  placeholder="hossein@oplaris.co.uk"
                />
              </div>
              <Button type="submit">Send</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
  required,
  autoComplete,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={`smtp-${name}`}>{label}</Label>
      <Input
        id={`smtp-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
      />
    </div>
  );
}
