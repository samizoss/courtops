-- QA finding (2026-07-01): time_clock_edits.time_clock_id was ON DELETE CASCADE,
-- so deleting a clock entry destroyed its own 'delete' audit row (and all prior
-- edit history for that entry). Audit rows must survive the deletion they record.
-- SET NULL keeps the history; old_values preserves what the entry contained.

ALTER TABLE time_clock_edits ALTER COLUMN time_clock_id DROP NOT NULL;

ALTER TABLE time_clock_edits
  DROP CONSTRAINT time_clock_edits_time_clock_id_fkey;

ALTER TABLE time_clock_edits
  ADD CONSTRAINT time_clock_edits_time_clock_id_fkey
  FOREIGN KEY (time_clock_id) REFERENCES time_clock(id) ON DELETE SET NULL;
