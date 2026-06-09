-- One-time bookkeeping reconciliation for drizzle's migration ledger.
--
-- Why: prod's schema already has the 0014 (must_change_password) and 0015
-- (overpaid columns) changes + the 0016 backfill — they were applied via
-- push/manual, so they were NEVER recorded in drizzle.__drizzle_migrations,
-- which is current only through 0013 (max created_at = 1779897512004).
-- Because 0014's journal `when` (1780930560930) exceeds that, `db:migrate`
-- would otherwise try to RE-APPLY 0014 and fail with "column already exists".
--
-- This inserts ledger rows for 0014/0015/0016 with created_at = their journal
-- `when` values, so the ledger matches reality. After this, `db:migrate` skips
-- everything through 0016 and only runs FUTURE migrations. No DDL, no schema
-- change — purely the ledger.
--
-- IMPORTANT ordering:
--   1. The journal-repair branch (0015_overpaid_cases_columns +
--      0016_backfill_overpaid_checks_cleared_at) must be MERGED/deployed first,
--      so the repo's migration files match the `when`s used below.
--   2. Run this ON A NEON BRANCH (copy of prod) and verify `db:migrate` is a
--      clean no-op BEFORE running it against prod.
--   3. Do NOT run `db:migrate` against prod until this has run.
--
-- Target DB: the APP database (Neon / DATABASE_URL). Idempotent — re-runs
-- insert nothing (guarded on hash).

BEGIN;

-- Before: confirm the ledger currently tops out at 0013 (1779897512004).
SELECT MAX(created_at) AS max_created_at_before FROM drizzle.__drizzle_migrations;

-- 0014_faithful_aqueduct  (users.must_change_password)
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '87a09bc2b612dce8a64a0d31d3368608cbd2135c4652ffb6da2af5ace45f3410', 1780930560930
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = '87a09bc2b612dce8a64a0d31d3368608cbd2135c4652ffb6da2af5ace45f3410'
);

-- 0015_overpaid_cases_columns  (overpaid columns; idempotent ADD COLUMN IF NOT EXISTS)
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '6c3e50824c749a7c02f9358dd2c5d645521835662ae446fcb9a3e6f0c44d3e00', 1781022847980
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = '6c3e50824c749a7c02f9358dd2c5d645521835662ae446fcb9a3e6f0c44d3e00'
);

-- 0016_backfill_overpaid_checks_cleared_at  (checks_cleared_at backfill)
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT 'a73202a657138560f40bcc126b05186fec789ee2b224b2cd442c58cb35f490e4', 1781022889619
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = 'a73202a657138560f40bcc126b05186fec789ee2b224b2cd442c58cb35f490e4'
);

-- After: max should now be 1781022889619 (0016's when), and all three hashes present.
SELECT MAX(created_at) AS max_created_at_after FROM drizzle.__drizzle_migrations;
SELECT COUNT(*) AS reconciled_rows FROM drizzle.__drizzle_migrations
WHERE hash IN (
  '87a09bc2b612dce8a64a0d31d3368608cbd2135c4652ffb6da2af5ace45f3410',
  '6c3e50824c749a7c02f9358dd2c5d645521835662ae446fcb9a3e6f0c44d3e00',
  'a73202a657138560f40bcc126b05186fec789ee2b224b2cd442c58cb35f490e4'
);

COMMIT;
-- If max_created_at_after is not 1781022889619 or reconciled_rows is not 3,
-- ROLLBACK instead of COMMIT and investigate.
