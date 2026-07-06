-- Sheets/MyCase imports pass FEES CONFIRMATION text through verbatim, so a
-- batch of older synced rows carry the literal "YES" (all-caps) instead of
-- the dropdown's canonical "Yes" introduced in 0030 — same value, different
-- casing. Normalize the existing rows; the import mappers themselves are
-- untouched (separate, pre-existing gap: they don't validate/normalize
-- against dropdown_options on ingest).
UPDATE "fee_records" SET "fees_confirmation" = 'Yes' WHERE "fees_confirmation" = 'YES';
