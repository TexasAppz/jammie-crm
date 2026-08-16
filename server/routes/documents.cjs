const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { Storage } = require('@google-cloud/storage');
const db      = require('../db.cjs');

// ── GCS setup ──────────────────────────────────────────────────────────
// Auth: relies on GOOGLE_APPLICATION_CREDENTIALS env var pointing at a
// service-account JSON key (standard GCP convention — see setup notes).
// Bucket name comes from GCS_BUCKET_NAME so it's not hardcoded here.
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
if (!BUCKET_NAME) {
  console.warn('[documents.cjs] GCS_BUCKET_NAME is not set — document upload/download will fail until it is.');
}

// multer: hold the file in memory just long enough to stream it to GCS.
// 25MB cap — adjust if you expect larger files (e.g. big scanned PDFs).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function objectPathFor(loanId, originalName) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `loans/${loanId}/${Date.now()}-${safe}`;
}

// GET /api/documents/loan/:loan_id — list all documents for a loan
router.get('/loan/:loan_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM loan_documents WHERE loan_id=? ORDER BY created_at DESC',
      [req.params.loan_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/documents/loan/:loan_id — upload a file (multipart/form-data, field name "file")
router.post('/loan/:loan_id', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
    if (!BUCKET_NAME) return res.status(500).json({ error: 'GCS_BUCKET_NAME is not configured on the server' });

    const loanId = req.params.loan_id;
    const objectPath = objectPathFor(loanId, req.file.originalname);

    const bucket = storage.bucket(BUCKET_NAME);
    const blob = bucket.file(objectPath);
    await blob.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });

    const docSource = req.body.doc_source === 'mismo_export' || req.body.doc_source === 'mismo_import'
      ? req.body.doc_source : 'upload';

    const [result] = await db.query('INSERT INTO loan_documents SET ?', {
      loan_id: loanId,
      mlo_id: req.body.mlo_id || null,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      file_size_bytes: req.file.size,
      gcs_object_path: objectPath,
      doc_source: docSource,
    });

    const [row] = await db.query('SELECT * FROM loan_documents WHERE id=?', [result.insertId]);
    res.status(201).json(row[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/documents/:id/download — redirect to a short-lived signed URL
router.get('/:id/download', async (req, res) => {
  try {
    if (!BUCKET_NAME) return res.status(500).json({ error: 'GCS_BUCKET_NAME is not configured on the server' });

    const [rows] = await db.query('SELECT * FROM loan_documents WHERE id=?', [req.params.id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const bucket = storage.bucket(BUCKET_NAME);
    const [url] = await bucket.file(doc.gcs_object_path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      responseDisposition: `attachment; filename="${doc.file_name}"`,
    });
    res.redirect(url);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM loan_documents WHERE id=?', [req.params.id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (BUCKET_NAME) {
      try {
        await storage.bucket(BUCKET_NAME).file(doc.gcs_object_path).delete();
      } catch (gcsErr) {
        // If the object is already gone from GCS, don't block deleting
        // the metadata row over it — but do surface anything else.
        if (gcsErr.code !== 404) throw gcsErr;
      }
    }

    await db.query('DELETE FROM loan_documents WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
