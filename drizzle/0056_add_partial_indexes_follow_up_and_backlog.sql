-- Partial indexes for two high-frequency queries that were full-scanning their
-- tables. Applied via scripts/apply-migration-0056.ts (not db:migrate) because
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--
-- Rollback (safe at any time — no data change, no dependent objects):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_fee_records_follow_up_open;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_inbound_call_records_unresolved;

CREATE INDEX CONCURRENTLY "idx_fee_records_follow_up_open" ON "fee_records" USING btree ("next_follow_up_date") WHERE is_closed = false;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_inbound_call_records_unresolved" ON "inbound_call_records" USING btree ("called_back_resolved") WHERE called_back_resolved = false;
