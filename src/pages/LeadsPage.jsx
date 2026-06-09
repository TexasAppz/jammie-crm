import { useState, useEffect, useMemo } from 'react';
import { db, LEAD_STATUSES, LEAD_SOURCES, LEAD_PURPOSES } from '../data/db';
import { StatusBadge, ScoreBadge, ConfirmModal, fmt$ } from '../components/shared';

function LeadForm({ initial = {}, onSave, onClose }) {
  const [d, setD] = useState({
    name: '', lead_number: '',
    created_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    loan_status: 'New', source: '--', purpose: 'Purchase', loan_amount: '',
    score: 50, tags: [], officer: 'IC', email: '', phone: '', notes: '',
    ...initial,
    loan_amount: initial.loan_amount ?? '',
  });
  const upd = k => e => setD(p => ({ ...p, [k]: e.target.value }));
  const submit = e => {
    e.preventDefault();
    onSave({ ...d, loan_amount: d.loan_amount ? Number(d.loan_amount) : null, score: Number(d.score) });
  };

  return (
    <form onSubmit={submit}>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">1</span>Lead Info</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label form-label-req">Full Name</label>
            <input className="form-input" value={d.name} onChange={upd('name')} required placeholder="Full name" /></div>
          <div className="form-group"><label className="form-label">Lead #</label>
            <input className="form-input" value={d.lead_number} onChange={upd('lead_number')} placeholder="Auto-generated" /></div>
          <div className="form-group"><label className="form-label">Email</label>
            <input type="email" className="form-input" value={d.email} onChange={upd('email')} placeholder="email@example.com" /></div>
          <div className="form-group"><label className="form-label">Phone</label>
            <input type="tel" className="form-input" value={d.phone} onChange={upd('phone')} placeholder="555-000-0000" /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">2</span>Loan Interest</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Status</label>
            <select className="form-select" value={d.loan_status} onChange={upd('loan_status')}>{LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Source</label>
            <select className="form-select" value={d.source} onChange={upd('source')}>{LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Purpose</label>
            <select className="form-select" value={d.purpose} onChange={upd('purpose')}>{LEAD_PURPOSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Loan Amount ($)</label>
            <input type="number" className="form-input" value={d.loan_amount} onChange={upd('loan_amount')} placeholder="Estimated" /></div>
          <div className="form-group"><label className="form-label">Lead Score (0–100)</label>
            <input type="number" min="0" max="100" className="form-input" value={d.score} onChange={upd('score')} /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">3</span>Notes</div>
        <div className="form-group"><textarea className="form-textarea" value={d.notes} onChange={upd('notes')} placeholder="Add notes about this lead…" /></div>
      </div>
      <div className="modal-footer" style={{ padding: '14px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save Lead</button>
      </div>
    </form>
  );
}

export default function LeadsPage({ showToast }) {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [sortBy, setSortBy] = useState('updated');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [emailLead, setEmailLead] = useState(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => { db.leads.getAll().then(setLeads); }, []);

  const filtered = useMemo(() => {
    let r = [...leads];
    if (statusFilter !== 'All Statuses') r = r.filter(l => l.loan_status === statusFilter);
    if (search) r = r.filter(l =>
      (l.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.lead_number || '').includes(search) ||
      (l.email || '').toLowerCase().includes(search.toLowerCase())
    );
    if (sortBy === 'score')  r.sort((a, b) => b.score - a.score);
    else if (sortBy === 'amount') r.sort((a, b) => (b.loan_amount || 0) - (a.loan_amount || 0));
    else r.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return r;
  }, [leads, search, statusFilter, sortBy]);

  const handleAdd    = async d => { const n = await db.leads.insert(d); setLeads(p => [n, ...p]); setShowAdd(false); showToast('Lead created'); };
  const handleEdit   = async d => { await db.leads.update(editItem.id, d); setLeads(p => p.map(l => l.id === editItem.id ? { ...l, ...d } : l)); setEditItem(null); showToast('Lead updated'); };
  const handleDelete = async () => { await db.leads.delete(confirmDel.id); setLeads(p => p.filter(l => l.id !== confirmDel.id)); setConfirmDel(null); showToast('Lead deleted'); };

  const generateEmail = async lead => {
    setEmailLead(lead);
    setEmailDraft('');
    setEmailLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Write a professional, warm follow-up email from a Mortgage Loan Originator (MLO) to a lead:
Name: ${lead.name}
Status: ${lead.loan_status}
Purpose: ${lead.purpose}
Estimated loan amount: ${lead.loan_amount ? fmt$(lead.loan_amount) : 'not specified'}
Source: ${lead.source}
Notes: ${lead.notes || 'none'}
Personalized, concise (3-4 short paragraphs), professional but friendly. Clear call-to-action. Sign off as "IC, Mortgage Loan Originator". Output only the email body.`,
          }],
        }),
      });
      const data = await res.json();
      setEmailDraft(data.content?.[0]?.text || 'Could not generate email.');
    } catch {
      setEmailDraft('Error generating email. Please try again.');
    }
    setEmailLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-title">Leads</span>
          <select className="filter-pill" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option>All Statuses</option>
            {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="filter-pill" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="updated">Sort: Recent</option>
            <option value="score">Sort: Score ↓</option>
            <option value="amount">Sort: Amount ↓</option>
          </select>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ New Lead</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Lead #</th><th>Status</th><th>Score</th>
            <th>Source</th><th>Purpose</th><th>Amount</th><th>Contact</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id}>
                <td>
                  <div className="td-primary" onClick={() => setEditItem(l)}>{l.name}</div>
                  <div className="td-sub">{l.created_date}</div>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)' }}>{l.lead_number}</td>
                <td><StatusBadge status={l.loan_status} /></td>
                <td><ScoreBadge score={l.score || 0} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.source}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.purpose}</td>
                <td className="td-amount">{fmt$(l.loan_amount)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  <div>{l.phone}</div>
                  <div style={{ color: 'var(--text-3)' }}>{l.email}</div>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-ghost" onClick={() => generateEmail(l)}>✉ Draft</button>
                    <button className="btn-icon" onClick={() => setEditItem(l)}>✏️</button>
                    <button className="btn-icon" onClick={() => setConfirmDel(l)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">👥</div><div className="empty-title">No leads found</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Email Draft Modal */}
      {emailLead && (
        <div className="modal-overlay" onClick={() => setEmailLead(null)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">✉ AI-Drafted Follow-Up Email</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>To: {emailLead.name} · {emailLead.email}</div>
              </div>
              <button className="modal-close" onClick={() => setEmailLead(null)}>×</button>
            </div>
            <div className="modal-body">
              {emailLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: '20px 0' }}>
                  <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Generating email with Jammie AI…
                </div>
              ) : (
                <textarea className="form-textarea" style={{ minHeight: 280, fontSize: 13, lineHeight: 1.7 }}
                  value={emailDraft} onChange={e => setEmailDraft(e.target.value)} />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => generateEmail(emailLead)}>↺ Regenerate</button>
              <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(emailDraft); showToast('Email copied!'); }}>Copy Email</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">New Lead</span><button className="modal-close" onClick={() => setShowAdd(false)}>×</button></div>
            <div className="modal-body"><LeadForm onSave={handleAdd} onClose={() => setShowAdd(false)} /></div>
          </div>
        </div>
      )}
      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Edit Lead — {editItem.name}</span><button className="modal-close" onClick={() => setEditItem(null)}>×</button></div>
            <div className="modal-body"><LeadForm initial={editItem} onSave={handleEdit} onClose={() => setEditItem(null)} /></div>
          </div>
        </div>
      )}
      {confirmDel && <ConfirmModal msg={`Delete lead "${confirmDel.name}"?`} onConfirm={handleDelete} onCancel={() => setConfirmDel(null)} />}
    </div>
  );
}
