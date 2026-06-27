-- =============================================================
-- Jammie Mortgage CRM
-- Script:      jammie_crm_db_setup.sql
-- Description: Creates the jammie_crm_db database and all
--              tables required for the 1003 loan application
-- Author:      Jammie Mortgage CRM
-- Created:     2026-06-16
-- =============================================================


-- -------------------------------------------------------------
-- STEP 1 — CREATE DATABASE
-- -------------------------------------------------------------

DROP DATABASE IF EXISTS jammie_crm_db;

CREATE DATABASE jammie_crm_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
    COMMENT 'Jammie Mortgage CRM — main application database';

-- Switch into the new database
-- All tables below will be created inside jammie_crm_db
USE jammie_crm_db;


-- -------------------------------------------------------------
-- STEP 2 — PREREQUISITE TABLES
-- These must exist before form_1003_main_borrower
-- because of foreign key constraints
-- -------------------------------------------------------------

CREATE TABLE mlo_users (
    id              INT AUTO_INCREMENT  PRIMARY KEY,
    email           VARCHAR(255)        NOT NULL UNIQUE,
    first_nm        VARCHAR(100)        NULL,
    last_nm         VARCHAR(100)        NULL,
    nmls_number     VARCHAR(50)         NULL,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Mortgage Loan Originators registered in the system';


CREATE TABLE loans (
    id              INT AUTO_INCREMENT  PRIMARY KEY,
    loan_number     VARCHAR(50)         NOT NULL UNIQUE,
    loan_status     VARCHAR(50)         NULL,
    loan_amount     DECIMAL(15,2)       NULL,
    mlo_id          INT                 NULL,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_loans_mlo
        FOREIGN KEY (mlo_id)
        REFERENCES mlo_users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Loan pipeline records';


-- -------------------------------------------------------------
-- STEP 3 — MAIN TABLE: form_1003_main_borrower
-- -------------------------------------------------------------

CREATE TABLE form_1003_main_borrower (

    -- ── PRIMARY KEY ───────────────────────────────────────────
    id                              INT AUTO_INCREMENT          PRIMARY KEY
                                    COMMENT 'Unique record identifier',

    -- ── FOREIGN KEYS ─────────────────────────────────────────
    loan_id                         INT                         NULL
                                    COMMENT 'References loans.id',
    mlo_id                          INT                         NULL
                                    COMMENT 'References mlo_users.id',

    -- ── STATUS & AUDIT ───────────────────────────────────────
    form_status                     ENUM('draft','submitted','complete')
                                    NOT NULL DEFAULT 'draft'
                                    COMMENT 'Lifecycle status of the 1003 application',
    created_at                      DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    COMMENT 'Record creation timestamp',
    updated_at                      DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP
                                    COMMENT 'Last modification timestamp',

    -- ── BORROWER 1 — PERSONAL INFORMATION ────────────────────
    email                           VARCHAR(255)                NULL
                                    COMMENT 'Primary borrower email',
    first_nm                        VARCHAR(100)                NULL,
    middle_nm                       VARCHAR(100)                NULL,
    last_nm                         VARCHAR(100)                NULL,
    ssn                             VARCHAR(11)                 NULL
                                    COMMENT '⚠ SENSITIVE — Format: XXX-XX-XXXX. Encrypt at application layer before storing.',
    dob                             DATE                        NULL
                                    COMMENT '⚠ SENSITIVE — Date of birth',
    citizenship                     VARCHAR(50)                 NULL
                                    COMMENT 'U.S. Citizen | Permanent Resident Alien | Non-Permanent Resident Alien | Foreign National',
    type_of_credit                  VARCHAR(50)                 NULL
                                    COMMENT 'Individual | Joint',
    num_borrowers                   TINYINT UNSIGNED            NULL DEFAULT 1
                                    COMMENT 'Total borrowers on this application (1–4)',

    -- ── BORROWER 2 ───────────────────────────────────────────
    email_borrower_2                VARCHAR(255)                NULL,
    first_nm_borrower_2             VARCHAR(100)                NULL,
    middle_nm_borrower_2            VARCHAR(100)                NULL,
    last_nm_borrower_2              VARCHAR(100)                NULL,
    cell_borrower_2                 VARCHAR(20)                 NULL,
    home_phone_borrower_2           VARCHAR(20)                 NULL,
    work_phone_borrower_2           VARCHAR(20)                 NULL,

    -- ── BORROWER 3 ───────────────────────────────────────────
    email_borrower_3                VARCHAR(255)                NULL,
    first_nm_borrower_3             VARCHAR(100)                NULL,
    middle_nm_borrower_3            VARCHAR(100)                NULL,
    last_nm_borrower_3              VARCHAR(100)                NULL,
    cell_borrower_3                 VARCHAR(20)                 NULL,
    home_phone_borrower_3           VARCHAR(20)                 NULL,
    work_phone_borrower_3           VARCHAR(20)                 NULL,

    -- ── BORROWER 4 ───────────────────────────────────────────
    email_borrower_4                VARCHAR(255)                NULL,
    first_nm_borrower_4             VARCHAR(100)                NULL,
    middle_nm_borrower_4            VARCHAR(100)                NULL,
    last_nm_borrower_4              VARCHAR(100)                NULL,
    cell_borrower_4                 VARCHAR(20)                 NULL,
    home_phone_borrower_4           VARCHAR(20)                 NULL,
    work_phone_borrower_4           VARCHAR(20)                 NULL,

    -- ── MARITAL STATUS & DEPENDENTS ──────────────────────────
    marital_status                  VARCHAR(20)                 NULL
                                    COMMENT 'Married | Unmarried | Separated',
    dependent_nm                    VARCHAR(255)                NULL
                                    COMMENT 'Comma-separated dependent names',
    dependent_age_1                 TINYINT UNSIGNED            NULL,
    dependent_age_2                 TINYINT UNSIGNED            NULL,
    dependent_age_3                 TINYINT UNSIGNED            NULL,
    dependent_age_4                 TINYINT UNSIGNED            NULL,

    -- ── CURRENT / PRESENT ADDRESS ────────────────────────────
    address_num                     VARCHAR(20)                 NULL
                                    COMMENT 'Street number',
    address_street                  VARCHAR(255)                NULL,
    address_unit                    VARCHAR(50)                 NULL,
    address_city                    VARCHAR(100)                NULL,
    address_state                   VARCHAR(50)                 NULL,
    address_zip                     VARCHAR(10)                 NULL,
    address_country                 VARCHAR(100)                NULL DEFAULT 'United States',
    current_how_long_addr           DECIMAL(5,2)                NULL
                                    COMMENT 'Years at current address (e.g. 1.5 = 1 yr 6 mo)',
    housing                         VARCHAR(30)                 NULL
                                    COMMENT 'Own | Rent | Living Rent Free',
    rent_monthly                    DECIMAL(10,2)               NULL
                                    COMMENT 'Monthly rent if applicable',
    current_address_how_long        DECIMAL(5,2)                NULL,

    -- ── PREVIOUS ADDRESS ─────────────────────────────────────
    old_address_how_long            DECIMAL(5,2)                NULL,
    old_address_street              VARCHAR(255)                NULL,
    old_address_unit                VARCHAR(50)                 NULL,
    old_address_city                VARCHAR(100)                NULL,
    old_address_state               VARCHAR(50)                 NULL,
    old_address_zip                 VARCHAR(10)                 NULL,
    old_address_country             VARCHAR(100)                NULL DEFAULT 'United States',
    old_how_long_addr               DECIMAL(5,2)                NULL,
    old_housing                     VARCHAR(30)                 NULL
                                    COMMENT 'Own | Rent | Living Rent Free',
    old_rent_monthly                DECIMAL(10,2)               NULL,

    -- ── MAILING ADDRESS ──────────────────────────────────────
    mailing_address_if_diff_current TINYINT(1)                  NULL DEFAULT 0
                                    COMMENT '1 = mailing differs from current address',
    mailing_address_how_long        DECIMAL(5,2)                NULL,
    mailing_address_street          VARCHAR(255)                NULL,
    mailing_address_unit_num        VARCHAR(50)                 NULL,
    mailing_address_city            VARCHAR(100)                NULL,
    mailing_address_state           VARCHAR(50)                 NULL,
    mailing_address_zip             VARCHAR(10)                 NULL,
    mailing_address_country         VARCHAR(100)                NULL DEFAULT 'United States',

    -- ── EMPLOYMENT / INCOME ───────────────────────────────────
    current_employment_or_income    TINYINT(1)                  NULL DEFAULT 1
                                    COMMENT '1 = currently employed or receiving income',
    employee_or_business_nm         VARCHAR(255)                NULL,
    business_phone                  VARCHAR(20)                 NULL,
    business_street                 VARCHAR(255)                NULL,
    business_unit_num               VARCHAR(50)                 NULL,
    business_city                   VARCHAR(100)                NULL,
    business_state                  VARCHAR(50)                 NULL,
    business_country                VARCHAR(100)                NULL DEFAULT 'United States',
    position_title                  VARCHAR(150)                NULL,
    position_start_date             DATE                        NULL,
    how_long_in_line_work_years     SMALLINT UNSIGNED           NULL,
    how_long_in_line_work_months    TINYINT UNSIGNED            NULL,
    employed_by_family_member       TINYINT(1)                  NULL DEFAULT 0
                                    COMMENT '1 = employed by family member, seller, or agent',
    business_owner_or_self_employed TINYINT(1)                  NULL DEFAULT 0,
    ownership_share_lt_25_pct       TINYINT(1)                  NULL DEFAULT 0
                                    COMMENT '1 = ownership share less than 25%',
    ownership_share_gt_25_pct       TINYINT(1)                  NULL DEFAULT 0
                                    COMMENT '1 = ownership share 25% or more',

    -- ── MONTHLY GROSS INCOME ─────────────────────────────────
    monthly_income_or_loss          DECIMAL(12,2)               NULL,
    gross_income_monthly_base       DECIMAL(12,2)               NULL DEFAULT 0.00,
    gross_income_monthly_overtime   DECIMAL(12,2)               NULL DEFAULT 0.00,
    gross_income_monthly_bonus      DECIMAL(12,2)               NULL DEFAULT 0.00,
    gross_income_monthly_commission DECIMAL(12,2)               NULL DEFAULT 0.00,
    gross_income_monthly_military   DECIMAL(12,2)               NULL DEFAULT 0.00
                                    COMMENT 'Military entitlements',
    gross_income_monthly_other      DECIMAL(12,2)               NULL DEFAULT 0.00,
    gross_income_monthly_total      DECIMAL(12,2)               NULL DEFAULT 0.00
                                    COMMENT 'Auto-calculated by trigger on INSERT and UPDATE',

    -- ── FOREIGN KEY CONSTRAINTS ───────────────────────────────
    CONSTRAINT fk_1003_loan
        FOREIGN KEY (loan_id)
        REFERENCES loans(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_1003_mlo
        FOREIGN KEY (mlo_id)
        REFERENCES mlo_users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE

) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Uniform Residential Loan Application (1003) — all borrower data';


-- -------------------------------------------------------------
-- STEP 4 — INDEXES
-- -------------------------------------------------------------

CREATE INDEX idx_1003_loan_id   ON form_1003_main_borrower (loan_id);
CREATE INDEX idx_1003_mlo_id    ON form_1003_main_borrower (mlo_id);
CREATE INDEX idx_1003_email     ON form_1003_main_borrower (email);
CREATE INDEX idx_1003_status    ON form_1003_main_borrower (form_status);
CREATE INDEX idx_1003_last_nm   ON form_1003_main_borrower (last_nm);


-- -------------------------------------------------------------
-- STEP 5 — TRIGGERS
-- Auto-calculate gross_income_monthly_total on INSERT / UPDATE
-- -------------------------------------------------------------

DELIMITER $$

CREATE TRIGGER trg_1003_income_insert
BEFORE INSERT ON form_1003_main_borrower
FOR EACH ROW
BEGIN
    SET NEW.gross_income_monthly_total =
        COALESCE(NEW.gross_income_monthly_base,       0) +
        COALESCE(NEW.gross_income_monthly_overtime,   0) +
        COALESCE(NEW.gross_income_monthly_bonus,      0) +
        COALESCE(NEW.gross_income_monthly_commission, 0) +
        COALESCE(NEW.gross_income_monthly_military,   0) +
        COALESCE(NEW.gross_income_monthly_other,      0);
END$$

CREATE TRIGGER trg_1003_income_update
BEFORE UPDATE ON form_1003_main_borrower
FOR EACH ROW
BEGIN
    SET NEW.gross_income_monthly_total =
        COALESCE(NEW.gross_income_monthly_base,       0) +
        COALESCE(NEW.gross_income_monthly_overtime,   0) +
        COALESCE(NEW.gross_income_monthly_bonus,      0) +
        COALESCE(NEW.gross_income_monthly_commission, 0) +
        COALESCE(NEW.gross_income_monthly_military,   0) +
        COALESCE(NEW.gross_income_monthly_other,      0);
END$$

DELIMITER ;


-- -------------------------------------------------------------
-- STEP 6 — SAMPLE DATA
-- Insert test MLO, loan, and borrower records
-- -------------------------------------------------------------

-- Sample MLO user
INSERT INTO mlo_users (email, first_nm, last_nm, nmls_number)
VALUES ('icastiblanco@phomemortgage.com', 'Ismael', 'Castiblanco', '1616977');

-- Sample loan
INSERT INTO loans (loan_number, loan_status, loan_amount, mlo_id)
VALUES ('16660796', 'App Intake', 314204.00, 1);

-- Sample 1003 record (Denise Laureano from screenshots)
INSERT INTO form_1003_main_borrower (
    loan_id,
    mlo_id,
    form_status,
    email,
    first_nm,
    last_nm,
    ssn,
    dob,
    citizenship,
    type_of_credit,
    num_borrowers,
    marital_status,
    address_street,
    address_city,
    address_state,
    address_zip,
    address_country,
    current_how_long_addr,
    housing,
    employee_or_business_nm,
    position_title,
    position_start_date,
    gross_income_monthly_base
) VALUES (
    1,
    1,
    'draft',
    'demo@example.com',
    'Denise',
    'Laureano',
    '103-94-3453',          -- ⚠ encrypt in production
    '2005-05-03',
    'U.S. Citizen',
    'Individual',
    1,
    'Married',
    '20665 Minue Drive',
    'Fort Bliss',
    'Texas',
    '79918',
    'United States',
    0.6,
    'Living Rent Free',
    'US Army',
    'Soldier',
    '2024-01-15',
    2890.00
);


-- -------------------------------------------------------------
-- STEP 7 — VERIFICATION QUERIES
-- Run these to confirm everything was created correctly
-- -------------------------------------------------------------

-- Show all tables in the database
SHOW TABLES;

-- Show all columns in the main table
DESCRIBE form_1003_main_borrower;

-- Verify sample record with auto-calculated income total
SELECT
    id,
    loan_id,
    mlo_id,
    form_status,
    CONCAT(first_nm, ' ', last_nm)  AS borrower_name,
    email,
    address_city,
    address_state,
    gross_income_monthly_base,
    gross_income_monthly_total,
    created_at
FROM form_1003_main_borrower;

-- Count records by status
SELECT
    form_status,
    COUNT(*)                        AS total_records
FROM form_1003_main_borrower
GROUP BY form_status;


-- =============================================================
-- END OF SCRIPT
-- jammie_crm_db created successfully
-- Tables: mlo_users, loans, form_1003_main_borrower
-- =============================================================
