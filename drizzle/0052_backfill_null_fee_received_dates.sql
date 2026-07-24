-- Backfill t2_fee_received_date for 3 rows where t2_fee_received > 0 but
-- the date column is NULL, making those fees invisible to all windowed
-- "Fees Collected" views in the scoreboard and agent tracking pages.
--
-- Strategy (in priority order):
--   1. Use the most recent fee_payments.received_date for the case/type
--      (cases 43159563 and 40976365 — both have ledger rows dated 2026-06-29)
--   2. Fall back to fee_records.created_at::date for cases with no ledger
--      row (case 45127522 — fee arrived via sync/import, no payment row)
UPDATE fee_records
SET t2_fee_received_date = COALESCE(
  (SELECT MAX(fp.received_date)
   FROM fee_payments fp
   WHERE fp.case_id = fee_records.case_id
     AND fp.fee_type = 't2'),
  fee_records.created_at::date
)
WHERE t2_fee_received > 0
  AND t2_fee_received_date IS NULL;
