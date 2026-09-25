/**
 * Rehearsal + production runner for migration 0057 (normalize enum spellings).
 *
 * Run against Neon branch first:
 *   npx dotenv-cli -e .env.neon-branch -- tsx scripts/apply-migration-0057.ts
 *
 * Then against prod (after go-ahead):
 *   npx dotenv-cli -e .env.local -- tsx scripts/apply-migration-0057.ts
 */
import postgres from "postgres";

async function main() {
  const db = process.env.DATABASE_URL!;
  console.log("Connecting to:", db.replace(/:[^:@]+@/, ":***@"));

  const sql = postgres(db, { max: 1, prepare: false });

  // ── Pre-flight counts ──────────────────────────────────────────────────────
  const [levelBefore] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE level_won = 'FEE_PETITION')    AS fee_petition_underscore,
      COUNT(*) FILTER (WHERE level_won = 'RECONSIDERATION') AS reconsideration
    FROM cases
  `;
  const [claimBefore] = await sql`
    SELECT COUNT(*) AS t2_t16 FROM cases WHERE claim_type_label = 'T2_T16'
  `;
  const [statusBefore] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE win_sheet_status = 'started')      AS started_lower,
      COUNT(*) FILTER (WHERE win_sheet_status = 'paid_in_full') AS paid_in_full,
      COUNT(*) FILTER (WHERE win_sheet_status = 'closed')       AS closed_legacy
    FROM fee_records
  `;

  console.log("\nPre-flight:");
  console.log("  level FEE_PETITION (underscore):", levelBefore.fee_petition_underscore);
  console.log("  level RECONSIDERATION:           ", levelBefore.reconsideration);
  console.log("  claim T2_T16:                    ", claimBefore.t2_t16);
  console.log("  status started (lower):          ", statusBefore.started_lower);
  console.log("  status paid_in_full:             ", statusBefore.paid_in_full);
  console.log("  status closed (legacy):          ", statusBefore.closed_legacy);

  // ── cases.level_won ────────────────────────────────────────────────────────
  const r1 = await sql`UPDATE cases SET level_won = 'FEE PETITION' WHERE level_won = 'FEE_PETITION'`;
  console.log("\n[1] FEE_PETITION → FEE PETITION:", r1.count, "rows");

  const r2 = await sql`UPDATE cases SET level_won = 'RECON' WHERE level_won = 'RECONSIDERATION'`;
  console.log("[2] RECONSIDERATION → RECON:    ", r2.count, "rows");

  // ── cases.claim_type_label ─────────────────────────────────────────────────
  const r3 = await sql`UPDATE cases SET claim_type_label = 'CONC' WHERE claim_type_label = 'T2_T16'`;
  console.log("[3] T2_T16 → CONC:              ", r3.count, "rows");

  // ── fee_records.win_sheet_status (triggers suspended) ─────────────────────
  await sql`ALTER TABLE fee_records DISABLE TRIGGER trg_fee_records_compute_totals`;
  await sql`ALTER TABLE fee_records DISABLE TRIGGER trg_fee_records_updated_at`;
  console.log("[*] fee_records triggers disabled");

  const r4 = await sql`UPDATE fee_records SET win_sheet_status = 'Started' WHERE win_sheet_status = 'started'`;
  console.log("[4] started → Started:           ", r4.count, "rows");

  const r5 = await sql`UPDATE fee_records SET win_sheet_status = 'Finished' WHERE win_sheet_status IN ('paid_in_full', 'closed')`;
  console.log("[5] paid_in_full/closed → Finished:", r5.count, "rows");

  await sql`ALTER TABLE fee_records ENABLE TRIGGER trg_fee_records_compute_totals`;
  await sql`ALTER TABLE fee_records ENABLE TRIGGER trg_fee_records_updated_at`;
  console.log("[*] fee_records triggers re-enabled");

  // ── Post-flight verification ───────────────────────────────────────────────
  const [remaining] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE level_won IN ('FEE_PETITION', 'RECONSIDERATION')) AS bad_levels,
      COUNT(*) FILTER (WHERE claim_type_label = 'T2_T16')                      AS bad_claims
    FROM cases
  `;
  const [statusRemaining] = await sql`
    SELECT COUNT(*) FILTER (WHERE win_sheet_status IN ('started', 'paid_in_full', 'closed')) AS bad_statuses
    FROM fee_records
  `;

  console.log("\nPost-flight (should all be 0):");
  console.log("  bad level spellings: ", remaining.bad_levels);
  console.log("  bad claim spellings: ", remaining.bad_claims);
  console.log("  bad status spellings:", statusRemaining.bad_statuses);

  if (Number(remaining.bad_levels) + Number(remaining.bad_claims) + Number(statusRemaining.bad_statuses) > 0) {
    console.error("\n❌ Post-flight check FAILED — unexpected rows remain");
    process.exit(1);
  }

  console.log("\n✓ Migration 0057 applied cleanly");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
