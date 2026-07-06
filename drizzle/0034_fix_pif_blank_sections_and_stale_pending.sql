-- Two fixes found while dry-running the backfill against real Master Fees
-- data (0032/0033's logic, unchanged until now):
--
-- 1. A blank section (Fee Due = Received = Pending = 0) was never allowed to
-- count as "fine" — only a fully-blank *case* got "No Fees Due"; a case with
-- ANY blank relevant section fell to "No", even if every other relevant
-- section was perfectly paid. In practice this hit concurrent (T2/T16/AUX)
-- claims constantly: a "T2_T16" case that only ever had a T2 component (T16
-- permanently zero) or never had an AUX component (AUX permanently zero) got
-- marked "No" despite being fully resolved. Fix: a blank section no longer
-- blocks Yes UNLESS every relevant section is blank (which still correctly
-- means "nothing assessed yet" -> No Fees Due).
--
-- 2. "Overpaid" and "matched" compared Received+Pending against Fee Due,
-- but several real cases have a Pending value that was never decremented
-- after payment posted (e.g. Fee Due $7,162.25, Received $7,358.73 already
-- over, Pending still sitting at the original $7,162.25) — Received+Pending
-- wildly overshoots Fee Due even though the truth is simpler: it's just
-- overpaid (or, in other rows, not actually overpaid at all — Received
-- alone was still under Fee Due and the stale Pending only made it look
-- overpaid). Fix: Received alone decides overpaid/matched first — if
-- Received already meets or exceeds Fee Due, Pending is irrelevant. Pending
-- only matters for the "still owed, but the remainder is accounted for"
-- case, i.e. when Received is genuinely still under Fee Due — same as
-- before for that case.
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
  t16_blank boolean; t16_anomaly boolean; t16_overpaid boolean; t16_matched boolean;
  t2_blank  boolean; t2_anomaly  boolean; t2_overpaid  boolean; t2_matched  boolean;
  aux_blank boolean; aux_anomaly boolean; aux_overpaid boolean; aux_matched boolean;
  rel_all_blank boolean;
  rel_any_overpaid boolean;
  rel_any_anomaly boolean;
  rel_all_matched_or_blank boolean;
BEGIN
  -- Compute totals
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

    t16_blank    := t16_due = 0 AND t16_rcv = 0 AND t16_pnd = 0;
    t16_anomaly  := t16_due = 0 AND t16_rcv > 0;
    t16_overpaid := t16_due > 0 AND t16_rcv > t16_due;
    t16_matched  := t16_due > 0 AND (t16_rcv = t16_due OR (t16_rcv < t16_due AND (t16_rcv + t16_pnd) = t16_due));

    t2_blank    := t2_due = 0 AND t2_rcv = 0 AND t2_pnd = 0;
    t2_anomaly  := t2_due = 0 AND t2_rcv > 0;
    t2_overpaid := t2_due > 0 AND t2_rcv > t2_due;
    t2_matched  := t2_due > 0 AND (t2_rcv = t2_due OR (t2_rcv < t2_due AND (t2_rcv + t2_pnd) = t2_due));

    aux_blank    := aux_due = 0 AND aux_rcv = 0 AND aux_pnd = 0;
    aux_anomaly  := aux_due = 0 AND aux_rcv > 0;
    aux_overpaid := aux_due > 0 AND aux_rcv > aux_due;
    aux_matched  := aux_due > 0 AND (aux_rcv = aux_due OR (aux_rcv < aux_due AND (aux_rcv + aux_pnd) = aux_due));

    v_covered := true;
    IF v_claim_type = 'T16' THEN
      rel_all_blank            := t16_blank;
      rel_any_overpaid         := t16_overpaid;
      rel_any_anomaly          := t16_anomaly;
      rel_all_matched_or_blank := t16_matched OR t16_blank;
    ELSIF v_claim_type = 'T2' THEN
      rel_all_blank            := t2_blank AND aux_blank;
      rel_any_overpaid         := t2_overpaid OR aux_overpaid;
      rel_any_anomaly          := t2_anomaly OR aux_anomaly;
      rel_all_matched_or_blank := (t2_matched OR t2_blank) AND (aux_matched OR aux_blank);
    ELSIF v_claim_type IN ('CONC', 'CONCURRENT', 'T2_T16') THEN
      rel_all_blank            := t16_blank AND t2_blank AND aux_blank;
      rel_any_overpaid         := t16_overpaid OR t2_overpaid OR aux_overpaid;
      rel_any_anomaly          := t16_anomaly OR t2_anomaly OR aux_anomaly;
      rel_all_matched_or_blank := (t16_matched OR t16_blank) AND (t2_matched OR t2_blank) AND (aux_matched OR aux_blank);
    ELSE
      v_covered := false;
    END IF;

    IF v_covered THEN
      IF rel_all_blank THEN
        NEW.fees_confirmation := 'No Fees Due';
      ELSIF rel_any_overpaid THEN
        NEW.fees_confirmation := 'Overpaid';
        NEW.marked_overpaid := true;
      ELSIF rel_any_anomaly THEN
        NEW.fees_confirmation := 'Pending';
      ELSIF rel_all_matched_or_blank THEN
        NEW.fees_confirmation := 'Yes';
      ELSE
        NEW.fees_confirmation := 'No';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
