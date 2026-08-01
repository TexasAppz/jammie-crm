-- ============================================================================
-- Migration: add missing "Calculating Cash to Close" columns to `loans`
--
-- Why: Form1003's handleSave/autoSave sends these 5 fields on every save
-- (Review Fees tab), but they don't exist in the live `loans` table.
-- Confirmed by diffing the JSX save payload against the live schema
-- (jammie_crm_backup_20260801.sql) — these are the only 5 fields missing.
--
-- Safe to run: pure additive ALTER, no data loss, all nullable.
-- ============================================================================

ALTER TABLE loans
  ADD COLUMN earnest_money_deposit     DECIMAL(12,2) NULL AFTER dti_back,
  ADD COLUMN seller_credits            DECIMAL(12,2) NULL AFTER earnest_money_deposit,
  ADD COLUMN funds_for_borrower        DECIMAL(12,2) NULL AFTER seller_credits,
  ADD COLUMN closing_costs_financed    DECIMAL(12,2) NULL AFTER funds_for_borrower,
  ADD COLUMN adjustments_other_credits DECIMAL(12,2) NULL AFTER closing_costs_financed;

-- Verify:
-- DESCRIBE loans;
