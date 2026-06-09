import { useState, useEffect, useMemo } from 'react';
import { db, LOAN_STATUSES, LOAN_PURPOSES, LOAN_PRODUCTS, LENDERS } from '../data/db';
import { StatusBadge, ConfirmModal, fmt$, fmtRate } from '../components/shared';

function LoanForm({ initial = {}, onSave, onClose }) {
  const [d, setD] = useState({
    borrower: '', loan_number: '', subject_property: 'TBD', loan_status: 'App Intake',
    product: 'TBD', lender: 'No Lender', loan_amount: '', ltv: '', rate: '',
    lock_status: 'Not Locked', purpose: 'Purchase', closing_date: 'N/A', officer: 'IC',
    ...initial,
    loan_amount: initial.loan_amount ?? '',
    ltv:         initial.ltv         ?? '',
    rate:        initial.rate        ?? '',
  });
  const upd = k => e => setD(p => ({ ...p, [k]: e.target.value }));
  const submit = e => {
    e.preventDefault();
    onSave({ ...d, loan_amount: d.loan_amount ? Number(d.loan_amount) : null, ltv: d.ltv ? Number(d.ltv) : null, rate: d.rate ? Number(d.rate) : null });
  };

  return (
    <form onSubmit={submit}>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">1</span>Borrower</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label form-label-req">Borrower Name</label>
            <input className="form-input" value={d.borrower} onChange={upd('borrower')} required placeholder="Full name" />
          </div>
          <div className="form-group">
            <label className="form-label">Loan #</label>
            <input className="form-input" value={d.loan_number} onChange={upd('loan_number')} placeholder="Auto-generated" />
          </div>
          <div className="form-group form-full">
            <label className="form-label">Subject Property</label>
            <input className="form-input" value={d.subject_property} onChange={upd('subject_property')} placeholder="Address or TBD" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">2</span>Loan Details</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Status</label>
            <select className="form-select" value={d.loan_status} onChange={upd('loan_status')}>{LOAN_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Purpose</label>
            <select className="form-select" value={d.purpose} onChange={upd('purpose')}>{LOAN_PURPOSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Product</label>
            <select className="form-select" value={d.product} onChange={upd('product')}>{LOAN_PRODUCTS.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Lender</label>
            <select className="form-select" value={d.lender} onChange={upd('lender')}>{LENDERS.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Loan Amount ($)</label>
            <input type="number" className="form-input" value={d.loan_amount} onChange={upd('loan_amount')} placeholder="e.g. 350000" /></div>
          <div className="form-group"><label className="form-label">LTV (%)</label>
            <input type="number" className="form-input" value={d.ltv} onChange={upd('ltv')} step="0.01" placeholder="e.g. 96.50" /></div>
          <div className="form-group"><label className="form-label">Rate (%)</label>
            <input type="number" className="form-input" value={d.rate} onChange={upd('rate')} step="0.001" placeholder="e.g. 7.250" /></div>
          <div className="form-group"><label className="form-label">Lock Status</label>
            <select className="form-select" value={d.lock_status} onChange={upd('lock_status')}>
              <option>Not Locked</option><option>Locked</option><option>Lock Expired</option>
            </select></div>
          <div className="form-group"><label className="form-label">Closing Date</label>
            <input className="form-input" value={d.closing_date} onChange={upd('closing_date')} placeholder="N/A or MM/DD/YY" /></div>
          <div className="form-group"><label className="form-label">Officer</label>
            <input className="form-input" value={d.officer} onChange={upd('officer')} /></div>
        </div>
      </div>

      <div className="modal-footer" style={{ padding: '14px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save Loan</button>
      </div>
    </form>
  );
}

export default function LoansPage({ showToast }) {
  const [loans, setLoans] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => { db.loans.getAll().then(setLoans); }, []);

  const filtered = useMemo(() => {
    let r = [...loans];
    if (statusFilter !== 'All') r = r.filter(l => l.loan_status === statusFilter);
    if (search) r = r.filter(l => (l.borrower || '').toLowerCase().includes(search.toLowerCase()) || (l.loan_number || '').includes(search));
    return r.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }, [loans, search, statusFilter]);

  const handleAdd    = async d => { const n = await db.loans.insert(d); setLoans(p => [n, ...p]); setShowAdd(false); showToast('Loan created'); };
  const handleEdit   = async d => { await db.loans.update(editItem.id, d); setLoans(p => p.map(l => l.id === editItem.id ? { ...l, ...d } : l)); setEditItem(null); showToast('Loan updated'); };
  const handleDelete = async () => { await db.loans.delete(confirmDel.id); setLoans(p => p.filter(l => l.id !== confirmDel.id)); setConfirmDel(null); showToast('Loan deleted'); };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-title">Loans</span>
          <select className="filter-pill" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            {LOAN_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input placeholder="Search loans…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ New Loan</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Borrower</th><th>Loan #</th><th>Status</th><th>Product</th>
            <th>Lender</th><th>Amount</th><th>LTV</th><th>Rate</th><th>Closing</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id}>
                <td>
                  <div className="td-primary" onClick={() => setEditItem(l)}>{l.borrower}</div>
                  <div className="td-sub">{l.subject_property}</div>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)' }}>{l.loan_number}</td>
                <td><StatusBadge status={l.loan_status} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.product}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.lender}</td>
                <td className="td-amount">{fmt$(l.loan_amount)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.ltv ? `${l.ltv}%` : '--'}</td>
                <td style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtRate(l.rate)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.closing_date}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn-icon" onClick={() => setEditItem(l)}>✏️</button>
                    <button className="btn-icon" onClick={() => setConfirmDel(l)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10}>
                <div className="empty-state"><div className="empty-icon">🏠</div><div className="empty-title">No loans found</div></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">New Loan</span><button className="modal-close" onClick={() => setShowAdd(false)}>×</button></div>
            <div className="modal-body"><LoanForm onSave={handleAdd} onClose={() => setShowAdd(false)} /></div>
          </div>
        </div>
      )}
      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Edit Loan — {editItem.borrower}</span><button className="modal-close" onClick={() => setEditItem(null)}>×</button></div>
            <div className="modal-body"><LoanForm initial={editItem} onSave={handleEdit} onClose={() => setEditItem(null)} /></div>
          </div>
        </div>
      )}
      {confirmDel && <ConfirmModal msg={`Delete loan for "${confirmDel.borrower}"? This cannot be undone.`} onConfirm={handleDelete} onCancel={() => setConfirmDel(null)} />}
    </div>
  );
}
