-- ============================================================================
-- Migration 02: bring `leads` and `contacts` in line with the app
--
-- Root cause: these two tables were never migrated to the newer schema
-- your own jammie_crm_schema.sql already describes. Right now they still
-- use a first_nm/last_nm split (and other old column names), while the
-- app reads/writes a single `name` field plus several columns that don't
-- exist yet at all (lead_number, purpose, loan_amount, officer).
--
-- Safety: this migration is ADDITIVE ONLY.
--   - No existing column is renamed or dropped.
--   - No existing row is deleted.
--   - Every new column is backfilled from existing data where possible.
-- Old columns (first_nm, last_nm, status, contact_type) are left in place
-- for now. Once the server route files confirm nothing else reads them,
-- send a follow-up cleanup migration to drop them — don't drop them yet.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN name        VARCHAR(255)  NULL AFTER mlo_id,
  ADD COLUMN loan_status VARCHAR(50)   NULL DEFAULT 'New' AFTER status,
  ADD COLUMN lead_number VARCHAR(50)   NULL AFTER name,
  ADD COLUMN purpose     VARCHAR(50)   NULL DEFAULT 'Purchase' AFTER source,
  ADD COLUMN loan_amount DECIMAL(14,2) NULL AFTER purpose,
  ADD COLUMN officer     VARCHAR(50)   NULL DEFAULT 'IC' AFTER loan_amount,
  ADD COLUMN created_date VARCHAR(50)  NULL AFTER created_at;

-- Backfill name from the existing split columns
UPDATE leads
SET name = TRIM(CONCAT(first_nm, ' ', last_nm))
WHERE name IS NULL;

-- Backfill loan_status from the existing status column
UPDATE leads
SET loan_status = status
WHERE loan_status IS NULL;

-- Backfill a display-formatted created_date from created_at
-- (approximates the app's "Feb 3, 2026" format; cosmetic only)
UPDATE leads
SET created_date = TRIM(REPLACE(DATE_FORMAT(created_at, '%b %e, %Y'), '  ', ' '))
WHERE created_date IS NULL;

-- Backfill officer default for existing rows
UPDATE leads
SET officer = 'IC'
WHERE officer IS NULL;

-- Generate a lead_number for existing rows that don't have one
UPDATE leads
SET lead_number = CONCAT('LD', DATE_FORMAT(created_at, '%y%m%d'), LPAD(id, 4, '0'))
WHERE lead_number IS NULL;

-- Now that every row has a name, enforce NOT NULL going forward
-- (matches schema.sql — comment out if you'd rather stay lenient for now)
ALTER TABLE leads
  MODIFY COLUMN name VARCHAR(255) NOT NULL;

-- Auto-generate lead_number on future inserts if the app leaves it blank
-- (the "Auto-generated" placeholder in the New Lead form isn't backed by
-- any client-side logic — nothing currently fills this in on insert)
DELIMITER $$
CREATE TRIGGER trg_leads_lead_number
BEFORE INSERT ON leads
FOR EACH ROW
BEGIN
  IF NEW.lead_number IS NULL OR NEW.lead_number = '' THEN
    SET NEW.lead_number = CONCAT('LD', DATE_FORMAT(NOW(), '%y%m%d'), LPAD(FLOOR(RAND()*9999), 4, '0'));
  END IF;
END$$
DELIMITER ;


-- ─────────────────────────────────────────────────────────────
-- CONTACTS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE contacts
  ADD COLUMN name  VARCHAR(255) NULL AFTER mlo_id,
  ADD COLUMN role  VARCHAR(100) NULL AFTER name,
  ADD COLUMN type  VARCHAR(50)  NULL AFTER contact_type,
  ADD COLUMN color VARCHAR(20)  NULL AFTER type,
  ADD COLUMN deals INT          NULL DEFAULT 0 AFTER color;

UPDATE contacts
SET name = TRIM(CONCAT(first_nm, ' ', last_nm))
WHERE name IS NULL;

-- contact_type's vocabulary (Borrower|Realtor|Attorney|Appraiser|Title|Other)
-- doesn't line up 1:1 with the app's filter pills (Realtor|Lender|Title|
-- Inspector) — copying as-is for now; review once Contacts is wired to the DB.
UPDATE contacts
SET type = contact_type
WHERE type IS NULL;

UPDATE contacts
SET deals = 0
WHERE deals IS NULL;

ALTER TABLE contacts
  MODIFY COLUMN name VARCHAR(255) NOT NULL;

-- NOTE: The Contacts page in the current build reads a hardcoded mock
-- array, not the database, and "+ Add Contact" is a stub. This migration
-- makes the table ready, but won't change what you see on that page until
-- ContactsPage is wired to db.contacts.getAll()/insert() — separate task,
-- let me know if you want that done too.


-- Verify:
-- SELECT id, name, lead_number, loan_status, purpose, loan_amount, officer FROM leads;
-- SELECT id, name, role, type, color, deals FROM contacts;
