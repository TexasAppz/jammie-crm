-- ============================================================================
-- Migration 03: drop legacy leads columns now confirmed safe to remove
--
-- I held off on this in migration_02 until I could see the actual server
-- route code. Now that I have leads.cjs, I can confirm:
--   - GET  does `SELECT * FROM leads`            (no column names referenced)
--   - POST does `INSERT INTO leads SET ?`         (raw req.body, no whitelist)
--   - PUT  does `UPDATE leads SET ? WHERE id=?`   (same)
-- Nothing in the API references first_nm, last_nm, or status by name, so
-- they're pure dead weight now that name/loan_status exist and are backfilled.
--
-- More importantly: first_nm/last_nm are NOT NULL with no default. Since the
-- app's Lead form only ever sends a single `name` field (never first_nm/
-- last_nm), every "+ New Lead" submission would currently fail with a
-- "Field 'first_nm' doesn't have a default value" SQL error, even after
-- migration_02. Dropping these columns removes that failure at the root.
--
-- Run this AFTER migration_02.
-- ============================================================================

ALTER TABLE leads
  DROP COLUMN first_nm,
  DROP COLUMN last_nm,
  DROP COLUMN status;

-- Verify:
-- DESCRIBE leads;
