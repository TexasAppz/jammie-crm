// src/borrower/BorrowerApp.jsx — the Borrower Application Portal.
//
// Lazy-loaded by src/App.jsx for any path under /apply. Shares the session
// cookie and the GlobalStyles (auth-*, b-*) that App.jsx renders; this file
// adds nothing to the MLO bundle.
//
// Routes (read from window.location.pathname, no router dependency):
//   /apply/invite/:token   accept an invitation → create account → /apply
//   /apply/login           returning borrower sign-in
//   /apply                 home: my application(s), status, loan officer
//   /apply/loan/:id        the guided application (Application.jsx)
//
// Phase 2 scope ends at "signed in and looking at my application". The
// form itself is Phase 3.

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../shared/api.js";
import Application from "./Application.jsx";

const PATH = () => window.location.pathname.replace(/\/+$/, '') || '/';
const go = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new Event('popstate')); };

// ── small shared pieces ────────────────────────────────────────────
function Header({ user, mlo, onSignOut }) {
  return (
    <div className="b-header">
      <div className="b-header-left">
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <span style={{color:'#fff',fontSize:18,fontWeight:700,letterSpacing:'-.3px'}}>Jammie</span>
          <span style={{color:'#60a5fa',fontSize:9,fontWeight:600,letterSpacing:'.06em'}}>MORTGAGE</span>
        </div>
        {user && <div style={{color:'#cbd5e1',fontSize:12}}>👤 {user.name}</div>}
        {mlo && (
          <div className="b-advisor-pill">
            <div className="b-advisor-avatar">{initials(mlo.name)}</div>
            <div className="b-advisor-text">Your loan officer: <strong>{mlo.name}</strong>{mlo.phone ? ` · ${mlo.phone}` : ''}</div>
          </div>
        )}
      </div>
      {user && <button className="b-logout-btn" onClick={onSignOut}>Sign out</button>}
    </div>
  );
}
const initials = n => String(n || '').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';

function Card({ title, children, width = 480 }) {
  return (
    <div className="auth-main">
      <div className="auth-card" style={{maxWidth:width}}>
        {title && <div className="auth-card-hdr">{title}</div>}
        <div className="auth-card-body">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, type = 'text', value, onChange, autoComplete, autoFocus, onEnter }) {
  return (
    <div className="auth-field">
      <label>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus}
        onKeyDown={e => e.key === 'Enter' && onEnter && onEnter()} />
    </div>
  );
}
function Advisor({ mlo }) {
  if (!mlo) return null;
  return (
    <div style={{display:'flex',alignItems:'center',gap:14,background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'14px 16px',marginBottom:22}}>
      <div style={{width:44,height:44,borderRadius:'50%',background:'#2563eb',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,flexShrink:0}}>{initials(mlo.name)}</div>
      <div style={{minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:'#1e2d45'}}>{mlo.name}</div>
        <div style={{fontSize:12,color:'#6b7280'}}>Loan Officer{mlo.nmls ? ` · NMLS #${mlo.nmls}` : ''}</div>
        <div style={{fontSize:12,color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis'}}>{[mlo.phone, mlo.email].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

// ── /apply/invite/:token ───────────────────────────────────────────
function AcceptInvite({ token, onSignedIn }) {
  const [inv, setInv] = useState(null);       // preview payload
  const [loadErr, setLoadErr] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch(`/api/invites/${token}`).then(setInv).catch(e => setLoadErr(e.status === 404 ? 'invalid' : (e.message || 'error')));
  }, [token]);

  const accept = async () => {
    setErr('');
    if (!inv.existingAccount) {
      if (pw.length < 10) { setErr('Password must be at least 10 characters.'); return; }
      if (pw !== pw2) { setErr('Passwords do not match.'); return; }
    }
    if (!agree) { setErr('Please agree to the Terms of Use and Privacy Policy.'); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/invites/${token}/accept`, { method: 'POST', body: { password: pw } });
      onSignedIn(r.user, r.loanId);
    } catch (e) {
      if (e.status === 409) { go(`/apply/login?next=${encodeURIComponent(`/apply/invite/${token}`)}`); return; }
      setErr(e.message || 'Could not accept the invitation.');
    } finally { setBusy(false); }
  };

  if (loadErr) return <Card title="Invitation"><Problem kind={loadErr} /></Card>;
  if (!inv) return <Card title="Invitation"><div style={{textAlign:'center',color:'#6b7280',padding:20}}>Loading…</div></Card>;
  if (inv.status !== 'ok') return <Card title="Invitation"><Problem kind={inv.status} mlo={inv.mlo} /></Card>;

  const first = inv.borrowerFirstName || 'there';
  return (
    <Card title="Start your application">
      <div className="auth-title" style={{marginBottom:10}}>Welcome, {first}</div>
      <div style={{fontSize:13,color:'#4b5563',textAlign:'center',marginBottom:20}}>
        {inv.existingAccount
          ? <>You already have a Jammie account for <strong>{inv.maskedEmail}</strong>. Sign in to add this application.</>
          : <>Choose a password for your account (<strong>{inv.maskedEmail}</strong>). Your application saves as you go, so you can come back any time.</>}
      </div>
      <Advisor mlo={inv.mlo} />
      {inv.existingAccount ? (
        <button className="auth-btn" onClick={() => go(`/apply/login?next=${encodeURIComponent(`/apply/invite/${token}`)}`)}>Sign in to continue →</button>
      ) : (
        <>
          <Field label="Password (10+ characters)" type="password" value={pw} onChange={setPw} autoComplete="new-password" autoFocus onEnter={accept} />
          <Field label="Confirm password" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" onEnter={accept} />
          <label className="auth-check-row"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I agree to the <a className="auth-link" href="#">Terms of Use</a> and <a className="auth-link" href="#">Privacy Policy</a></label>
          {err && <div className="auth-alert show">⚠ {err}</div>}
          <button className="auth-btn" onClick={accept} disabled={busy}>{busy ? 'Creating your account…' : 'Create account & start →'}</button>
        </>
      )}
      <div className="auth-terms">Invitation for {inv.maskedEmail}. Not you? Close this page.</div>
    </Card>
  );
}

function Problem({ kind, mlo }) {
  const msg = {
    expired:  'This invitation link has expired.',
    revoked:  'This invitation link is no longer valid — a newer one may have been sent to you.',
    accepted: 'This invitation has already been used.',
    invalid:  'This invitation link is not valid.',
  }[kind] || 'Something went wrong loading this invitation.';
  return (
    <div style={{textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:10}}>🔗</div>
      <div style={{fontSize:16,fontWeight:600,color:'#1e2d45',marginBottom:8}}>{msg}</div>
      <div style={{fontSize:13,color:'#6b7280',marginBottom:20}}>
        {kind === 'accepted' ? 'If this is your account, sign in below.' : `Ask ${mlo?.name || 'your loan officer'} to send you a new link.`}
        {mlo?.phone ? ` ${mlo.phone}` : ''}
      </div>
      <button className="auth-btn-sec" onClick={() => go('/apply/login')}>Go to sign in</button>
    </div>
  );
}

// ── /apply/login ───────────────────────────────────────────────────
function BorrowerLogin({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const next = new URLSearchParams(window.location.search).get('next') || '/apply';

  const submit = async () => {
    setErr('');
    if (!email.trim() || !pw) { setErr('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const u = await apiFetch('/api/auth/login', { method: 'POST', body: { login: email.trim(), password: pw, role: 'borrower' } });
      onSignedIn(u, next);
    } catch (e) { setErr(e.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  };
  return (
    <Card title="Borrower sign in">
      <div className="auth-title">Welcome back</div>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" autoFocus onEnter={submit} />
      <Field label="Password" type="password" value={pw} onChange={setPw} autoComplete="current-password" onEnter={submit} />
      {err && <div className="auth-alert show">⚠ {err}</div>}
      <button className="auth-btn" onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
      <div className="auth-terms">Forgot your password? Contact your loan officer and they will send a new invitation link.</div>
      <div className="auth-terms" style={{marginTop:6}}><a href="/" className="auth-link" style={{fontWeight:500}}>Loan officer? Sign in to the CRM →</a></div>
    </Card>
  );
}

// ── /apply (home) ──────────────────────────────────────────────────
const STATUS_TEXT = {
  in_progress: { label: 'In progress', color: '#2563eb', hint: 'Pick up where you left off.' },
  invited:     { label: 'Ready to start', color: '#d97706', hint: 'Your application is set up and waiting for you.' },
  submitted:   { label: 'Submitted', color: '#059669', hint: 'Your loan officer is reviewing it. We will email you about any next steps.' },
  draft:       { label: 'Not started', color: '#6b7280', hint: '' },
};

function Home({ user, data, onSignOut, onChangePassword, onOpen }) {
  const loans = data?.loans || [];
  const mlo = loans[0]?.mlo || null;
  return (
    <div className="b-wrap">
      <Header user={user} mlo={mlo} onSignOut={onSignOut} />
      <div style={{maxWidth:760,margin:'0 auto',padding:'28px 16px 60px'}}>
        <div style={{fontSize:22,fontWeight:700,color:'#1e2d45',marginBottom:4}}>Hi {user.firstName || user.name}, here's your application</div>
        <div style={{fontSize:13,color:'#6b7280',marginBottom:22}}>Everything you enter is saved automatically. Your loan officer can see your progress and help along the way.</div>

        {loans.length === 0 && (
          <div className="b-section"><div className="b-section-body" style={{borderTop:'1px solid #e5e4e0',borderRadius:8,textAlign:'center',color:'#6b7280'}}>
            No application is linked to this account yet. If you received an invitation link, open it while signed in.
          </div></div>
        )}
        {loans.map(l => {
          const s = STATUS_TEXT[l.applicationStatus] || STATUS_TEXT.draft;
          return (
            <div key={l.id} className="b-section">
              <div className="b-section-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>{l.purpose === 'Refinance' ? 'Refinance' : 'Home purchase'} application</span>
                <span style={{fontSize:11,fontWeight:600,letterSpacing:0,textTransform:'none',background:'rgba(255,255,255,.15)',padding:'2px 10px',borderRadius:10}}>{s.label}</span>
              </div>
              <div className="b-section-body">
                <div style={{display:'flex',flexWrap:'wrap',gap:'8px 24px',fontSize:13,color:'#4b5563',marginBottom:14}}>
                  <div><span style={{color:'#9ca3af'}}>Borrower </span>{l.borrowerName}</div>
                  <div><span style={{color:'#9ca3af'}}>Application # </span>{l.loanNumber}</div>
                  {l.subjectProperty && <div><span style={{color:'#9ca3af'}}>Property </span>{l.subjectProperty}</div>}
                </div>
                <div style={{fontSize:13,color:'#4b5563',marginBottom:16}}>
                  {l.completedAt ? <>✓ You marked your part complete{l.role === 'co_borrower' ? '' : ''}. You can still make changes.</> : s.hint}
                  {l.role === 'co_borrower' && <div style={{marginTop:4,color:'#6b7280'}}>You are the co-borrower on this application.</div>}
                </div>
                {l.applicationStatus !== 'submitted' ? (
                  <button className="auth-btn" style={{marginBottom:0}} onClick={() => onOpen(l.id)}>
                    {l.lastSeenStep || l.completedAt ? 'Continue application →' : 'Start application →'}
                  </button>
                ) : (
                  <div style={{fontSize:13,color:'#059669',fontWeight:600}}>✓ Submitted {l.submittedAt ? new Date(l.submittedAt).toLocaleDateString() : ''}</div>
                )}
              </div>
            </div>
          );
        })}

        <Advisor mlo={mlo} />
        <div style={{fontSize:12,color:'#9ca3af',textAlign:'center'}}>
          Signed in as {user.email} · <a className="auth-link" style={{fontWeight:500,cursor:'pointer'}} onClick={onChangePassword}>Change password</a>
        </div>
      </div>
    </div>
  );
}

function ChangePassword({ onClose, onDone }) {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr('');
    if (next.length < 10) { setErr('New password must be at least 10 characters.'); return; }
    if (next !== confirm) { setErr('New password and confirmation do not match.'); return; }
    setBusy(true);
    try { await apiFetch('/api/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: next } }); onDone(); }
    catch (e) { setErr(e.message || 'Could not change password'); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-card" style={{maxWidth:420}} onClick={e => e.stopPropagation()}>
        <div className="auth-card-hdr">Change password</div>
        <div className="auth-card-body">
          <Field label="Current password" type="password" value={cur} onChange={setCur} autoComplete="current-password" autoFocus onEnter={submit} />
          <Field label="New password (10+ characters)" type="password" value={next} onChange={setNext} autoComplete="new-password" onEnter={submit} />
          <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" onEnter={submit} />
          {err && <div className="auth-alert show">⚠ {err}</div>}
          <button className="auth-btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          <button className="auth-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── root ───────────────────────────────────────────────────────────
export default function BorrowerApp() {
  const [path, setPath] = useState(PATH());
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const onPop = () => setPath(PATH());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Who am I? A borrower session counts; an MLO session on this cookie does not.
  useEffect(() => {
    apiFetch('/api/auth/me').then(u => { if (u && u.type === 'borrower') setUser(u); }).catch(() => {}).finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    const onUnauth = () => { setUser(null); setData(null); };
    window.addEventListener('jammie:unauthorized', onUnauth);
    return () => window.removeEventListener('jammie:unauthorized', onUnauth);
  }, []);

  const loadData = useCallback(() => apiFetch('/api/apply').then(setData).catch(() => setData({ loans: [] })), []);
  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const signOut = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
    setUser(null); setData(null); go('/apply/login');
  };
  const signedIn = (u, next) => { setUser(u); go(next && next.startsWith('/apply') ? next : '/apply'); };

  const inviteMatch = path.match(/^\/apply\/invite\/([A-Za-z0-9_-]+)$/);
  const loanMatch   = path.match(/^\/apply\/loan\/(\d+)$/);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  // Redirects happen after render, never during it.
  useEffect(() => {
    if (inviteMatch || !checked) return;
    if (!user && path !== '/apply/login') go('/apply/login' + (path !== '/apply' ? `?next=${encodeURIComponent(path)}` : ''));
    if (user && path !== '/apply' && !loanMatch) go('/apply');
  }, [inviteMatch, loanMatch, checked, user, path]);

  // Back on the home screen after an application session: refresh statuses.
  const exitApplication = () => { go('/apply'); loadData(); };

  let body;
  if (inviteMatch) {
    body = <div className="b-wrap"><Header /><AcceptInvite token={inviteMatch[1]} onSignedIn={(u) => signedIn(u, '/apply')} /></div>;
  } else if (!checked) {
    body = <div style={{minHeight:'100vh',display:'grid',placeItems:'center',color:'#6b7280',fontSize:13}}>Loading…</div>;
  } else if (!user) {
    body = <div className="b-wrap"><Header /><BorrowerLogin onSignedIn={signedIn} /></div>;
  } else if (!data) {
    body = <div style={{minHeight:'100vh',display:'grid',placeItems:'center',color:'#6b7280',fontSize:13}}>Loading your application…</div>;
  } else if (loanMatch) {
    const loan = data.loans.find(l => l.id === Number(loanMatch[1]));
    body = (
      <div className="b-wrap">
        <Header user={user} mlo={loan?.mlo || data.loans[0]?.mlo} onSignOut={signOut} />
        <Application loanId={Number(loanMatch[1])} user={user} onExit={exitApplication} showToast={showToast} />
      </div>
    );
  } else {
    body = <Home user={user} data={data} onSignOut={signOut} onChangePassword={() => setPwOpen(true)} onOpen={id => go(`/apply/loan/${id}`)} />;
  }

  return (
    <>
      {body}
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} onDone={() => { setPwOpen(false); showToast('✓ Password changed'); }} />}
      {toast && <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'#1e2d45',color:'#fff',padding:'10px 18px',borderRadius:8,fontSize:13,boxShadow:'0 8px 30px rgba(0,0,0,.25)',zIndex:500}}>{toast}</div>}
    </>
  );
}
