ALTER TABLE "fee_records" ALTER COLUMN "t16_fee_due" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "fee_records" ALTER COLUMN "t2_fee_due" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "fee_records" ALTER COLUMN "aux_fee_due" DROP DEFAULT;
-- Revises the PIF automation (0032-0034) per further Slack clarification:
--
-- 1. Automation should only kick in once money has actually been received
-- somewhere relevant. A case where nothing has been received yet — whether
-- Fee Due is blank or already set — is left alone (shown as "-"), since Win
-- Sheet Status already covers "not started". This drops "No Fees Due" and
-- the "all sections blank -> Pending" rule from the *automation* entirely;
-- "No Fees Due" remains available as a manual dropdown selection, just
-- never auto-applied.
--
-- 2. For multi-section claims (T2 = T2+AUX; Concurrent = T16+T2+AUX), once
-- ONE section is paid, an untouched or partially-paid sibling section must
-- force "No" (still expecting fees on the other claim) rather than being
-- silently ignored — UNLESS staff explicitly entered $0.00 for that
-- section's Fee Due, which confirms "no fee applies here" and lets it pass.
-- Telling "$0.00 on purpose" apart from "never touched" is exactly what the
-- dropped column defaults above make possible.
CREATE OR REPLACE FUNCTION public.compute_fee_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_claim_type text;
  v_skip boolean;
  v_covered boolean;
  t16_due numeric; t16_rcv numeric; t16_pnd numeric;
  t2_due  numeric; t2_rcv  numeric; t2_pnd  numeric;
  aux_due numeric; aux_rcv numeric; aux_pnd numeric;
  t16_no_fee boolean; t16_started boolean; t16_anomaly boolean; t16_overpaid boolean; t16_matched boolean; t16_satisfied boolean;
  t2_no_fee  boolean; t2_started  boolean; t2_anomaly  boolean; t2_overpaid  boolean; t2_matched  boolean; t2_satisfied  boolean;
  aux_no_fee boolean; aux_started boolean; aux_anomaly boolean; aux_overpaid boolean; aux_matched boolean; aux_satisfied boolean;
  rel_any_started boolean;
  rel_any_overpaid boolean;
  rel_any_anomaly boolean;
  rel_all_satisfied boolean;
BEGIN
  -- Compute totals (unchanged)
  NEW.total_retro_due    = NEW.t16_retro + NEW.t2_retro + NEW.aux_retro;
  NEW.total_fees_expected = NEW.t16_fee_due + NEW.t2_fee_due + NEW.aux_fee_due;
  NEW.total_fees_paid    = NEW.t16_fee_received + NEW.t2_fee_received + NEW.aux_fee_received;

  -- Auto PIF flag (unchanged — still feeds the dashboard's "marked PIF" count)
  NEW.pif_ready_to_close = (
    NEW.total_fees_expected > 0
    AND NEW.total_fees_paid >= NEW.total_fees_expected
  );

  IF TG_OP = 'UPDATE' THEN
    v_skip := NEW.fees_confirmation IS DISTINCT FROM OLD.fees_confirmation;
  ELSE
    v_skip := NEW.fees_confirmation IS NOT NULL;
  END IF;

  IF NOT NEW.is_closed AND NOT v_skip THEN
    SELECT claim_type_label INTO v_claim_type FROM cases WHERE client_id = NEW.case_id;

    t16_due := COALESCE(NEW.t16_fee_due, 0); t16_rcv := COALESCE(NEW.t16_fee_received, 0); t16_pnd := COALESCE(NEW.t16_pending, 0);
    t2_due  := COALESCE(NEW.t2_fee_due, 0);  t2_rcv  := COALESCE(NEW.t2_fee_received, 0);  t2_pnd  := COALESCE(NEW.t2_pending, 0);
    aux_due := COALESCE(NEW.aux_fee_due, 0); aux_rcv := COALESCE(NEW.aux_fee_received, 0); aux_pnd := COALESCE(NEW.aux_pending, 0);

    -- "no fee" = staff explicitly entered $0.00 (distinct from a field left
    -- untouched, which stays NULL now that the column default is dropped).
    t16_no_fee := NEW.t16_fee_due IS NOT NULL AND NEW.t16_fee_due = 0;
    t2_no_fee  := NEW.t2_fee_due  IS NOT NULL AND NEW.t2_fee_due  = 0;
    aux_no_fee := NEW.aux_fee_due IS NOT NULL AND NEW.aux_fee_due = 0;

    t16_started   := t16_rcv > 0;
    t16_anomaly   := t16_due = 0 AND t16_rcv > 0;
    t16_overpaid  := t16_due > 0 AND t16_rcv > t16_due;
    t16_matched   := t16_due > 0 AND (t16_rcv = t16_due OR (t16_rcv < t16_due AND (t16_rcv + t16_pnd) = t16_due));
    t16_satisfied := t16_matched OR t16_no_fee;

    t2_started   := t2_rcv > 0;
    t2_anomaly   := t2_due = 0 AND t2_rcv > 0;
    t2_overpaid  := t2_due > 0 AND t2_rcv > t2_due;
    t2_matched   := t2_due > 0 AND (t2_rcv = t2_due OR (t2_rcv < t2_due AND (t2_rcv + t2_pnd) = t2_due));
    t2_satisfied := t2_matched OR t2_no_fee;

    aux_started   := aux_rcv > 0;
    aux_anomaly   := aux_due = 0 AND aux_rcv > 0;
    aux_overpaid  := aux_due > 0 AND aux_rcv > aux_due;
    aux_matched   := aux_due > 0 AND (aux_rcv = aux_due OR (aux_rcv < aux_due AND (aux_rcv + aux_pnd) = aux_due));
    aux_satisfied := aux_matched OR aux_no_fee;

    v_covered := true;
    IF v_claim_type = 'T16' THEN
      rel_any_started   := t16_started;
      rel_any_overpaid  := t16_overpaid;
      rel_any_anomaly   := t16_anomaly;
      rel_all_satisfied := t16_satisfied;
    ELSIF v_claim_type = 'T2' THEN
      rel_any_started   := t2_started OR aux_started;
      rel_any_overpaid  := t2_overpaid OR aux_overpaid;
      rel_any_anomaly   := t2_anomaly OR aux_anomaly;
      rel_all_satisfied := t2_satisfied AND aux_satisfied;
    ELSIF v_claim_type IN ('CONC', 'CONCURRENT', 'T2_T16') THEN
      rel_any_started   := t16_started OR t2_started OR aux_started;
      rel_any_overpaid  := t16_overpaid OR t2_overpaid OR aux_overpaid;
      rel_any_anomaly   := t16_anomaly OR t2_anomaly OR aux_anomaly;
      rel_all_satisfied := t16_satisfied AND t2_satisfied AND aux_satisfied;
    ELSE
      v_covered := false;
    END IF;

    -- Nothing received anywhere relevant yet: leave fees_confirmation
    -- untouched (renders as "-") rather than auto-tagging anything.
    IF v_covered AND rel_any_started THEN
      IF rel_any_overpaid THEN
        NEW.fees_confirmation := 'Overpaid';
        NEW.marked_overpaid := true;
      ELSIF rel_any_anomaly THEN
        NEW.fees_confirmation := 'Pending';
      ELSIF rel_all_satisfied THEN
        NEW.fees_confirmation := 'Yes';
      ELSE
        NEW.fees_confirmation := 'No';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
