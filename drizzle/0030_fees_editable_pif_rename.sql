-- Ms. Jazz: stop auto-calculating Fee Due from Retro entirely — Retro, Fee
-- Due, Pending, and Fee Received should all be plain, independently
-- editable fields (Pending already was, as of 0029). Totals and the
-- pif_ready_to_close flag are unrelated derived aggregates and keep working
-- the same way.
CREATE OR REPLACE FUNCTION public.compute_fee_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Compute totals
  NEW.total_retro_due    = NEW.t16_retro + NEW.t2_retro + NEW.aux_retro;
  NEW.total_fees_expected = NEW.t16_fee_due + NEW.t2_fee_due + NEW.aux_fee_due;
  NEW.total_fees_paid    = NEW.t16_fee_received + NEW.t2_fee_received + NEW.aux_fee_received;

  -- Auto PIF flag
  NEW.pif_ready_to_close = (
    NEW.total_fees_expected > 0
    AND NEW.total_fees_paid >= NEW.total_fees_expected
  );

  RETURN NEW;
END;
$function$;
--> statement-breakpoint
-- Rename the "Fees Confirmation" dropdown to "PIF": Paid In Full -> Yes,
-- collapse Partial Payment + Pending (full/partial) into a single Pending,
-- add a new "No" state. No Fees Due / Overpaid are untouched.
--
-- Note: "Pending (full/partial)" was already renamed to "Pending" via the
-- Settings dropdown-options UI at some point after the 0011 seed, so
-- "Partial Payment" is dropped outright rather than renamed onto it (that
-- would collide with the unique (category, name) index).
UPDATE "dropdown_options" SET "name" = 'Yes' WHERE "category" = 'fees_confirmation' AND "name" = 'Paid In Full';
--> statement-breakpoint
DELETE FROM "dropdown_options" WHERE "category" = 'fees_confirmation' AND "name" = 'Partial Payment';
--> statement-breakpoint
DELETE FROM "dropdown_options" WHERE "category" = 'fees_confirmation' AND "name" = 'Pending (full/partial)';
--> statement-breakpoint
INSERT INTO "dropdown_options" ("category","name","sort_order") VALUES ('fees_confirmation','No',2)
ON CONFLICT ("category","name") DO NOTHING;
--> statement-breakpoint
-- Carry existing case data over to the renamed values.
UPDATE "fee_records" SET "fees_confirmation" = 'Yes' WHERE "fees_confirmation" = 'Paid In Full';
--> statement-breakpoint
UPDATE "fee_records" SET "fees_confirmation" = 'Pending' WHERE "fees_confirmation" IN ('Partial Payment', 'Pending (full/partial)');
