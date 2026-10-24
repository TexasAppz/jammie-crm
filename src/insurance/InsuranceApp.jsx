// src/insurance/InsuranceApp.jsx — the quote portal for insurance (and later title) providers.
//
// Lazy-loaded by src/App.jsx for any path under /insurance. Shares the session
// cookie and the GlobalStyles (auth-*, b-*) that App.jsx renders. A provider
// session can only call /api/provider/* and /api/auth/*; everything it shows
// comes from the snapshot the loan officer sent — never the live loan.
//
// Routes (window.location.pathname, no router dependency):
//   /insurance/login            sign in (username or email + password, role 'provider')
//   /insurance                  inbox: New · Viewed · Quoted · Decided · Expired
//   /insurance/request/:id      one request: shared details, market estimate, quote form, messages

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, API_URL } from "../shared/api.js";

const PATH = () => window.location.pathname.replace(/\/+$/, '') || '/';
const go = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new Event('popstate')); };
const money = (v, d = 2) => (v == null || v === '' || isNaN(Number(v))) ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const when = v => v ? new Date(v).toLocaleString() : '—';
const day = v => v ? String(v).slice(0, 10) : '—';
const STATUS = {
  requested: ['New', '#2563eb'], viewed: ['Viewed', '#6b7280'], quoted: ['Quoted', '#d97706'], accepted: ['Accepted by borrower', '#059669'],
  declined: ['Not selected', '#6b7280'], not_selected: ['Not selected', '#6b7280'],   // the provider is told one thing only: it was not the chosen quote
  withdrawn: ['Withdrawn', '#6b7280'], declined_by_provider: ['Unable to quote', '#b91c1c'], expired: ['Expired', '#6b7280'], superseded: ['Superseded', '#9ca3af'],
};
const Chip = ({ s }) => { const [l, c] = STATUS[s] || [s, '#6b7280']; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: c + '22', color: c, whiteSpace: 'nowrap' }}>{l}</span>; };
const Box = ({ title, children, style, right }) => (
  <div className="b-section" style={{ marginBottom: 16, ...style }}>
    <div className="b-section-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span>{title}</span>{right}</div>
    <div className="b-section-body">{children}</div>
  </div>
);
const L = ({ k, v }) => <div style={{ fontSize: 13 }}><span style={{ color: '#6b7280' }}>{k} </span><span style={{ fontWeight: 600 }}>{v ?? '—'}</span></div>;

function Header({ user, onSignOut }) {
  return (
    <div className="b-header">
      <div className="b-header-left">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer' }} onClick={() => go('/insurance')}>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: '-.3px' }}>Jammie</span>
          <span style={{ color: '#fbbf24', fontSize: 9, fontWeight: 600, letterSpacing: '.06em' }}>QUOTE PORTAL</span>
        </div>
        {user && <div style={{ color: '#cbd5e1', fontSize: 12 }}>🏢 {user.providerName} · {user.name}</div>}
      </div>
      {user && <button className="b-logout-btn" onClick={onSignOut}>Sign out</button>}
    </div>
  );
}

function Login({ onSignedIn }) {
  const [login, setLogin] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(''); if (!login.trim() || !pw) { setErr('Enter your username and password.'); return; }
    setBusy(true);
    try { const u = await apiFetch('/api/auth/login', { method: 'POST', body: { login: login.trim(), password: pw, role: 'provider' } }); onSignedIn(u); }
    catch (e) { setErr(e.message || 'Sign-in failed'); } finally { setBusy(false); }
  };
  const onKey = e => { if (e.key === 'Enter') submit(); };
  return (
    <div className="auth-main"><div className="auth-card" style={{ maxWidth: 440 }}>
      <div className="auth-card-hdr">Quote provider sign in</div>
      <div className="auth-card-body">
        <div className="auth-title">Welcome</div>
        <div className="auth-field"><label>Username or email</label><input value={login} onChange={e => setLogin(e.target.value)} autoComplete="username" autoFocus onKeyDown={onKey} /></div>
        <div className="auth-field"><label>Password</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" onKeyDown={onKey} /></div>
        {err && <div className="auth-alert show">⚠ {err}</div>}
        <button className="auth-btn" onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
        <div className="auth-terms">Access is limited to quote requests addressed to your company. Borrower names and property addresses here are shared under the lender's privacy notice for the purpose of quoting only.</div>
      </div>
    </div></div>
  );
}

const TABS = [['new', 'New'], ['viewed', 'Viewed'], ['quoted', 'Quoted'], ['decided', 'Decided'], ['expired', 'Expired']];
function Inbox({ user, onOpen }) {
  const [tab, setTab] = useState('new'); const [rows, setRows] = useState(null); const [summary, setSummary] = useState(null);
  const load = useCallback(() => {
    apiFetch('/api/provider/summary').then(setSummary).catch(() => {});
    apiFetch(`/api/provider/requests?status=${tab}`).then(setRows).catch(() => setRows([]));
  }, [tab]);
  useEffect(load, [load]);
  const counts = summary?.counts || {};
  return (
    <div className="b-body" style={{ maxWidth: 1100 }}>
      <div className="b-page-title">Quote requests</div>
      <div className="b-page-sub">{user.providerName} · requests from loan officers who asked you for a quote{counts.unread_messages ? ` · ${counts.unread_messages} unread message${counts.unread_messages === 1 ? '' : 's'}` : ''}</div>
      <div style={{ display: 'flex', gap: 6, margin: '18px 0 12px', flexWrap: 'wrap' }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid ' + (tab === id ? '#2563eb' : '#e5e7eb'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563eb' : '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {label}{counts[id] != null ? <span style={{ marginLeft: 6, background: tab === id ? '#2563eb' : '#e5e7eb', color: tab === id ? '#fff' : '#374151', borderRadius: 10, padding: '0 7px', fontSize: 11 }}>{counts[id]}</span> : null}
          </button>))}
      </div>
      <div className="b-section">
        <div className="b-section-body" style={{ padding: 0 }}>
          {rows === null ? <div style={{ padding: 20, color: '#6b7280' }}>Loading…</div>
            : rows.length === 0 ? <div style={{ padding: 28, color: '#6b7280', textAlign: 'center' }}>Nothing here.</div>
            : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {['Request', 'Loan ID', 'Borrower(s)', 'Property', 'Loan officer', 'Received', 'Status', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map(r => {
                const s = r.snapshot || {}; const p = s.property || {};
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #eef2f7', cursor: 'pointer' }} onClick={() => onOpen(r.id)}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r.request_no}{r.messages_unread ? <span style={{ marginLeft: 6, background: '#b91c1c', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10 }}>{r.messages_unread} msg</span> : null}</td>
                    <td style={{ padding: '10px 12px' }}>{s.loanNumber}</td>
                    <td style={{ padding: '10px 12px' }}>{(s.borrowers || []).map(b => `${b.firstName} ${b.lastName}`).join(' · ')}</td>
                    <td style={{ padding: '10px 12px' }}>{[p.street, p.unit, p.city, p.state, p.zip].filter(Boolean).join(', ')}</td>
                    <td style={{ padding: '10px 12px' }}>{r.mlo?.name}<div style={{ fontSize: 11, color: '#6b7280' }}>{r.mlo?.company}</div></td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{when(r.requested_at)}</td>
                    <td style={{ padding: '10px 12px' }}><Chip s={r.status} />{r.latest_quote ? <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.latest_quote.quote_id} · {money(r.latest_quote.monthly_premium)}/mo</div> : null}</td>
                    <td style={{ padding: '10px 12px', color: '#2563eb', fontWeight: 600 }}>Open →</td>
                  </tr>);
              })}</tbody></table></div>}
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM = { annualPremium: '', dwelling: '', otherStructures: '', personalProperty: '', liability: '', deductibleAllPeril: '', windHailPct: '', floodSeparate: false, carrierProduct: '', effectiveDate: '', validUntil: '', notes: '', pdfBase64: '', pdfFileName: '' };
const N = ({ label, k, form, set, step = '1', suffix }) => (
  <div className="auth-field" style={{ marginBottom: 12 }}><label>{label}</label>
    <input type="number" step={step} min="0" value={form[k]} onChange={e => set(f => ({ ...f, [k]: e.target.value }))} style={{ padding: '12px 12px' }} placeholder={suffix || ''} /></div>
);

function RequestPage({ id, user, showToast }) {
  const [r, setRaw] = useState(null); const [err, setErr] = useState(''); const [form, setForm] = useState(EMPTY_FORM); const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [unable, setUnable] = useState(null);
  // Later responses (messages, submit) carry no estimate/defaults — keep the ones from the first load.
  const setR = (next) => setRaw(prev => (next ? { ...next, estimate: next.estimate ?? prev?.estimate ?? null, defaults: next.defaults ?? prev?.defaults ?? null } : next));
  const load = useCallback(() => apiFetch(`/api/provider/requests/${id}`).then(setR).catch(e => setErr(e.message)), [id]);
  useEffect(load, [load]);
  // Pre-fill once per request from the market estimate (or the quote being revised) — the agent's numbers win from then on.
  const prefilled = useRef(null);
  useEffect(() => {
    if (!r) return;
    const key = `${r.id}:${editing ? 'edit' : 'new'}`;
    if (prefilled.current === key) return;
    prefilled.current = key;
    const e = r.estimate || {};
    const prev = r.latest_quote && r.latest_quote.status !== 'superseded' ? r.latest_quote : null;
    setForm(f => ({ ...EMPTY_FORM,
      annualPremium: prev ? String(prev.annual_premium) : (e.annualPremium != null ? String(Math.round(e.annualPremium)) : ''),
      deductibleAllPeril: prev ? (prev.deductible_all_peril ?? '') : (e.typicalDeductible != null ? String(e.typicalDeductible) : ''),
      windHailPct: prev ? (prev.wind_hail_deductible_pct ?? '') : (e.windHailPct != null ? String(e.windHailPct) : ''),
      dwelling: prev?.dwelling_coverage ?? '', otherStructures: prev?.other_structures ?? '', personalProperty: prev?.personal_property ?? '', liability: prev?.liability ?? '',
      carrierProduct: prev?.carrier_product || '', notes: prev?.notes || '', floodSeparate: prev ? !!prev.flood_separate : false,
      effectiveDate: prev?.effective_date || r.defaults?.effectiveDate || '', validUntil: new Date(Date.now() + (r.defaults?.validDays || 30) * 86400000).toISOString().slice(0, 10) }));
  }, [r, editing]);

  if (err) return <div className="b-body"><div className="auth-alert show">⚠ {err}</div><button className="auth-btn-sec" onClick={() => go('/insurance')}>← Back to requests</button></div>;
  if (!r) return <div className="b-body" style={{ color: '#6b7280' }}>Loading…</div>;
  const s = r.snapshot || {}; const p = s.property || {}; const e = r.estimate; const open = ['requested', 'viewed', 'quoted'].includes(r.status);
  const latest = r.quotes?.[0] || null; const canQuote = open; const showForm = canQuote && (editing || !latest || latest.status === 'superseded');
  const monthly = form.annualPremium ? Number(form.annualPremium) / 12 : null;

  const submit = async () => {
    if (!form.annualPremium || Number(form.annualPremium) <= 0) { showToast('Enter the annual premium'); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/provider/requests/${id}/quotes`, { method: 'POST', body: { ...form, floodSeparate: !!form.floodSeparate } });
      setR(res); setEditing(false); showToast(`✓ Quote ${res.submitted?.quote_id} sent to ${r.mlo?.name || 'the loan officer'}`);
    } catch (ex) { showToast('⚠ ' + (ex.data?.error || ex.message)); } finally { setBusy(false); }
  };
  const sendUnable = async () => {
    setBusy(true);
    try { setR(await apiFetch(`/api/provider/requests/${id}/unable`, { method: 'POST', body: { reason: unable } })); setUnable(null); showToast('Marked as unable to quote'); }
    catch (ex) { showToast('⚠ ' + (ex.data?.error || ex.message)); } finally { setBusy(false); }
  };
  const sendMsg = async () => {
    if (!msg.trim()) return;
    try { setR(await apiFetch(`/api/provider/requests/${id}/messages`, { method: 'POST', body: { body: msg } })); setMsg(''); }
    catch (ex) { showToast('⚠ ' + (ex.data?.error || ex.message)); }
  };
  const onPdf = (file) => {
    if (!file) return; if (file.size > 8 * 1024 * 1024) { showToast('PDF must be under 8 MB'); return; }
    const rd = new FileReader(); rd.onload = () => setForm(f => ({ ...f, pdfBase64: String(rd.result), pdfFileName: file.name })); rd.readAsDataURL(file);
  };

  return (
    <div className="b-body" style={{ maxWidth: 1100 }}>
      <button className="auth-btn-sec" style={{ width: 'auto', padding: '8px 14px', marginBottom: 14 }} onClick={() => go('/insurance')}>← All requests</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><div className="b-page-title" style={{ marginBottom: 2 }}>Request {r.request_no} <Chip s={r.status} /></div>
          <div className="b-page-sub">Loan ID {s.loanNumber} · {r.quote_type} quote · received {when(r.requested_at)}{r.version > 1 ? ` · version ${r.version}` : ''}</div></div>
        {canQuote && !unable && <button className="auth-btn-sec" style={{ width: 'auto', padding: '8px 14px', color: '#b91c1c' }} onClick={() => setUnable('')}>Unable to quote</button>}
      </div>
      {unable !== null && (
        <Box title="Unable to quote">
          <div style={{ fontSize: 13, marginBottom: 8 }}>Tell the loan officer why (the request closes; they can send a new one).</div>
          <input className="form-input" style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} value={unable} onChange={ev => setUnable(ev.target.value)} placeholder="e.g. property outside our coverage area" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="auth-btn" style={{ width: 'auto', padding: '10px 16px', margin: 0, background: '#b91c1c' }} disabled={busy} onClick={sendUnable}>Send</button><button className="auth-btn-sec" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => setUnable(null)}>Cancel</button></div>
        </Box>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <Box title="Shared by the loan officer" style={{ marginBottom: 0 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <L k="Loan ID" v={s.loanNumber} />
            {(s.borrowers || []).map(b => <L key={b.slot} k={b.label} v={`${b.firstName} ${b.lastName}`} />)}
            <L k="Property" v={[p.street, p.unit].filter(Boolean).join(' ')} />
            <L k="" v={[p.city, p.state, p.zip].filter(Boolean).join(', ')} />
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>These are the only details shared for this request. Ask the loan officer below if you need more.</div>
        </Box>
        <Box title="Loan officer" style={{ marginBottom: 0 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <L k="Name" v={r.mlo?.name} /><L k="Company" v={r.mlo?.company} />
            <L k="Email" v={r.mlo?.email ? <a href={`mailto:${r.mlo.email}`} style={{ color: '#2563eb' }}>{r.mlo.email}</a> : '—'} />
            {r.mlo?.phone && <L k="Phone" v={r.mlo.phone} />}
          </div>
        </Box>
        {e && r.quote_type === 'insurance' && (
          <Box title="Market estimate (for you only)" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1e3a5f' }}>{money(e.annualPremium, 0)}<span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280' }}> / year · {money(e.monthly)} / month</span></div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>{e.note}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Typical deductible {money(e.typicalDeductible, 0)}{e.windHailPct != null ? ` · wind/hail ${e.windHailPct}%` : ''}{e.source ? ` · Source: ${e.source}${e.asOf ? ` (${e.asOf})` : ''}` : ''}{e.sourceUrl ? <> · <a href={e.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>link</a></> : null}</div>
            <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', padding: '6px 8px', borderRadius: 6, marginTop: 8 }}>Market average for the area, not a quote. The loan officer sees only what you submit.</div>
          </Box>)}
      </div>

      {latest && latest.status !== 'superseded' && !showForm && (
        <Box title={`Your quote ${latest.quote_id}`} style={{ marginTop: 16 }} right={<Chip s={latest.status} />}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{money(latest.monthly_premium)}<span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}> / month · {money(latest.annual_premium)} / year</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '6px 14px', marginTop: 8 }}>
            <L k="Dwelling" v={money(latest.dwelling_coverage, 0)} /><L k="Other structures" v={money(latest.other_structures, 0)} /><L k="Personal property" v={money(latest.personal_property, 0)} /><L k="Liability" v={money(latest.liability, 0)} />
            <L k="Deductible" v={money(latest.deductible_all_peril, 0)} /><L k="Wind/hail" v={latest.wind_hail_deductible_pct != null ? `${latest.wind_hail_deductible_pct}%` : '—'} /><L k="Flood" v={latest.flood_separate ? 'separate policy' : 'not required'} />
            <L k="Product" v={latest.carrier_product} /><L k="Effective" v={day(latest.effective_date)} /><L k="Valid until" v={day(latest.valid_until)} />
          </div>
          {latest.notes && <div style={{ fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>{latest.notes}</div>}
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Submitted {when(latest.submitted_at)} by {latest.submitted_by}{latest.decided_at ? ` · ${(STATUS[latest.status] || [latest.status])[0].toLowerCase()} ${when(latest.decided_at)}` : ''}</div>
          {latest.status === 'accepted' && <div style={{ fontSize: 13, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>✓ The borrower accepted this quote. The loan officer will coordinate the policy start date with you here — please do not contact the borrower directly.</div>}
          {latest.status === 'not_selected' && <div style={{ fontSize: 13, color: '#4b5563', background: '#f3f4f6', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>The borrower did not go with this quote. Thank you for quoting.</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {latest.has_pdf && <a className="auth-btn-sec" style={{ width: 'auto', padding: '8px 14px', textDecoration: 'none', display: 'inline-block' }} href={`${API_URL}/api/provider/quotes/${latest.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>}
            {canQuote && <button className="auth-btn-sec" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => setEditing(true)}>Revise quote (creates {latest.quote_id.replace(/-[A-Z]$/, '')}-{String.fromCharCode(65 + latest.revision)})</button>}
          </div>
        </Box>)}

      {showForm && (
        <Box title={latest && latest.status !== 'superseded' ? `Revise ${latest.quote_id}` : 'Your quote'} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0 14px' }}>
            <N label="Annual premium ($) *" k="annualPremium" form={form} set={setForm} step="0.01" />
            <div className="auth-field" style={{ marginBottom: 12 }}><label>Monthly (auto)</label><input value={monthly != null ? monthly.toFixed(2) : ''} readOnly style={{ padding: '12px', background: '#f8fafc' }} /></div>
            <N label="Dwelling coverage ($)" k="dwelling" form={form} set={setForm} />
            <N label="Other structures ($)" k="otherStructures" form={form} set={setForm} />
            <N label="Personal property ($)" k="personalProperty" form={form} set={setForm} />
            <N label="Liability ($)" k="liability" form={form} set={setForm} />
            <N label="Deductible, all perils ($)" k="deductibleAllPeril" form={form} set={setForm} />
            <N label="Wind / hail deductible (%)" k="windHailPct" form={form} set={setForm} step="0.5" />
            <div className="auth-field" style={{ marginBottom: 12 }}><label>Carrier / product</label><input value={form.carrierProduct} onChange={ev => setForm(f => ({ ...f, carrierProduct: ev.target.value }))} style={{ padding: 12 }} placeholder="e.g. HO-3 Preferred" /></div>
            <div className="auth-field" style={{ marginBottom: 12 }}><label>Policy effective date</label><input type="date" value={form.effectiveDate} onChange={ev => setForm(f => ({ ...f, effectiveDate: ev.target.value }))} style={{ padding: 12 }} /></div>
            <div className="auth-field" style={{ marginBottom: 12 }}><label>Quote valid until</label><input type="date" value={form.validUntil} onChange={ev => setForm(f => ({ ...f, validUntil: ev.target.value }))} style={{ padding: 12 }} /></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 12px' }}><input type="checkbox" checked={!!form.floodSeparate} onChange={ev => setForm(f => ({ ...f, floodSeparate: ev.target.checked }))} /> Flood zone — a separate flood policy is required</label>
          <div className="auth-field" style={{ marginBottom: 12 }}><label>Notes for the loan officer</label><textarea value={form.notes} onChange={ev => setForm(f => ({ ...f, notes: ev.target.value }))} rows={3} style={{ width: '100%', padding: 12, border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} /></div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>Quote PDF (optional): <input type="file" accept="application/pdf" onChange={ev => onPdf(ev.target.files?.[0])} />{form.pdfFileName && <span style={{ color: '#059669', marginLeft: 8 }}>✓ {form.pdfFileName}</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="auth-btn" style={{ width: 'auto', padding: '12px 20px', margin: 0 }} disabled={busy} onClick={submit}>{busy ? 'Sending…' : (latest && latest.status !== 'superseded' ? 'Submit revised quote' : 'Submit quote')}</button>
            {editing && <button className="auth-btn-sec" style={{ width: 'auto', padding: '12px 20px' }} onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </Box>)}

      {r.quotes?.length > 1 && (
        <details style={{ margin: '12px 0', fontSize: 13 }}><summary style={{ cursor: 'pointer', color: '#374151' }}>Previous quotes ({r.quotes.length - 1})</summary>
          {r.quotes.slice(1).map(q => <div key={q.id} style={{ padding: '6px 0', display: 'flex', gap: 10, alignItems: 'center' }}><strong>{q.quote_id}</strong><Chip s={q.status} /><span>{money(q.monthly_premium)}/mo · {money(q.annual_premium)}/yr</span><span style={{ color: '#6b7280' }}>{when(q.submitted_at)}</span></div>)}
        </details>)}

      <Box title="Messages with the loan officer" style={{ marginTop: 16 }}>
        {(r.messages || []).length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>No messages yet. Ask here if you need anything beyond what was shared.</div>}
        {(r.messages || []).map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.sender_type === 'provider' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
            <div style={{ maxWidth: '78%', background: m.sender_type === 'provider' ? '#eff6ff' : '#f3f4f6', borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{m.sender_name} · {when(m.created_at)}</div>{m.body}</div>
          </div>))}
        {!(open || r.status === 'accepted') ? <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>This request is closed — messaging is off.</div> : <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={msg} onChange={ev => setMsg(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') sendMsg(); }} placeholder="Write a message…" style={{ flex: 1, padding: 10, border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
          <button className="auth-btn" style={{ width: 'auto', padding: '10px 16px', margin: 0 }} onClick={sendMsg}>Send</button>
        </div>}
      </Box>
    </div>
  );
}

export default function InsuranceApp() {
  const [path, setPath] = useState(PATH()); const [user, setUser] = useState(null); const [checked, setChecked] = useState(false); const [toast, setToast] = useState('');
  useEffect(() => { const onPop = () => setPath(PATH()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => { apiFetch('/api/auth/me').then(u => { if (u && u.type === 'provider') setUser(u); }).catch(() => {}).finally(() => setChecked(true)); }, []);
  useEffect(() => { const onUnauth = () => setUser(null); window.addEventListener('jammie:unauthorized', onUnauth); return () => window.removeEventListener('jammie:unauthorized', onUnauth); }, []);
  const showToast = m => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const signOut = async () => { try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {} setUser(null); go('/insurance/login'); };
  const reqMatch = path.match(/^\/insurance\/request\/(\d+)$/);
  useEffect(() => {
    if (!checked) return;
    if (!user && path !== '/insurance/login') go('/insurance/login');
    if (user && path === '/insurance/login') go('/insurance');
  }, [checked, user, path]);

  let body;
  if (!checked) body = <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7280', fontSize: 13 }}>Loading…</div>;
  else if (!user) body = <Login onSignedIn={u => { setUser(u); go('/insurance'); }} />;
  else if (reqMatch) body = <RequestPage id={reqMatch[1]} user={user} showToast={showToast} />;
  else body = <Inbox user={user} onOpen={id => go(`/insurance/request/${id}`)} />;
  return (
    <div className="b-wrap">
      <Header user={user} onSignOut={signOut} />
      {body}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1e2d45', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, boxShadow: '0 8px 30px rgba(0,0,0,.25)', zIndex: 100 }}>{toast}</div>}
    </div>
  );
}
