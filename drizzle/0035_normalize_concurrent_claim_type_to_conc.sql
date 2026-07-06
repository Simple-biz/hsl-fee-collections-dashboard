-- Root cause: at some point an admin renamed the "claim_type" dropdown
-- option from "CONC" to "CONCURRENT" via Settings. The Add Case modal and
-- the per-row Claim edit dropdown both source their options from that same
-- admin-managed list, so every case created since then got "CONCURRENT"
-- stored as its claim_type_label. But the rest of the app was never told:
-- the Master Fees "Claim" filter's CONC option, the claim-display
-- normalization in cases/route.ts + cases/[id]/route.ts + scoreboard's claim
-- column, and formatters.ts's fmtClaim/fmtClaimLong all only recognized
-- "T2_T16" (the legacy imported spelling) as a synonym for "CONC" — never
-- "CONCURRENT". Net effect: 22 real cases silently stopped showing up when
-- filtering/reporting by "CONC".
--
-- Fix: revert the dropdown option back to "CONC" (the dominant, established
-- convention — 768 cases already use it, vs. 22 on "CONCURRENT") so new
-- cases stop drifting, and backfill the 22 existing cases to match.
UPDATE "dropdown_options" SET "name" = 'CONC' WHERE "category" = 'claim_type' AND "name" = 'CONCURRENT';
--> statement-breakpoint
UPDATE "cases" SET "claim_type_label" = 'CONC' WHERE "claim_type_label" = 'CONCURRENT';
