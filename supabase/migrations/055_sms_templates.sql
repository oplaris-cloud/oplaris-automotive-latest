-- ────────────────────────────────────────────────────────────────────
-- Migration 055 — per-garage SMS templates (P2.3)
--
-- Replaces three hardcoded message bodies in src/lib/sms (and the
-- associated route handlers) with manager-editable templates so each
-- garage can tune the wording (UK regional variation, name spelling,
-- branding) without a code change. Seed values match what's hardcoded
-- today verbatim, so applying this migration + landing the renderer
-- shouldn't change any outgoing SMS until a manager actually edits
-- a template.
--
-- Three keys covered in v1:
--   status_code      — OTP for the customer status page
--   approval_request — quote / charge approval prompt
--   mot_reminder     — MOT expiry reminder (dispatcher cron pending)
--
-- Other SMS types (quote_sent, quote_updated, invoice_sent) stay
-- hardcoded for now. They'll add as separate keys if/when a garage
-- asks for them; defaults are easy to seed on a follow-up migration.
-- ────────────────────────────────────────────────────────────────────

create table public.sms_templates (
  garage_id    uuid not null references public.garages(id) on delete cascade,
  template_key text not null,
  body         text not null,
  updated_at   timestamptz not null default now(),
  primary key (garage_id, template_key),

  constraint sms_template_key_check check (
    template_key in ('status_code', 'approval_request', 'mot_reminder')
  ),
  -- 1600 chars = 10 GSM segments. A manager won't write a 10-segment
  -- SMS by accident, and Twilio will happily concatenate up to ~6 in
  -- one delivery, so this is a generous-but-not-unbounded ceiling.
  constraint sms_template_body_length check (
    char_length(body) between 1 and 1600
  )
);

-- ───────────────────────────────────────────────────────────────────
-- RLS — manager-only, per-garage. Reads + updates are policy-gated;
-- inserts + deletes are revoked entirely (the seed below is the only
-- legitimate write path; managers can only UPDATE existing rows).
-- ───────────────────────────────────────────────────────────────────

alter table public.sms_templates enable row level security;

create policy sms_templates_select_manager on public.sms_templates
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

create policy sms_templates_update_manager on public.sms_templates
  for update to authenticated
  using (
    garage_id = private.current_garage()
    and private.has_role('manager')
  )
  with check (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

revoke insert, delete on public.sms_templates from authenticated;

-- ───────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ───────────────────────────────────────────────────────────────────

create or replace function private.touch_sms_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger sms_templates_touch_updated_at
  before update on public.sms_templates
  for each row execute function private.touch_sms_templates_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- Seed defaults for every existing garage + a trigger to seed for any
-- future garage row. Bodies are byte-identical to the hardcoded
-- strings they replace.
-- ───────────────────────────────────────────────────────────────────

insert into public.sms_templates (garage_id, template_key, body)
select g.id,
       'status_code',
       E'Your vehicle status code: {{code}}\nExpires in 10 minutes.'
from public.garages g
on conflict (garage_id, template_key) do nothing;

insert into public.sms_templates (garage_id, template_key, body)
select g.id,
       'approval_request',
       E'{{garage_name}} needs your approval: {{description}} — £{{amount}}.\n\nApprove or decline: {{approval_url}}'
from public.garages g
on conflict (garage_id, template_key) do nothing;

insert into public.sms_templates (garage_id, template_key, body)
select g.id,
       'mot_reminder',
       E'Hi from {{garage_name}}. Your vehicle {{vehicle_reg}} MOT expires on {{expiry_date}}. Reply to this message or call us to book a test.'
from public.garages g
on conflict (garage_id, template_key) do nothing;

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
     E'Hi from {{garage_name}}. Your vehicle {{vehicle_reg}} MOT expires on {{expiry_date}}. Reply to this message or call us to book a test.')
  on conflict (garage_id, template_key) do nothing;
  return new;
end;
$$;

create trigger garages_seed_sms_templates
  after insert on public.garages
  for each row execute function private.seed_default_sms_templates();
