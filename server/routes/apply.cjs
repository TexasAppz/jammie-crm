'use strict';
/**
 * server/routes/apply.cjs — the borrower's own API.
 *
 * Mounted at /api/apply. lib/auth.cjs maps this prefix to the 'borrower'
 * role, so every request here carries a borrower session and req.user.id is
 * a borrower_users.id. Authorization is per loan: a borrower sees only the
 * loans that loan_borrowers links to them.
 *
 * Phase 2 (this file):
 *   GET /api/apply            my loans, each with status, purpose and the
 *                             loan officer's contact card.
 *   GET /api/apply/:loanId    one loan (same shape), 404 if it is not mine.
 *
 * Phase 3 adds the application steps (GET/PUT /api/apply/:loanId/form) on
 * top of the same `mine()` check. Nothing here can touch a loan the
 * borrower is not linked to, whatever id they put in the URL.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');

const LOAN_SQL = `
  SELECT l.id, l.loan_number, l.borrower, l.purpose, l.application_status, l.submitted_at, l.subject_property,
         l.created_at, l.updated_at, lb.role,
         m.first_nm AS mlo_first, m.last_nm AS mlo_last, m.email AS mlo_email, m.phone AS mlo_phone, m.nmls_number AS mlo_nmls
    FROM loan_borrowers lb
    JOIN loans l      ON l.id = lb.loan_id
    LEFT JOIN mlo_users m ON m.id = l.mlo_id
   WHERE lb.borrower_user_id = ?`;

function shape(r) {
  return {
    id: r.id,
    loanNumber: r.loan_number,
    borrowerName: r.borrower,
    purpose: r.purpose || null,
    applicationStatus: r.application_status || 'in_progress',
    submittedAt: r.submitted_at,
    subjectProperty: r.subject_property && r.subject_property !== 'TBD' ? r.subject_property : null,
    role: r.role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    mlo: {
      name: [r.mlo_first, r.mlo_last].filter(Boolean).join(' ') || 'Your loan officer',
      email: r.mlo_email || null,
      phone: r.mlo_phone || null,
      nmls:  r.mlo_nmls  || null,
    },
  };
}

/** The loan if it belongs to this borrower, else null. Used by every per-loan route. */
async function mine(borrowerId, loanId) {
  const [rows] = await db.query(`${LOAN_SQL} AND l.id = ? LIMIT 1`, [borrowerId, loanId]);
  return rows[0] || null;
}

// GET /api/apply
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${LOAN_SQL} ORDER BY l.updated_at DESC`, [req.user.id]);
    res.json({ user: req.user, loans: rows.map(shape) });
  } catch (e) {
    console.error('[apply] list error:', e.message);
    res.status(500).json({ error: 'Could not load your application' });
  }
});

// GET /api/apply/:loanId
router.get('/:loanId', async (req, res) => {
  try {
    const r = await mine(req.user.id, Number(req.params.loanId));
    if (!r) return res.status(404).json({ error: 'Application not found' });
    res.json(shape(r));
  } catch (e) {
    console.error('[apply] get error:', e.message);
    res.status(500).json({ error: 'Could not load your application' });
  }
});

module.exports = router;
module.exports.mine = mine;
