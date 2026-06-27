-- =============================================================
-- Jammie Mortgage CRM
-- Script:      jammie_crm_tables_addition.sql
-- Description: Adds missing tables for Leads, Tasks, Contacts
--              and updates Loans table with missing columns
-- Run AFTER:   jammie_crm_db_setup.sql
-- =============================================================

USE jammie_crm_db;

-- -------------------------------------------------------------
-- UPDATE LOANS TABLE — add missing columns
-- -------------------------------------------------------------

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS borrower        VARCHAR(255)   NULL     COMMENT 'Primary borrower full name',
  ADD COLUMN IF NOT EXISTS subject_property VARCHAR(255)  NULL     COMMENT 'Subject property address',
  ADD COLUMN IF NOT EXISTS product         VARCHAR(100)   NULL     COMMENT 'e.g. 30yr Fixed, 5/1 ARM',
  ADD COLUMN IF NOT EXISTS lender          VARCHAR(100)   NULL     COMMENT 'Lender name',
  ADD COLUMN IF NOT EXISTS ltv             DECIMAL(5,2)   NULL     COMMENT 'Loan-to-value ratio %',
  ADD COLUMN IF NOT EXISTS rate            DECIMAL(6,3)   NULL     COMMENT 'Interest rate %',
  ADD COLUMN IF NOT EXISTS closing_date    DATE           NULL     COMMENT 'Projected closing date';

-- -------------------------------------------------------------
-- LEADS TABLE
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leads (
    id              INT AUTO_INCREMENT      PRIMARY KEY,
    mlo_id          INT                     NULL
                    COMMENT 'References mlo_users.id',
    first_nm        VARCHAR(100)            NOT NULL,
    last_nm         VARCHAR(100)            NOT NULL,
    email           VARCHAR(255)            NULL,
    phone           VARCHAR(20)             NULL,
    source          VARCHAR(100)            NULL
                    COMMENT 'e.g. Zillow, Referral, Website, Cold Call',
    status          VARCHAR(50)             NULL DEFAULT 'New'
                    COMMENT 'New | Contacted | Qualified | In Progress | Closed Won | Closed Lost',
    score           TINYINT UNSIGNED        NULL DEFAULT 50
                    COMMENT 'Lead score 0–100',
    notes           TEXT                    NULL,
    created_at      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_leads_mlo
        FOREIGN KEY (mlo_id)
        REFERENCES mlo_users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Mortgage leads / prospects';

CREATE INDEX idx_leads_mlo_id  ON leads (mlo_id);
CREATE INDEX idx_leads_status  ON leads (status);
CREATE INDEX idx_leads_email   ON leads (email);

-- -------------------------------------------------------------
-- TASKS TABLE
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
    id              INT AUTO_INCREMENT      PRIMARY KEY,
    mlo_id          INT                     NULL
                    COMMENT 'References mlo_users.id',
    loan_id         INT                     NULL
                    COMMENT 'References loans.id — optional task association',
    title           VARCHAR(255)            NOT NULL,
    description     TEXT                    NULL,
    due_date        DATE                    NULL,
    priority        VARCHAR(20)             NULL DEFAULT 'Medium'
                    COMMENT 'Low | Medium | High | Urgent',
    done            TINYINT(1)              NOT NULL DEFAULT 0
                    COMMENT '0 = open, 1 = completed',
    created_at      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_mlo
        FOREIGN KEY (mlo_id)
        REFERENCES mlo_users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_loan
        FOREIGN KEY (loan_id)
        REFERENCES loans(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'MLO task management';

CREATE INDEX idx_tasks_mlo_id   ON tasks (mlo_id);
CREATE INDEX idx_tasks_loan_id  ON tasks (loan_id);
CREATE INDEX idx_tasks_due_date ON tasks (due_date);
CREATE INDEX idx_tasks_done     ON tasks (done);

-- -------------------------------------------------------------
-- CONTACTS TABLE
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contacts (
    id              INT AUTO_INCREMENT      PRIMARY KEY,
    mlo_id          INT                     NULL
                    COMMENT 'References mlo_users.id',
    first_nm        VARCHAR(100)            NOT NULL,
    last_nm         VARCHAR(100)            NOT NULL,
    email           VARCHAR(255)            NULL,
    phone           VARCHAR(20)             NULL,
    company         VARCHAR(255)            NULL,
    contact_type    VARCHAR(50)             NULL
                    COMMENT 'Borrower | Realtor | Attorney | Appraiser | Title | Other',
    notes           TEXT                    NULL,
    created_at      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_contacts_mlo
        FOREIGN KEY (mlo_id)
        REFERENCES mlo_users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'MLO contacts — borrowers, realtors, attorneys, etc.';

CREATE INDEX idx_contacts_mlo_id  ON contacts (mlo_id);
CREATE INDEX idx_contacts_email   ON contacts (email);
CREATE INDEX idx_contacts_type    ON contacts (contact_type);

-- -------------------------------------------------------------
-- SAMPLE DATA — Loans, Leads, Tasks, Contacts
-- -------------------------------------------------------------

-- Sample Loans
INSERT INTO loans (loan_number, loan_status, product, lender, loan_amount, ltv, rate, closing_date, subject_property, borrower, mlo_id)
VALUES
  ('16660796', 'App Intake',   '30yr Fixed',  'UWM',       314204.00, 96.50, 6.875, '2026-08-15', '123 Main St, Houston TX 77001',    'Denise Laureano',   1),
  ('16660797', 'Pre-Approved', 'FHA 30yr',    'Rocket',    289000.00, 96.50, 6.750, '2026-07-30', '456 Oak Ave, Dallas TX 75201',      'Carlos Mendez',     1),
  ('16660798', 'Processing',   'Conventional','Pennymac',  425000.00, 80.00, 7.125, '2026-07-20', '789 Pine Rd, Austin TX 78701',      'Sarah Johnson',     1),
  ('16660799', 'Closing',      'VA 30yr',     'NewRez',    375000.00, 100.00, 6.500,'2026-06-30', '321 Elm St, San Antonio TX 78201',  'James Williams',    1),
  ('16660800', 'Funded',       '15yr Fixed',  'Chase',     520000.00, 75.00, 6.250, '2026-05-15', '654 Maple Dr, Plano TX 75023',      'Maria Rodriguez',   1);

-- Sample Leads
INSERT INTO leads (mlo_id, first_nm, last_nm, email, phone, source, status, score, notes)
VALUES
  (1, 'Robert',  'Chen',     'rchen@email.com',     '7135550101', 'Zillow',    'New',        85, 'Interested in FHA loan, first-time buyer'),
  (1, 'Amanda',  'Foster',   'afoster@email.com',   '7135550102', 'Referral',  'Contacted',  72, 'Referred by Sarah Johnson. Pre-qual needed.'),
  (1, 'Michael', 'Torres',   'mtorres@email.com',   '7135550103', 'Website',   'Qualified',  60, 'Looking for VA loan. Veteran.'),
  (1, 'Lisa',    'Patel',    'lpatel@email.com',     '7135550104', 'Cold Call', 'New',        40, 'Initial contact made. Follow up next week.'),
  (1, 'David',   'Kim',      'dkim@email.com',       '7135550105', 'Zillow',    'In Progress',90, 'Strong buyer, pre-approval letter requested');

-- Sample Tasks
INSERT INTO tasks (mlo_id, loan_id, title, description, due_date, priority, done)
VALUES
  (1, 1, 'Request W2s from borrower',       'Need 2 years W2s for Denise Laureano',       '2026-06-20', 'High',   0),
  (1, 1, 'Order appraisal',                 'Order appraisal for 123 Main St',             '2026-06-18', 'Urgent', 0),
  (1, 2, 'Submit to underwriting',          'Carlos Mendez file ready for submission',     '2026-06-17', 'High',   0),
  (1, 3, 'Review title commitment',         'Title received for 789 Pine Rd',              '2026-06-25', 'Medium', 0),
  (1, NULL,'Follow up with Robert Chen',    'Call Robert about FHA pre-qualification',     '2026-06-16', 'High',   0),
  (1, 4, 'Clear final conditions',          'James Williams — 3 conditions remaining',     '2026-06-15', 'Urgent', 1);

-- Sample Contacts
INSERT INTO contacts (mlo_id, first_nm, last_nm, email, phone, company, contact_type, notes)
VALUES
  (1, 'Jennifer', 'Walsh',    'jwalsh@realty.com',    '7135550201', 'Walsh Realty Group',     'Realtor',   'Top producing agent in Houston area'),
  (1, 'Mark',     'Sullivan', 'msullivan@title.com',  '7135550202', 'Lone Star Title',        'Title',     'Preferred title company for Harris County'),
  (1, 'Patricia', 'Lee',      'plee@appraisal.com',   '7135550203', 'Lee Appraisal Services', 'Appraiser', 'FHA and Conventional certified'),
  (1, 'Thomas',   'Grant',    'tgrant@lawfirm.com',   '7135550204', 'Grant & Associates',     'Attorney',  'Real estate closing attorney'),
  (1, 'Nancy',    'Rivera',   'nrivera@realty.com',   '7135550205', 'Rivera Homes',           'Realtor',   'Specializes in first-time homebuyers');

-- -------------------------------------------------------------
-- VERIFICATION
-- -------------------------------------------------------------

SELECT 'loans'    AS table_name, COUNT(*) AS records FROM loans
UNION ALL
SELECT 'leads',                  COUNT(*)             FROM leads
UNION ALL
SELECT 'tasks',                  COUNT(*)             FROM tasks
UNION ALL
SELECT 'contacts',               COUNT(*)             FROM contacts
UNION ALL
SELECT 'form_1003_main_borrower',COUNT(*)             FROM form_1003_main_borrower;

-- =============================================================
-- END OF SCRIPT
-- =============================================================