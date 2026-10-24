const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
router.get('/',     async (req, res) => { try { const [r] = await db.query('SELECT * FROM loans ORDER BY updated_at DESC'); res.json(r); } catch(e){ res.status(500).json({error:e.message}); }});
router.get('/:id',  async (req, res) => { try { const [r] = await db.query('SELECT * FROM loans WHERE id=?',[req.params.id]); res.json(r[0]||{}); } catch(e){ res.status(500).json({error:e.message}); }});
router.post('/',    async (req, res) => { try { const d=req.body; const [r]=await db.query('INSERT INTO loans SET ?',d); const [n]=await db.query('SELECT * FROM loans WHERE id=?',[r.insertId]); res.status(201).json(n[0]); } catch(e){ res.status(500).json({error:e.message}); }});
// The homeowners-insurance figure: never overwrite a figure locked by an accepted quote, and a figure the
// MLO types (while unlocked) is recorded as 'manual' so the market estimate stops refreshing it.
async function guardHoi(body, loanId) {
  if (!body || !('pmt_hoi' in body)) return body;
  const [[l]] = await db.query('SELECT pmt_hoi, pmt_hoi_source, pmt_hoi_locked_at FROM loans WHERE id=?', [loanId]).catch(() => [[null]]);
  if (!l) return body;
  const out = { ...body };
  delete out.pmt_hoi_source; delete out.pmt_hoi_locked_at; delete out.pmt_hoi_note; delete out.hoi_quote_id;   // server-owned
  if (l.pmt_hoi_locked_at) { delete out.pmt_hoi; return out; }
  const incoming = out.pmt_hoi == null || out.pmt_hoi === '' ? null : Number(out.pmt_hoi);
  const current = l.pmt_hoi == null ? null : Number(l.pmt_hoi);
  if (incoming !== current && incoming != null && incoming > 0) {
    out.pmt_hoi_source = 'manual'; out.pmt_hoi_note = 'Entered by the loan officer';
    await db.query('INSERT INTO hoi_log SET ?', { loan_id: loanId, event: 'manual', amount: incoming, note: 'Entered by the loan officer', by_type: 'mlo' }).catch(() => {});
  } else if (incoming == null && current != null && l.pmt_hoi_source === 'manual') {
    out.pmt_hoi_source = null; out.pmt_hoi_note = null;   // cleared: the estimate may fill it again
  } else if (incoming === current) { delete out.pmt_hoi; }
  return out;
}
router.put('/:id',  async (req, res) => { try { const body = await guardHoi(req.body, req.params.id); if (Object.keys(body || {}).length) await db.query('UPDATE loans SET ? WHERE id=?',[body,req.params.id]); const [r]=await db.query('SELECT * FROM loans WHERE id=?',[req.params.id]); res.json(r[0]); } catch(e){ res.status(500).json({error:e.message}); }});
router.delete('/:id',async(req,res)=>{ try { await db.query('DELETE FROM loans WHERE id=?',[req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); }});
module.exports = router;
