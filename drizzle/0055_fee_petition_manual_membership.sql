-- Fee Petitions page membership is now a deliberate, manual action instead of
-- automatic. Until now the page derived its rows from the case's Level
-- (cases.level_won IN ('FEE_PETITION', 'FEE PETITION')), so picking "Fee
-- Petition" in the Level dropdown on Master Fees immediately added the case.
-- Staff asked for an explicit opt-in instead — the same move Overpaid Cases
-- made with marked_overpaid in 0048.
--
-- in_fee_petition becomes the sole membership gate (alongside the existing
-- "not closed" filter). Level and section membership are fully decoupled from
-- here on: changing Level neither adds nor removes a case, and the only ways
-- in/out are the "Add to Fee Petitions" batch action on Master Fees and
-- "Remove from Fee Petitions" on the Fee Petitions page.
ALTER TABLE "fee_records" ADD COLUMN "in_fee_petition" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Backfill so nothing disappears on deploy — the manual-add requirement is
-- for new cases going forward only. Deliberately NOT filtered on is_closed:
-- the page already excludes closed cases at query time, and flagging them too
-- means a closed Fee Petition case that gets reopened later comes back exactly
-- as it would have under the old Level-derived rule.
--
-- Both fee_records triggers are suspended for the backfill. This UPDATE sets
-- one membership flag and must not have any other effect; left enabled, the
-- two BEFORE UPDATE triggers would each cause real damage on the 197 rows:
--
--   trg_fee_records_compute_totals re-derives Pending from
--   (fee_due - fee_received). That silently resets the sheet-sourced Pending
--   on 8 closed rows which the Fees Closed sync deliberately wrote and which
--   0054 protects behind app.preserve_synced_pending (setting that flag isn't
--   enough here — its guard short-circuits for open rows, which would still
--   have Pending recomputed on 30 more).
--
--   trg_fee_records_updated_at bumps updated_at. /api/notifications builds its
--   "Recent fee payments" feed from fee_records touched in the last 7 days
--   with total_fees_paid > 0, newest first, LIMIT 15 — so the 98 backfilled
--   rows that have payments would take over that feed entirely for a week,
--   each appearing as a payment that just came in.
--
-- Both are BEFORE UPDATE FOR EACH ROW, so DISABLE TRIGGER is the whole fix;
-- there is no deferred work to lose. The ALTERs take a brief ACCESS EXCLUSIVE
-- lock on a ~2,900-row table.
ALTER TABLE "fee_records" DISABLE TRIGGER "trg_fee_records_compute_totals";--> statement-breakpoint
ALTER TABLE "fee_records" DISABLE TRIGGER "trg_fee_records_updated_at";--> statement-breakpoint

UPDATE "fee_records" AS fr
SET "in_fee_petition" = true
FROM "cases" AS c
WHERE c."client_id" = fr."case_id"
  AND c."level_won" IN ('FEE_PETITION', 'FEE PETITION');--> statement-breakpoint

ALTER TABLE "fee_records" ENABLE TRIGGER "trg_fee_records_compute_totals";--> statement-breakpoint
ALTER TABLE "fee_records" ENABLE TRIGGER "trg_fee_records_updated_at";
