-- 016_checked_in_status.sql — Add 'checked_in' to job_status enum
-- Walk-in check-ins from kiosk start as 'checked_in' instead of 'draft'.

alter type job_status add value if not exists 'checked_in' before 'booked';
