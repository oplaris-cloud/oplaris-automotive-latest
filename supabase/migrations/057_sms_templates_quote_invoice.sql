-- ────────────────────────────────────────────────────────────────────
-- Migration 057 — extend sms_templates to cover quote_sent /
-- quote_updated / invoice_sent (P2.3 followup, Hossein 2026-04-27).
--
-- Migration 055 deliberately scoped the templates table to three keys
-- (status_code / approval_request / mot_reminder) and left the quote
-- and invoice paths hardcoded in
-- src/app/(app)/app/jobs/charges/actions.ts. The hardcoded strings:
--
--   markAsQuoted      — "Dudley Auto Service: Your quote {ref} for
--                        {reg} is ready. Total {total}. Review: {link}"
--   resendQuote (rev) — "Dudley Auto Service: Your quote {ref} for
--                        {reg} has been updated (rev {N}). New total
--                        {total}. Review: {link}"
--
-- Both pin "Dudley Auto Service" as a literal, which breaks the
-- white-label model the moment a second garage is onboarded — there
-- is no path for a manager to retitle the SMS via the V1 brand panel
-- without a code change. This migration:
--
--   1. Widens sms_template_key_check to include quote_sent,
--      quote_updated, invoice_sent.
--   2. Seeds defaults for every existing garage. Bodies mirror the
--      hardcoded strings except the literal name is templated to
--      {{garage_name}} so the brand_name from public.garages flows
--      through cleanly.
--   3. Updates the seed trigger so future garages inherit the same
--      defaults at row-creation.
--
-- invoice_sent has no caller today (markAsInvoiced doesn't dispatch
-- an SMS) — the template is seeded so the manager's editor cards are
-- complete and the next caller can wire renderTemplate() without a
-- second migration.
-- ────────────────────────────────────────────────────────────────────

begin;

-- ───────────────────────────────────────────────────────────────────
-- 1. Widen the CHECK constraint.
-- ───────────────────────────────────────────────────────────────────

alter table public.sms_templates
  drop constraint sms_template_key_check;

alter table public.sms_templates
  add constraint sms_template_key_check check (
    template_key in (
      'status_code',
      'approval_request',
      'mot_reminder',
      'quote_sent',
      'quote_updated',
      'invoice_sent'
    )
  );

-- ───────────────────────────────────────────────────────────────────
-- 2. Seed defaults for every existing garage.
--    Bodies are byte-identical to the hardcoded copy in
--    src/app/(app)/app/jobs/charges/actions.ts modulo the
--    {{garage_name}} substitution and the leading-£ moved out of the
--    {{total}} value (matches the approval_request pattern from
--    migration 055 — keeps the variable a raw amount so a non-£
--    garage can override the body without touching the call site).
-- ───────────────────────────────────────────────────────────────────

insert into public.sms_templates (garage_id, template_key, body)
select g.id,
       'quote_sent',
       E'{{garage_name}}: Your quote {{reference}} for {{vehicle_reg}} is ready. Total £{{total}}. Review: {{status_url}}'
from public.garages g
on conflict (garage_id, template_key) do nothing;

insert into public.sms_templates (garage_id, template_key, body)
select g.id,
       'quote_updated',
       E'{{garage_name}}: Your quote {{reference}} for {{vehicle_reg}} has been updated (rev {{revision}}). New total £{{total}}. Review: {{status_url}}'
from public.garages g
on conflict (garage_id, template_key) do nothing;

insert into public.sms_templates (garage_id, template_key, body)
select g.id,
       'invoice_sent',
       E'{{garage_name}}: Your invoice {{reference}} for {{vehicle_reg}} is ready. Total £{{total}}. View and pay: {{status_url}}'
from public.garages g
on conflict (garage_id, template_key) do nothing;

-- ───────────────────────────────────────────────────────────────────
-- 3. Refresh the seed trigger function so future garages get all six
--    templates at insert time (status_code, approval_request,
--    mot_reminder from migration 055 + quote_sent / quote_updated /
--    invoice_sent added here).
-- ───────────────────────────────────────────────────────────────────

create or replace function private.seed_default_sms_templates()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.sms_templates (garage_id, template_key, body) values
    (new.id, 'status_code',
     E'Your vehicle status code: {{code}}\nExpires in 10 minutes.'),
    (new.id, 'approval_request',
     E'{{garage_name}} needs your approval: {{description}} — £{{amount}}.\n\nApprove or decline: {{approval_url}}'),
    (new.id, 'mot_reminder',
     E'Hi from {{garage_name}}. Your vehicle {{vehicle_reg}} MOT expires on {{expiry_date}}. Reply to this message or call us to book a test.'),
    (new.id, 'quote_sent',
     E'{{garage_name}}: Your quote {{reference}} for {{vehicle_reg}} is ready. Total £{{total}}. Review: {{status_url}}'),
    (new.id, 'quote_updated',
     E'{{garage_name}}: Your quote {{reference}} for {{vehicle_reg}} has been updated (rev {{revision}}). New total £{{total}}. Review: {{status_url}}'),
    (new.id, 'invoice_sent',
     E'{{garage_name}}: Your invoice {{reference}} for {{vehicle_reg}} is ready. Total £{{total}}. View and pay: {{status_url}}')
  on conflict (garage_id, template_key) do nothing;
  return new;
end;
$$;

commit;
