// src/borrower/Quotes.jsx — "Insurance quotes" for one application (/apply/loan/:id/quotes).
//
// The borrower sees every quote the loan officer requested on their behalf,
// the moment a provider submits it. The PRIMARY borrower accepts or declines;
// co-borrowers see the same list and the decision, read-only. Accepting one
// quote marks the others "not selected" — the borrower may still switch while
// those quotes are valid. Questions go to the loan officer only; insurance
// agents never get a channel to the borrower and never see this thread.

import { useState, useEffect, useCallback } from "react";
import { apiFetch, API_URL } from "../shared/api.js";

const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = d => d ? new Date(d).toLocaleString() : '';
const day = d => d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString() : '—';

const STATUS = {
  quoted:       { label: 'Waiting for your decision', bg: '#fff7ed', fg: '#c2410c' },
  accepted:     { label: 'Accepted — this is your policy', bg: '#ecfdf5', fg: '#047857' },
  not_selected: { label: 'Not selected', bg: '#f3f4f6', fg: '#4b5563' },
  declined:     { label: 'Declined', bg: '#f3f4f6', fg: '#4b5563' },
  expired:      { label: 'Expired', bg: '#f3f4f6', fg: '#6b7280' },
  superseded:   { label: 'Replaced by a newer quote', bg: '#f3f4f6', fg: '#6b7280' },
};
const Chip = ({ s }) => { const c = STATUS[s] || { label: s, bg: '#f3f4f6', fg: '#4b5563' }; return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{c.label}</span>; };
const Row = ({ k, v }) => <div style={{ fontSize: 13 }}><span style={{ color: '#9ca3af' }}>{k} </span><strong style={{ color: '#1e2d45', fontWeight: 600 }}>{v}</strong></div>;

export default function Quotes({ loanId, user, onExit, showToast }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);      // { quote, kind:'accept'|'decline' }
  const [reason, setReason] = useState('');
  const [drafts, setDrafts] = useState({});

  const load = useCallback(() => apiFetch(`/api/apply-quotes/${loanId}`).then(d => { setData(d); setErr(''); }).catch(e => setErr(e.message)), [loanId]);
  useEffect(load, [load]);

  const decide = async () => {
    if (!confirm) return;
    setBusy(confirm.quote.id);
    try {
      const d = await apiFetch(`/api/apply-quotes/${loanId}/quote/${confirm.quote.id}/decision`, { method: 'POST', body: { decision: confirm.kind === 'accept' ? 'accepted' : 'declined', reason } });
      setData(x => ({ ...x, ...d }));
      showToast(confirm.kind === 'accept' ? `✓ You accepted ${confirm.quote.quote_id}. Your loan officer has been told.` : `Quote ${confirm.quote.quote_id} declined.`);
      setConfirm(null); setReason('');
    } catch (e) { showToast('⚠ ' + (e.data?.error || e.message)); }
    finally { setBusy(null); }
  };
  const ask = async (r) => {
    const text = (drafts[r.id] || '').trim(); if (!text) return;
    try {
      const v = await apiFetch(`/api/apply-quotes/${loanId}/request/${r.id}/messages`, { method: 'POST', body: { body: text } });
      setDrafts(d => ({ ...d, [r.id]: '' }));
      setData(x => ({ ...x, requests: x.requests.map(q => q.id === r.id ? { ...q, messages: v.messages, messages_total: (v.messages || []).length } : q) }));
    } catch (e) { showToast('⚠ ' + (e.data?.error || e.message)); }
  };

  if (err) return <div className="b-body"><div style={{ color: '#b91c1c' }}>Could not load your quotes: {err}</div><button className="auth-btn-sec" style={{ width: 'auto', marginTop: 12 }} onClick={onExit}>← Back</button></div>;
  if (!data) return <div className="b-body" style={{ color: '#6b7280', fontSize: 13 }}>Loading your quotes…</div>;

  const canDecide = data.can_decide;
  const accepted = data.accepted;
  const withQuote = data.requests.filter(r => r.latest_quote);
  const waiting = data.requests.filter(r => ['requested', 'viewed'].includes(r.status));
  const closedNoQuote = data.requests.filter(r => !r.latest_quote && !['requested', 'viewed'].includes(r.status));
  const snapP = data.requests[0]?.snapshot?.property;
  const addr = snapP && snapP.street ? [snapP.street, snapP.unit, snapP.city, [snapP.state, snapP.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : data.loan?.subjectProperty;

  return (
    <div className="b-body">
      <button className="auth-btn-sec" style={{ width: 'auto', padding: '8px 14px', marginBottom: 18 }} onClick={onExit}>← Back to my application</button>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1e2d45', marginBottom: 4 }}>Homeowners insurance quotes</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
        {addr ? <>For <strong style={{ color: '#374151' }}>{addr}</strong> · </> : null}Application #{data.loan?.loanNumber}
      </div>
      <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 22, lineHeight: 1.5 }}>
        {canDecide
          ? <>Your loan officer asked insurance providers to quote your new home. Compare them here and <strong>accept the one you want</strong> — that premium becomes the homeowners-insurance figure on your loan. You can change your mind while the quotes are still valid. Providers only know your name and the property address; questions go to {data.mlo?.name || 'your loan officer'}, never to the provider.</>
          : <>Your loan officer asked insurance providers to quote the new home. {data.borrowers?.find?.(b => b.role === 'primary')?.name || 'The primary borrower'} makes the final choice; you can follow it here and ask {data.mlo?.name || 'your loan officer'} anything about the quotes.</>}
      </div>

      {accepted && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '14px 18px', marginBottom: 22, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 26 }}>✓</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, color: '#065f46' }}>You accepted {accepted.quote_id}{accepted.decided_by_type === 'mlo' ? ' (recorded by your loan officer)' : ''}</div>
            <div style={{ fontSize: 13, color: '#047857' }}>${money(accepted.monthly_premium)} / month · ${money(accepted.annual_premium)} / year{accepted.carrier_product ? ` · ${accepted.carrier_product}` : ''}{accepted.decided_at ? ` · ${when(accepted.decided_at)}` : ''}</div>
          </div>
        </div>
      )}

      {data.requests.length === 0 && (
        <div className="b-section"><div className="b-section-body" style={{ borderTop: '1px solid #e5e4e0', borderRadius: 8, textAlign: 'center', color: '#6b7280' }}>
          No insurance quotes have been requested yet. Your loan officer will request them once the property address is on file.
        </div></div>
      )}

      {waiting.length > 0 && (
        <div className="b-section">
          <div className="b-section-hdr">Waiting for quotes</div>
          <div className="b-section-body" style={{ display: 'grid', gap: 10 }}>
            {waiting.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13, color: '#4b5563' }}>
                <div><strong style={{ color: '#1e2d45' }}>{r.provider?.name}</strong> — requested {when(r.requested_at)}{r.viewed_at ? ` · opened by the provider ${when(r.viewed_at)}` : ''}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '3px 10px', borderRadius: 10 }}>Waiting</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {withQuote.map(r => {
        const q = r.latest_quote;
        const older = r.quotes.filter(x => x.id !== q.id);
        const isAccepted = q.status === 'accepted';
        const canAccept = canDecide && (q.status === 'quoted' || q.can_reselect || q.status === 'declined');
        const canDecline = canDecide && ['quoted', 'accepted'].includes(q.status);
        return (
          <div key={r.id} className="b-section" style={{ opacity: ['not_selected', 'declined', 'expired'].includes(q.status) ? 0.8 : 1 }}>
            <div className="b-section-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: isAccepted ? '#065f46' : undefined }}>
              <span>{r.provider?.name} · {q.quote_id}</span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}><Chip s={q.status} /></span>
            </div>
            <div className="b-section-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#1e2d45', lineHeight: 1 }}>${money(q.monthly_premium)}<span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}> / month</span></div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>${money(q.annual_premium)} / year{q.carrier_product ? ` · ${q.carrier_product}` : ''}</div>
                </div>
                {canDecide && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canAccept && <button className="auth-btn" style={{ width: 'auto', padding: '10px 18px', margin: 0, fontSize: 14 }} disabled={busy === q.id} onClick={() => { setConfirm({ quote: q, kind: 'accept', provider: r.provider?.name }); setReason(''); }}>{q.status === 'not_selected' || q.status === 'declined' ? 'Choose this one instead' : 'Accept this quote'}</button>}
                    {canDecline && <button className="auth-btn-sec" style={{ width: 'auto', padding: '10px 16px', fontSize: 14 }} disabled={busy === q.id} onClick={() => { setConfirm({ quote: q, kind: 'decline', provider: r.provider?.name }); setReason(''); }}>{isAccepted ? 'Cancel my acceptance' : 'Decline'}</button>}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '8px 16px', marginBottom: 12 }}>
                <Row k="Dwelling coverage" v={q.dwelling_coverage != null ? '$' + money(q.dwelling_coverage) : '—'} />
                <Row k="Other structures" v={q.other_structures != null ? '$' + money(q.other_structures) : '—'} />
                <Row k="Personal property" v={q.personal_property != null ? '$' + money(q.personal_property) : '—'} />
                <Row k="Liability" v={q.liability != null ? '$' + money(q.liability) : '—'} />
                <Row k="Deductible" v={(q.deductible_all_peril != null ? '$' + money(q.deductible_all_peril) : '—') + (q.wind_hail_deductible_pct != null ? ` · wind/hail ${q.wind_hail_deductible_pct}%` : '')} />
                <Row k="Flood" v={q.flood_separate ? 'separate flood policy required' : 'not required'} />
                <Row k="Policy starts" v={day(q.effective_date)} />
                <Row k="Quote valid until" v={day(q.valid_until)} />
              </div>
              {q.notes && <div style={{ fontSize: 13, color: '#4b5563', fontStyle: 'italic', background: '#f9fafb', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{q.notes}</div>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#9ca3af' }}>
                <span>Received {when(q.submitted_at)}</span>
                {q.has_pdf && <a className="auth-btn-sec" style={{ width: 'auto', padding: '6px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-block' }} href={`${API_URL}/api/apply-quotes/${loanId}/quote/${q.id}/pdf`} target="_blank" rel="noreferrer">Open the quote PDF</a>}
                {q.status === 'declined' && q.decline_reason && <span>· your note: “{q.decline_reason}”</span>}
                {q.decided_at && q.status !== 'quoted' && <span>· {STATUS[q.status]?.label || q.status} {when(q.decided_at)}</span>}
              </div>
              {older.length > 0 && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Earlier versions: {older.map(o => `${o.quote_id} ($${money(o.monthly_premium)}/mo)`).join(', ')}</div>}

              {/* Questions for the loan officer — never the provider */}
              <div style={{ marginTop: 14, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Ask {data.mlo?.name || 'your loan officer'} about this quote</div>
                {(r.messages || []).map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.sender_type === 'borrower' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                    <div style={{ maxWidth: '80%', background: m.sender_type === 'borrower' ? '#dbeafe' : '#f3f4f6', borderRadius: 10, padding: '6px 10px', fontSize: 13 }}>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{m.sender_name} · {when(m.created_at)}</div>{m.body}</div></div>))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input className="auth-input" style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} value={drafts[r.id] || ''} onChange={e => { const v = e.target.value; setDrafts(d => ({ ...d, [r.id]: v })); }} onKeyDown={e => { if (e.key === 'Enter') ask(r); }} placeholder="Type a question…" />
                  <button className="auth-btn" style={{ width: 'auto', padding: '9px 16px', margin: 0, fontSize: 13 }} disabled={!(drafts[r.id] || '').trim()} onClick={() => ask(r)}>Send</button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {closedNoQuote.length > 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 20 }}>
          {closedNoQuote.map(r => <div key={r.id}>{r.provider?.name}: {r.status === 'declined_by_provider' ? 'could not quote this property' : r.status === 'withdrawn' ? 'request withdrawn by your loan officer' : r.status.replace(/_/g, ' ')}</div>)}
        </div>
      )}

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 400, padding: 16 }} onClick={() => setConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1e2d45', marginBottom: 8 }}>{confirm.kind === 'accept' ? `Accept ${confirm.quote.quote_id} from ${confirm.provider}?` : confirm.quote.status === 'accepted' ? `Cancel your acceptance of ${confirm.quote.quote_id}?` : `Decline ${confirm.quote.quote_id}?`}</div>
            <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, marginBottom: 14 }}>
              {confirm.kind === 'accept'
                ? <>${money(confirm.quote.monthly_premium)} / month becomes the homeowners-insurance figure on your loan and your loan officer will arrange the policy with {confirm.provider}. {accepted && accepted.id !== confirm.quote.id ? <>Your earlier choice ({accepted.quote_id}) will be marked not selected. </> : null}Other quotes are set aside but can still be chosen while they are valid.</>
                : confirm.quote.status === 'accepted'
                  ? <>The homeowners-insurance figure goes back to the market estimate until you accept another quote. The provider will be told the quote was not selected.</>
                  : <>The provider will only be told the quote was not selected. Add a note for {data.mlo?.name || 'your loan officer'} if you like — the provider never sees it.</>}
            </div>
            {confirm.kind === 'decline' && <textarea style={{ width: '100%', minHeight: 70, padding: 10, border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, marginBottom: 12, fontFamily: 'inherit' }} placeholder="Optional note for your loan officer" value={reason} onChange={e => setReason(e.target.value)} />}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="auth-btn-sec" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => setConfirm(null)}>Go back</button>
              <button className="auth-btn" style={{ width: 'auto', padding: '10px 18px', margin: 0, background: confirm.kind === 'accept' ? '#059669' : '#2563EB' }} disabled={busy != null} onClick={decide}>{busy != null ? 'Saving…' : confirm.kind === 'accept' ? 'Yes, accept this quote' : confirm.quote.status === 'accepted' ? 'Yes, cancel it' : 'Decline'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
