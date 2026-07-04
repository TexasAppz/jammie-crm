const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');

// GET /api/fees/:loan_id
router.get('/:loan_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM loan_fees WHERE loan_id=? ORDER BY section ASC, sort_order ASC',
      [req.params.loan_id]
    );
    res.json(rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// POST /api/fees — add fee line
router.post('/', async (req, res) => {
  try {
    const { loan_id, section, description, at_closing, before_closing, paid_by, months, is_apr, sort_order } = req.body;
    const [r] = await db.query(
      'INSERT INTO loan_fees (loan_id,section,description,at_closing,before_closing,paid_by,months,is_apr,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
      [loan_id, section, description, at_closing||0, before_closing||0, paid_by||'B', months||null, is_apr||0, sort_order||0]
    );
    const [n] = await db.query('SELECT * FROM loan_fees WHERE id=?', [r.insertId]);
    res.status(201).json(n[0]);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// PUT /api/fees/:id — update fee line
router.put('/:id', async (req, res) => {
  try {
    const { description, at_closing, before_closing, paid_by, months, is_apr } = req.body;
    await db.query(
      'UPDATE loan_fees SET description=?,at_closing=?,before_closing=?,paid_by=?,months=?,is_apr=? WHERE id=?',
      [description, at_closing||0, before_closing||0, paid_by||'B', months||null, is_apr||0, req.params.id]
    );
    const [r] = await db.query('SELECT * FROM loan_fees WHERE id=?', [req.params.id]);
    res.json(r[0]);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// DELETE /api/fees/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM loan_fees WHERE id=?', [req.params.id]);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;
EOFcat > ~/jammie-crm/server/routes/fees.cjs << 'EOF'
const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');

// GET /api/fees/:loan_id
router.get('/:loan_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM loan_fees WHERE loan_id=? ORDER BY section ASC, sort_order ASC',
      [req.params.loan_id]
    );
    res.json(rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// POST /api/fees — add fee line
router.post('/', async (req, res) => {
  try {
    const { loan_id, section, description, at_closing, before_closing, paid_by, months, is_apr, sort_order } = req.body;
    const [r] = await db.query(
      'INSERT INTO loan_fees (loan_id,section,description,at_closing,before_closing,paid_by,months,is_apr,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
      [loan_id, section, description, at_closing||0, before_closing||0, paid_by||'B', months||null, is_apr||0, sort_order||0]
    );
    const [n] = await db.query('SELECT * FROM loan_fees WHERE id=?', [r.insertId]);
    res.status(201).json(n[0]);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// PUT /api/fees/:id — update fee line
router.put('/:id', async (req, res) => {
  try {
    const { description, at_closing, before_closing, paid_by, months, is_apr } = req.body;
    await db.query(
      'UPDATE loan_fees SET description=?,at_closing=?,before_closing=?,paid_by=?,months=?,is_apr=? WHERE id=?',
      [description, at_closing||0, before_closing||0, paid_by||'B', months||null, is_apr||0, req.params.id]
    );
    const [r] = await db.query('SELECT * FROM loan_fees WHERE id=?', [req.params.id]);
    res.json(r[0]);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// DELETE /api/fees/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM loan_fees WHERE id=?', [req.params.id]);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;
