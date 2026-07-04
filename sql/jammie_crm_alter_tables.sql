USE jammie_crm_db;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS refi_type           VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS cash_out_purpose    VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS lien_position       VARCHAR(50)  NULL DEFAULT 'First Lien',
  ADD COLUMN IF NOT EXISTS amort_term          SMALLINT     NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS credit_score        SMALLINT     NULL;

ALTER TABLE form_1003_main_borrower
  ADD COLUMN IF NOT EXISTS num_units           TINYINT      NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS construction_method VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS acreage             DECIMAL(8,2) NULL,
  ADD COLUMN IF NOT EXISTS orig_cost           DECIMAL(12,2)NULL,
  ADD COLUMN IF NOT EXISTS trust_info          VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS vesting_read        TEXT         NULL,
  ADD COLUMN IF NOT EXISTS lien_position       VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS amort_term          SMALLINT     NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS refi_type           VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS cash_out_purpose    VARCHAR(100) NULL;
