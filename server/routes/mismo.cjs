const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const { buildMismoXml, parseMismoXml } = require('../lib/mismo.cjs');

// GET /api/mismo/export/:loan_id -> streams a MISMO 3.4 XML file
router.get('/export/:loan_id', async (req, res) => {
  try {
    const loanId = req.params.loan_id;
    const [loanRows] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
    if (!loanRows[0]) return res.status(404).json({ error: 'Loan not found' });

    const [form1003Rows] = await db.query('SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY updated_at DESC LIMIT 1', [loanId]);
    const [feeRows] = await db.query('SELECT * FROM loan_fees WHERE loan_id=? ORDER BY section ASC, sort_order ASC', [loanId]);

    const xml = buildMismoXml({ loan: loanRows[0], form1003: form1003Rows[0], fees: feeRows });

    const fileName = `MISMO_${loanRows[0].loan_number || loanId}.xml`;
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
