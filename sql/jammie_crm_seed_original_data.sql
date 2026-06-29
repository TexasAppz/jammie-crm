-- =============================================================
-- Jammie Mortgage CRM
-- Script:      jammie_crm_seed_original_data.sql
-- Description: Inserts the original 8 loans, 5 leads, 7 tasks,
--              and 6 contacts that existed before DB integration
-- Run against: jammie_crm_db
-- =============================================================

USE jammie_crm_db;

-- -------------------------------------------------------------
-- CLEAN UP any test/blank records first
-- Removes the "New Borrower" placeholder records created during testing
-- -------------------------------------------------------------
DELETE FROM loans WHERE borrower = 'New Borrower' OR borrower IS NULL;

-- -------------------------------------------------------------
-- ORIGINAL LOANS (8 records)
-- -------------------------------------------------------------
INSERT IGNORE INTO loans
  (loan_number, borrower, subject_property, loan_status, product, lender,
   loan_amount, ltv, rate, closing_date, mlo_id)
VALUES
  ('16660796', 'Julio Cesar Tello',       'TBD',                  'App Intake',  'FHA 30 Year Fixed',   'PRMG',       314204.00, 96.50, 7.250, NULL,         1),
  ('16516154', 'Yusmari Rosario Noguera', '310 Cyan Lane',         'Loan Setup',  'NON-QM Fixed 30',     'NQM FUNDING',280415.00, 85.00, 7.429, '2026-05-15', 1),
  ('16660370', 'Eder Berber',             '--',                    'App Intake',  'TBD',                 'No Lender',  310000.00, 96.88, 6.880, NULL,         1),
  ('16283012', 'Juan Camargo Chavez',     '1308 Marston St',       'Pre-Approved','NON-QM Fixed 30',     'NQM FUNDING',272425.00, 85.00, 7.625, '2026-05-14', 1),
  ('16628896', 'Bridgette Rimpel',        '528 Fortune Ridge Rd',  'App Intake',  'CONF CONV 30 Year',   'UWM',        380000.00, 95.00, 7.125, NULL,         1),
  ('16659584', 'Cristian Torres',         'TBD',                   'Processing',  'FHA 30 Year Fixed',   'PRMG',       267530.00, 97.00, 7.000, '2026-05-30', 1),
  ('16700001', 'Maria Santos',            '45 Elm Court',          'Closing',     'CONF CONV 30 Year',   'UWM',        450000.00, 80.00, 6.875, '2026-05-28', 1),
  ('16700002', 'Robert Kim',              '901 Oak Blvd',          'Funded',      'VA 30 Year Fixed',    'PRMG',       520000.00,100.00, 6.500, '2026-04-15', 1);

-- -------------------------------------------------------------
-- ORIGINAL LEADS (5 records)
-- -------------------------------------------------------------
INSERT IGNORE INTO leads
  (first_nm, last_nm, email, phone, source, status, score, notes, mlo_id)
VALUES
  ('Gina',   'Gutierrez Posada', 'gina.g@email.com',     '301-555-0101', '--',      'New',         85, '',                        1),
  ('Jaime',  'Garcia',           'jaime.g@email.com',    '240-555-0202', '--',      'New',         42, '',                        1),
  ('Marcus', 'Webb',             'm.webb@email.com',     '571-555-0374', 'Website', 'Contacted',   68, 'First-time homebuyer',    1),
  ('Linda',  'Forsythe',         'lforsythe@email.com',  '703-555-0219', 'Realtor', 'Qualified',   91, 'High net worth client',   1),
  ('David',  'Park',             'dpark@email.com',      '571-555-0500', 'Zillow',  'In Progress', 73, 'Looking to close by summer', 1);

-- -------------------------------------------------------------
-- ORIGINAL TASKS (7 records)
-- loan_id references are best-effort based on loan_number
-- -------------------------------------------------------------
INSERT IGNORE INTO tasks
  (title, description, due_date, priority, done, loan_id, mlo_id)
VALUES
  ('Request pay stubs from Julio Tello',
   'Loan #16660796',                             '2026-05-26', 'High',   0,
   (SELECT id FROM loans WHERE loan_number='16660796' LIMIT 1), 1),

  ('Order appraisal - 528 Fortune Ridge Rd',
   'Loan #16628896',                             '2026-05-27', 'High',   0,
   (SELECT id FROM loans WHERE loan_number='16628896' LIMIT 1), 1),

  ('Send pre-approval letter to Juan Chavez',
   'Loan #16283012',                             '2026-05-25', 'Medium', 0,
   (SELECT id FROM loans WHERE loan_number='16283012' LIMIT 1), 1),

  ('Follow up with Marcus Webb re: refinance rates',
   'Lead follow-up',                             '2026-05-28', 'Medium', 0,
   NULL, 1),

  ('Upload title report for 310 Cyan Lane',
   'Loan #16516154',                             '2026-05-26', 'Low',    0,
   (SELECT id FROM loans WHERE loan_number='16516154' LIMIT 1), 1),

  ('Review closing disclosure - Maria Santos',
   'Loan #16700001',                             '2026-05-24', 'High',   1,
   (SELECT id FROM loans WHERE loan_number='16700001' LIMIT 1), 1),

  ('Collect updated bank statements from Eder Berber',
   'Loan #16660370',                             '2026-05-29', 'Medium', 0,
   (SELECT id FROM loans WHERE loan_number='16660370' LIMIT 1), 1);

-- -------------------------------------------------------------
-- ORIGINAL CONTACTS (6 records)
-- -------------------------------------------------------------
INSERT IGNORE INTO contacts
  (first_nm, last_nm, email, phone, company, contact_type, notes, mlo_id)
VALUES
  ('Sarah',   'Mitchell', 's.mitchell@c21.com',   '703-555-1234', 'Century 21',            'Realtor',   '', 1),
  ('Tom',     'Reynolds', 't.reynolds@fat.com',   '571-555-2345', 'First American Title',  'Title',     '', 1),
  ('Janet',   'Cruz',     'j.cruz@prmg.com',      '240-555-3456', 'PRMG',                  'Lender',    '', 1),
  ('Mike',    'Hanson',   'mike@hansoninsp.com',  '301-555-4567', 'Hanson Inspections',    'Appraiser', '', 1),
  ('Lisa',    'Wong',     'l.wong@kw.com',        '703-555-5678', 'Keller Williams',       'Realtor',   '', 1),
  ('Carlos',  'Mendez',   'c.mendez@uwm.com',     '571-555-6789', 'UWM',                   'Lender',    '', 1);

-- -------------------------------------------------------------
-- VERIFICATION
-- -------------------------------------------------------------
SELECT 'loans'    AS table_name, COUNT(*) AS records FROM loans
UNION ALL
SELECT 'leads',                  COUNT(*)             FROM leads
UNION ALL
SELECT 'tasks',                  COUNT(*)             FROM tasks
UNION ALL
SELECT 'contacts',               COUNT(*)             FROM contacts;

-- Preview loans
SELECT id, borrower, loan_number, loan_status, loan_amount, lender
FROM loans
ORDER BY id ASC;

-- =============================================================
-- END OF SCRIPT
-- =============================================================
