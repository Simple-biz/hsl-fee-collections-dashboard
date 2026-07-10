-- Overpaid Cases page listing is now a deliberate, manual action instead of
-- automatic. fees_confirmation still auto-flips to 'Overpaid' the moment
-- Received exceeds Due (unchanged) — that's the PIF/status signal and stays
-- automatic. What changes: this trigger no longer also sets marked_overpaid,
-- which is the sole gate on the Overpaid Cases page's query. A case that's
-- flagged 'Overpaid' now needs a separate "Add to Overpaid Cases" click
-- (sets marked_overpaid via the existing feeFields PATCH path) before it
-- shows up there.
CREATE OR REPLACE FUNCTION public.compute_fee_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_claim_type text;
  v_skip boolean;
  v_covered boolean;
  t16_due numeric; t16_rcv numeric;
  t2_due  numeric; t2_rcv  numeric;
  aux_due numeric; aux_rcv numeric;
  t16_due_set boolean; t16_no_fee boolean; t16_started boolean; t16_anomaly boolean; t16_overpaid boolean; t16_matched boolean; t16_satisfied boolean;
  t2_due_set  boolean; t2_no_fee  boolean; t2_started  boolean; t2_anomaly  boolean; t2_overpaid  boolean; t2_matched  boolean; t2_satisfied  boolean;
  aux_due_set boolean; aux_no_fee boolean; aux_started boolean; aux_anomaly boolean; aux_overpaid boolean; aux_matched boolean; aux_satisfied boolean;
  rel_any_started boolean;
  rel_any_overpaid boolean;
  rel_any_anomaly boolean;
  rel_all_satisfied boolean;
BEGIN
  -- Compute totals — NULL-safe now (an untouched Fee Due contributes $0 to
  -- the sum, same as Retro/Received always have).
  NEW.total_retro_due    = COALESCE(NEW.t16_retro, 0) + COALESCE(NEW.t2_retro, 0) + COALESCE(NEW.aux_retro, 0);
  NEW.total_fees_expected = COALESCE(NEW.t16_fee_due, 0) + COALESCE(NEW.t2_fee_due, 0) + COALESCE(NEW.aux_fee_due, 0);
  NEW.total_fees_paid    = COALESCE(NEW.t16_fee_received, 0) + COALESCE(NEW.t2_fee_received, 0) + COALESCE(NEW.aux_fee_received, 0);

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

  IF NOT NEW.is_closed THEN
    -- Pending is a Master Fees (open-case) concept only — auto-calculated
    -- as Fee Due minus Fee Received, overwritten on every write to an open
    -- record regardless of what was passed in. Closed records are never
    -- touched here; whatever Pending they were closed with stays frozen.
    NEW.t16_pending = NEW.t16_fee_due - NEW.t16_fee_received;
    NEW.t2_pending  = NEW.t2_fee_due  - NEW.t2_fee_received;
    NEW.aux_pending = NEW.aux_fee_due - NEW.aux_fee_received;

    IF NOT v_skip THEN
      SELECT claim_type_label INTO v_claim_type FROM cases WHERE client_id = NEW.case_id;

      t16_due := COALESCE(NEW.t16_fee_due, 0); t16_rcv := COALESCE(NEW.t16_fee_received, 0);
      t2_due  := COALESCE(NEW.t2_fee_due, 0);  t2_rcv  := COALESCE(NEW.t2_fee_received, 0);
      aux_due := COALESCE(NEW.aux_fee_due, 0); aux_rcv := COALESCE(NEW.aux_fee_received, 0);

      t16_due_set := NEW.t16_fee_due IS NOT NULL;
      t2_due_set  := NEW.t2_fee_due  IS NOT NULL;
      aux_due_set := NEW.aux_fee_due IS NOT NULL;

      -- "no fee" = staff explicitly entered $0.00.
      t16_no_fee := t16_due_set AND t16_due = 0;
      t2_no_fee  := t2_due_set  AND t2_due  = 0;
      aux_no_fee := aux_due_set AND aux_due  = 0;

      t16_started  := t16_rcv > 0;
      -- Received but Fee Due was never entered at all (still NULL) — needs
      -- someone to go set it, not a real overpayment.
      t16_anomaly  := NOT t16_due_set AND t16_rcv > 0;
      -- Overpaid the moment a real Fee Due value exists (even $0.00) and
      -- Received exceeds it — Pending (Due - Received) goes negative.
      t16_overpaid := t16_due_set AND t16_rcv > t16_due;
      t16_matched  := t16_due_set AND t16_due > 0 AND t16_rcv = t16_due;
      t16_satisfied := t16_matched OR t16_no_fee;

      t2_started  := t2_rcv > 0;
      t2_anomaly  := NOT t2_due_set AND t2_rcv > 0;
      t2_overpaid := t2_due_set AND t2_rcv > t2_due;
      t2_matched  := t2_due_set AND t2_due > 0 AND t2_rcv = t2_due;
      t2_satisfied := t2_matched OR t2_no_fee;

      aux_started  := aux_rcv > 0;
      aux_anomaly  := NOT aux_due_set AND aux_rcv > 0;
      aux_overpaid := aux_due_set AND aux_rcv > aux_due;
      aux_matched  := aux_due_set AND aux_due > 0 AND aux_rcv = aux_due;
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
          -- marked_overpaid is NOT set here anymore — that's now a deliberate
          -- "Add to Overpaid Cases" action (Master Fees), independent of this
          -- auto-classification. overpaid_dismissed_at is likewise left alone.
        ELSIF rel_any_anomaly THEN
          NEW.fees_confirmation := 'Pending';
        ELSIF rel_all_satisfied THEN
          NEW.fees_confirmation := 'Yes';
        ELSE
          NEW.fees_confirmation := 'No';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
