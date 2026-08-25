const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const { buildMismoXml, parseMismoXml } = require('../lib/mismo.cjs');
const { validateMismoOrdering } = require('../lib/mismo-validate.cjs');

// GET /api/mismo/export/:loan_id -> streams a MISMO 3.4 XML file
router.get('/export/:loan_id', async (req, res) => {
  try {
    const loanId = req.params.loan_id;
    const [loanRows] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
    if (!loanRows[0]) return res.status(404).json({ error: 'Loan not found' });

    const [form1003Rows] = await db.query('SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY updated_at DESC LIMIT 1', [loanId]);
    const [feeRows] = await db.query('SELECT * FROM loan_fees WHERE loan_id=? ORDER BY section ASC, sort_order ASC', [loanId]);

    const xml = buildMismoXml({ loan: loanRows[0], form1003: form1003Rows[0], fees: feeRows });

    // Structural self-check. MISMO containers are xs:sequence, so a file can
    // be well-formed and complete yet still have whole sections silently
    // dropped by a strict receiver (this is exactly how Declarations and
    // Demographics went missing in Arive). Advisory only — never blocks the
    // download, but surfaces the problem instead of letting it pass silently.
    try {
      const issues = validateMismoOrdering(xml);
      if (issues.length) {
        console.warn(`[mismo] Export for loan ${loanId} has ${issues.length} ordering issue(s):`);
        issues.forEach(i => console.warn(`  - ${i.message}`));
        res.setHeader('X-Mismo-Validation-Warnings', String(issues.length));
      }
    } catch (validationErr) {
      // A validator fault must never break a user's export.
      console.warn('[mismo] Ordering validation skipped:', validationErr.message);
    }

    const fileName = `MISMO_${loanRows[0].loan_number || loanId}.xml`;
    // Custom + Content-Disposition headers are not readable by fetch()
    // unless explicitly exposed; the frontend reads both for the filename
    // and the structural-warning count.
    res.setHeader('Access-Control-Expose-Headers', 'X-Mismo-Validation-Warnings, Content-Disposition');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xml);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mismo/import/:loan_id  { xml: "<...>" }
// Parses the uploaded MISMO file and updates the loan + form_1003 row.
// Only overwrites fields the file actually contains — never nulls out
// existing data just because the source file omitted a field.
router.post('/import/:loan_id', async (req, res) => {
  try {
    const loanId = req.params.loan_id;
    const xml = req.body.xml;
    if (!xml || typeof xml !== 'string') {
      return res.status(400).json({ error: 'Request body must include { xml: "<...>" }' });
    }

    const [loanRows] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
    if (!loanRows[0]) return res.status(404).json({ error: 'Loan not found' });

    let parsed;
    try {
      parsed = parseMismoXml(xml);
    } catch (parseErr) {
      return res.status(400).json({ error: `Could not parse file: ${parseErr.message}` });
    }

    // loans.borrower is a denormalized display name (used by the Loans
    // list, the Form1003 title, etc.) — parseMismoXml deliberately
    // doesn't set it directly since it's a Jammie-specific derived field,
    // not a real MISMO element. Derive it here the same way the frontend's
    // handleSave already does, so an import doesn't leave a loan showing
    // "New Borrower" even though the real name landed in form_1003.
    const importedFirst = parsed.form1003.first_nm;
    const importedLast = parsed.form1003.last_nm;
    if (importedFirst || importedLast) {
      parsed.loan.borrower = [importedFirst, importedLast].filter(Boolean).join(' ');
    }

    if (Object.keys(parsed.loan).length) {
      await db.query('UPDATE loans SET ? WHERE id=?', [parsed.loan, loanId]);
    }

    if (Object.keys(parsed.form1003).length) {
      const [existing] = await db.query('SELECT id FROM form_1003_main_borrower WHERE loan_id=? ORDER BY updated_at DESC LIMIT 1', [loanId]);
      if (existing[0]) {
        await db.query('UPDATE form_1003_main_borrower SET ? WHERE id=?', [parsed.form1003, existing[0].id]);
      } else {
        await db.query('INSERT INTO form_1003_main_borrower SET ?', { ...parsed.form1003, loan_id: loanId, mlo_id: loanRows[0].mlo_id });
      }
    }

    const [updatedLoan] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
    res.json({ success: true, loan: updatedLoan[0], imported_fields: { loan: Object.keys(parsed.loan), form1003: Object.keys(parsed.form1003) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
