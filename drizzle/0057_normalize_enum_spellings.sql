-- Normalize stored enum spellings so every value matches the canonical form
-- served by the admin dropdown and expected by the display layer.
-- Data-only migration — no schema changes.
--
-- cases.level_won: two legacy spellings not in the dropdown
--   FEE_PETITION    (82)  → FEE PETITION  (canonical, in dropdown)
--   RECONSIDERATION (30)  → RECON         (canonical, in dropdown)
-- No triggers on cases; no special handling needed.

UPDATE "cases"
SET "level_won" = 'FEE PETITION'
WHERE "level_won" = 'FEE_PETITION';
--> statement-breakpoint

UPDATE "cases"
SET "level_won" = 'RECON'
WHERE "level_won" = 'RECONSIDERATION';
--> statement-breakpoint

-- cases.claim_type_label: T2_T16 is concurrent T2+T16, same as CONC
--   T2_T16 (292) → CONC

UPDATE "cases"
SET "claim_type_label" = 'CONC'
WHERE "claim_type_label" = 'T2_T16';
--> statement-breakpoint

-- fee_records.win_sheet_status: three spellings to normalize
--   started      (179) → Started   (casing)
--   paid_in_full   (1) → Finished  (semantic equivalence)
--   closed      (1352) → Finished  (legacy; set when cases were closed)
--
-- Both BEFORE UPDATE triggers are suspended for this batch.
--
--   trg_fee_records_compute_totals re-derives Pending from
--   (fee_due - fee_received). Left enabled, it would silently corrupt the
--   sheet-sourced Pending value on closed rows that 0054 protects.
--
--   trg_fee_records_updated_at bumps updated_at. Left enabled, the 1,352
--   closed rows with payments would flood the notifications "Recent payments"
--   feed (last-7-days, LIMIT 15) for a week, appearing as brand-new payments.
--
-- Both are BEFORE UPDATE FOR EACH ROW; DISABLE TRIGGER covers the batch with
-- a brief ACCESS EXCLUSIVE lock on the ~3k-row table. Same pattern as 0055.

ALTER TABLE "fee_records" DISABLE TRIGGER "trg_fee_records_compute_totals";
--> statement-breakpoint
ALTER TABLE "fee_records" DISABLE TRIGGER "trg_fee_records_updated_at";
--> statement-breakpoint

UPDATE "fee_records"
SET "win_sheet_status" = 'Started'
WHERE "win_sheet_status" = 'started';
--> statement-breakpoint

UPDATE "fee_records"
SET "win_sheet_status" = 'Finished'
WHERE "win_sheet_status" IN ('paid_in_full', 'closed');
--> statement-breakpoint

ALTER TABLE "fee_records" ENABLE TRIGGER "trg_fee_records_compute_totals";
--> statement-breakpoint
ALTER TABLE "fee_records" ENABLE TRIGGER "trg_fee_records_updated_at";
