-- Custom SQL migration file, put your code below! --

-- Null out checks_cleared_at on un-cleared overpaid rows. Before the fix to
-- upsertOverpaidCase / bulkRestoreCleared, un-clearing (restore) still stamped
-- checks_cleared_at with the current time, misrepresenting "when checks cleared".
-- Idempotent: re-runs match zero rows.
UPDATE "overpaid_cases" SET "checks_cleared_at" = NULL WHERE "checks_cleared" = false;