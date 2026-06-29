const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
router.get('/',     async (req, res) => { try { const [r] = await db.query('SELECT * FROM leads ORDER BY updated_at DESC'); res.json(r); } catch(e){ res.status(500).json({error:e.message}); }});
router.get('/:id',  async (req, res) => { try { const [r] = await db.query('SELECT * FROM leads WHERE id=?',[req.params.id]); res.json(r[0]||{}); } catch(e){ res.status(500).json({error:e.message}); }});
router.post('/',    async (req, res) => { try { const [r]=await db.query('INSERT INTO leads SET ?',req.body); const [n]=await db.query('SELECT * FROM leads WHERE id=?',[r.insertId]); res.status(201).json(n[0]); } catch(e){ res.status(500).json({error:e.message}); }});
router.put('/:id',  async (req, res) => { try { await db.query('UPDATE leads SET ? WHERE id=?',[req.body,req.params.id]); const [r]=await db.query('SELECT * FROM leads WHERE id=?',[req.params.id]); res.json(r[0]); } catch(e){ res.status(500).json({error:e.message}); }});
router.delete('/:id',async(req,res)=>{ try { await db.query('DELETE FROM leads WHERE id=?',[req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); }});
module.exports = router;
