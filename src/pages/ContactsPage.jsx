import { useState, useMemo } from 'react';
import { contacts } from '../data/db';

const TYPES = ['All','Realtor','Lender','Title','Inspector'];
const initials = name => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

export default function ContactsPage({ showToast }) {
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  const filtered = useMemo(() => {
    let r = [...contacts];
    if (typeFilter !== 'All') r = r.filter(c => c.type === typeFilter);
    if (search) r = r.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
    );
    return r;
  }, [search, typeFilter]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-title">Contacts</span>
          {TYPES.map(t => (
            <button key={t} className={`filter-pill${typeFilter === t ? ' active' : ''}`} onClick={() => setTypeFilter(t)}>{t}</button>
          ))}
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => showToast('Add contact coming soon')}>+ Add Contact</button>
      </div>

      <div className="contacts-grid">
        {filtered.map(c => (
          <div key={c.id} className="contact-card">
            <div className="contact-avatar" style={{ background: c.color }}>{initials(c.name)}</div>
            <div style={{ flex: 1 }}>
              <div className="contact-name">{c.name}</div>
              <div className="contact-role">{c.role} · {c.company}</div>
              <div className="contact-detail">📞 {c.phone}</div>
              <div className="contact-detail">✉ {c.email}</div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'var(--tag-bg)', color: 'var(--tag-color)', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>{c.type}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.deals} deals</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state"><div className="empty-icon">👤</div><div className="empty-title">No contacts found</div></div>
      )}
    </div>
  );
}
