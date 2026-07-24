-- Fix fee_received_date values where the year was entered as "26" instead of
-- "2026", resulting in dates like 0026-07-10 that never match any windowed
-- query (the window predicates use CURRENT_DATE, which is ~2000 years ahead).
-- Affected rows: 1 T16 row ($1,498.19 hidden) and 1 T2 row ($479.04 hidden).
-- Strategy: add 2000 years to any received_date whose year is before 2000.
UPDATE fee_records
SET t16_fee_received_date = (t16_fee_received_date + INTERVAL '2000 years')::date
WHERE t16_fee_received > 0
  AND t16_fee_received_date IS NOT NULL
  AND EXTRACT(YEAR FROM t16_fee_received_date) < 2000;

UPDATE fee_records
SET t2_fee_received_date = (t2_fee_received_date + INTERVAL '2000 years')::date
WHERE t2_fee_received > 0
  AND t2_fee_received_date IS NOT NULL
  AND EXTRACT(YEAR FROM t2_fee_received_date) < 2000;

UPDATE fee_records
SET aux_fee_received_date = (aux_fee_received_date + INTERVAL '2000 years')::date
WHERE aux_fee_received > 0
  AND aux_fee_received_date IS NOT NULL
  AND EXTRACT(YEAR FROM aux_fee_received_date) < 2000;
