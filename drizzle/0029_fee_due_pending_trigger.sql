-- Custom SQL migration file, put your code below! --

-- Ms. Jazz: Fee Due should follow a formula (25% of Retro, capped at the
-- case's applicable_fee_cap); Pending should be freely editable — leaders
-- need to be able to zero it out for PIF cases without it snapping back.
--
-- This swaps which field the trigger enforces: Pending is no longer touched
-- here at all (was previously forced to GREATEST(Due - Received, 0) on every
-- write, discarding manual edits). Fee Due now auto-tracks Retro, but only
-- when a write doesn't also explicitly set Fee Due itself — this preserves
-- FeeEditModal's existing manual-override affordance (negotiated fees) on
-- the standalone Case Page instead of stomping on it every time an unrelated
-- field changes, which is the exact bug class this migration is fixing for
-- Pending.
CREATE OR REPLACE FUNCTION public.compute_fee_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.t16_fee_due = LEAST(NEW.t16_retro * 0.25, NEW.applicable_fee_cap);
    NEW.t2_fee_due  = LEAST(NEW.t2_retro * 0.25, NEW.applicable_fee_cap);
    NEW.aux_fee_due = LEAST(NEW.aux_retro * 0.25, NEW.applicable_fee_cap);
  ELSE
    IF NEW.t16_fee_due IS NOT DISTINCT FROM OLD.t16_fee_due
       AND NEW.t16_retro IS DISTINCT FROM OLD.t16_retro THEN
      NEW.t16_fee_due = LEAST(NEW.t16_retro * 0.25, NEW.applicable_fee_cap);
    END IF;
    IF NEW.t2_fee_due IS NOT DISTINCT FROM OLD.t2_fee_due
       AND NEW.t2_retro IS DISTINCT FROM OLD.t2_retro THEN
      NEW.t2_fee_due = LEAST(NEW.t2_retro * 0.25, NEW.applicable_fee_cap);
    END IF;
    IF NEW.aux_fee_due IS NOT DISTINCT FROM OLD.aux_fee_due
       AND NEW.aux_retro IS DISTINCT FROM OLD.aux_retro THEN
      NEW.aux_fee_due = LEAST(NEW.aux_retro * 0.25, NEW.applicable_fee_cap);
    END IF;
  END IF;

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
