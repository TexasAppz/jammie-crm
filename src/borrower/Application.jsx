// src/borrower/Application.jsx — the guided application.
//
// One component tree, two layouts: a step sidebar + form on screens ≥ 900px,
// a one-step-per-screen stepper with a bottom bar on phones. Everything is
// driven by STEPS in steps.js; this file only knows how to render field
// types, edit lists, and save.
//
// SAVING
//   Every edit marks its part dirty (borrower | shared | <list> |
//   declarations | demographics | progress). A debounced save (1.2 s) sends
//   only dirty parts to PUT /api/apply/:loanId/form. Step changes flush
//   immediately; leaving the page sends a keepalive request. Failures keep
//   the data on screen and retry.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiFetch, API_URL } from "../shared/api.js";
import { STEPS, US_STATES, PREV_ADDRESS_FIELDS, DECLARATIONS, DEMOGRAPHICS, visibleFields, missingIn, stepStatus, stepMissing, isEmpty } from "./steps.js";

const CSS = `
  .ap-wrap { max-width: 1120px; margin: 0 auto; padding: 20px 16px 96px; }
  .ap-layout { display: grid; grid-template-columns: 250px 1fr; gap: 24px; align-items: start; }
  .ap-nav { position: sticky; top: 68px; background: #fff; border: 1px solid #e5e4e0; border-radius: 12px; padding: 10px; }
  .ap-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 9px 10px; border-radius: 8px; border: none; background: none; cursor: pointer; font: inherit; font-size: 13px; color: #4b5563; }
  .ap-nav-item:hover { background: #f3f4f6; }
  .ap-nav-item.active { background: #EFF6FF; color: #1d4ed8; font-weight: 600; }
  .ap-dot { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; border: 2px solid #d1d5db; color: #9ca3af; background: #fff; }
  .ap-dot.done { background: #10b981; border-color: #10b981; color: #fff; }
  .ap-dot.started { border-color: #f59e0b; color: #d97706; }
  .ap-dot.active { border-color: #2563EB; color: #2563EB; }
  .ap-card { background: #fff; border: 1px solid #e5e4e0; border-radius: 12px; padding: 24px 28px; }
  .ap-title { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 6px; }
  .ap-intro { font-size: 14px; color: #4b5563; line-height: 1.55; margin: 0 0 22px; }
  .ap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 20px; }
  .ap-span2 { grid-column: 1 / -1; }
  .ap-hint { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .ap-err { font-size: 12px; color: #b91c1c; margin-top: 2px; }
  .ap-input-err { border-color: #ef4444 !important; }
  .ap-ro .form-input, .ap-ro .form-select, .ap-ro .ap-chip { background: #f3f4f6 !important; color: #4b5563 !important; cursor: default; }
  .ap-radio-group { display: flex; flex-wrap: wrap; gap: 8px; }
  .ap-chip { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 10px; cursor: pointer; font-size: 14px; color: #111827; background: #fff; }
  .ap-chip input { accent-color: #2563EB; }
  .ap-chip.on { border-color: #2563EB; background: #EFF6FF; color: #1d4ed8; font-weight: 600; }
  .ap-entry { border: 1px solid #e5e4e0; border-radius: 12px; padding: 18px; margin-bottom: 14px; background: #fafafa; }
  .ap-entry-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; font-size: 13px; font-weight: 700; color: #1e2d45; text-transform: uppercase; letter-spacing: .04em; }
  .ap-add { display: inline-flex; align-items: center; gap: 6px; padding: 12px 16px; border: 1.5px dashed #93c5fd; border-radius: 10px; background: #fff; color: #2563EB; font-weight: 600; font-size: 14px; cursor: pointer; width: 100%; justify-content: center; }
  .ap-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e4e0; }
  .ap-btn { padding: 12px 22px; border-radius: 10px; border: 1.5px solid #e5e7eb; background: #fff; color: #111827; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .ap-btn.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
  .ap-btn.primary:disabled { opacity: .5; cursor: default; }
  .ap-save { font-size: 12px; color: #6b7280; display: inline-flex; align-items: center; gap: 6px; }
  .ap-save.error { color: #b91c1c; }
  .ap-banner { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px; padding: 12px 14px; font-size: 13px; margin-bottom: 18px; }
  .ap-banner.info { background: #EFF6FF; border-color: #bfdbfe; color: #1e40af; }
  .ap-banner.ok { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
  .ap-yn { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid #f0efeb; }
  .ap-yn:last-child { border-bottom: none; }
  .ap-yn-q { font-size: 14px; color: #111827; line-height: 1.45; }
  .ap-yn-q strong { color: #6b7280; margin-right: 6px; }
  .ap-review-row { display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; align-items: start; padding: 14px 0; border-bottom: 1px solid #f0efeb; }
  .ap-review-row:last-child { border-bottom: none; }
  .ap-others { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
  .ap-other { font-size: 12px; background: #f3f4f6; border-radius: 20px; padding: 5px 12px; color: #374151; }
  .ap-mobile-top { display: none; }
  .ap-mobile-bar { display: none; }
  .ap-sheet { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 300; display: flex; align-items: flex-end; }
  .ap-sheet-body { background: #fff; width: 100%; border-radius: 16px 16px 0 0; padding: 14px 12px calc(14px + env(safe-area-inset-bottom, 0px)); max-height: 80vh; overflow: auto; }
  @media (max-width: 899px) {
    .ap-wrap { padding: 12px 12px 110px; }
    .ap-layout { display: block; }
    .ap-nav { display: none; }
    .ap-card { padding: 18px 16px; border-radius: 12px; }
    .ap-title { font-size: 20px; }
    .ap-grid { grid-template-columns: 1fr; gap: 14px; }
    .ap-footer { display: none; }
    .ap-mobile-top { display: block; margin-bottom: 12px; }
    .ap-progress { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
    .ap-progress > div { height: 100%; background: #2563EB; transition: width .25s; }
    .ap-mobile-top-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6b7280; }
    .ap-mobile-bar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid #e5e4e0; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); gap: 10px; z-index: 60; box-shadow: 0 -2px 12px rgba(0,0,0,.06); }
    .ap-mobile-bar .ap-btn { flex: 1; padding: 14px; font-size: 16px; }
    .ap-yn { grid-template-columns: 1fr; gap: 8px; }
    .ap-review-row { grid-template-columns: 24px 1fr; }
    .ap-review-row > :last-child { grid-column: 2; }
  }
`;

const STATE_CODES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const STATE_BY_CODE = Object.fromEntries(STATE_CODES.map((c, i) => [c, US_STATES[i]]));

// ── small inputs ────────────────────────────────────────────────────────
const fmtMoney = v => { if (v == null || v === '') return ''; const n = Number(String(v).replace(/[$,]/g, '')); return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : String(v); };
const stripMoney = v => String(v ?? '').replace(/[^0-9.]/g, '');

function MoneyInput({ value, onChange, placeholder, invalid, readOnly }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14, pointerEvents: 'none' }}>$</span>
      <input className={`form-input${invalid ? ' ap-input-err' : ''}`} inputMode="decimal" style={{ paddingLeft: 24 }} readOnly={readOnly}
        value={focus ? (value ?? '') : fmtMoney(value)} placeholder={placeholder || '0'}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={e => onChange(stripMoney(e.target.value))} />
    </div>
  );
}

function SsnInput({ value, onChange, invalid, readOnly }) {
  const [show, setShow] = useState(false);
  const digits = String(value || '').replace(/\D/g, '');
  const masked = digits.length >= 4 ? `•••-••-${digits.slice(-4)}` : (digits ? '•'.repeat(digits.length) : '');
  const pretty = digits.length > 5 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}` : digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
  return (
    <div style={{ position: 'relative' }}>
      <input className={`form-input${invalid ? ' ap-input-err' : ''}`} inputMode="numeric" autoComplete="off" readOnly={readOnly}
        value={show ? pretty : masked} placeholder="000-00-0000" maxLength={11} style={{ paddingRight: 44 }}
        onFocus={() => setShow(true)}
        onChange={e => { if (show) onChange(e.target.value.replace(/\D/g, '').slice(0, 9)); }} />
      <button type="button" onMouseDown={e => { e.preventDefault(); setShow(s => !s); }} aria-label={show ? 'Hide' : 'Show'}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2563EB', fontWeight: 600 }}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

function YearsInput({ value, onChange, invalid, readOnly }) {
  const n = Number(value);
  const y = Number.isFinite(n) && value !== '' ? Math.floor(n) : '';
  const m = Number.isFinite(n) && value !== '' ? Math.round((n - Math.floor(n)) * 12) : '';
  const set = (yy, mm) => { const Y = Number(yy) || 0, M = Math.min(11, Math.max(0, Number(mm) || 0)); onChange(yy === '' && mm === '' ? '' : String(Math.round((Y + M / 12) * 100) / 100)); };
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1 }}><input className={`form-input${invalid ? ' ap-input-err' : ''}`} inputMode="numeric" readOnly={readOnly} value={y} placeholder="Years" onChange={e => set(e.target.value.replace(/\D/g, ''), m)} /><div className="ap-hint">years</div></div>
      <div style={{ flex: 1 }}><input className="form-input" inputMode="numeric" readOnly={readOnly} value={m} placeholder="Months" onChange={e => set(y, e.target.value.replace(/\D/g, ''))} /><div className="ap-hint">months</div></div>
    </div>
  );
}

function Field({ f, value, onChange, invalid, readOnly }) {
  const cls = `form-input${invalid ? ' ap-input-err' : ''}`;
  const opts = (f.options || []).map(o => Array.isArray(o) ? o : [o, o]);
  switch (f.type) {
    case 'money': return <MoneyInput value={value} onChange={onChange} placeholder={f.placeholder} invalid={invalid} readOnly={readOnly} />;
    case 'ssn':   return <SsnInput value={value} onChange={onChange} invalid={invalid} readOnly={readOnly} />;
    case 'years': return <YearsInput value={value} onChange={onChange} invalid={invalid} readOnly={readOnly} />;
    case 'select':
      return <select className={`form-select${invalid ? ' ap-input-err' : ''}`} value={value ?? ''} disabled={readOnly} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    case 'state': {
      // Data standard is the full name ('Texas'); tolerate a 2-letter code from older rows.
      const v = STATE_BY_CODE[String(value || '').toUpperCase()] || value || '';
      return <select className={`form-select${invalid ? ' ap-input-err' : ''}`} value={v} disabled={readOnly} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>;
    }
    case 'radio':
      return <div className="ap-radio-group">{opts.map(([v, l]) => (
        <label key={v} className={`ap-chip${String(value) === String(v) ? ' on' : ''}`}>
          <input type="radio" checked={String(value) === String(v)} disabled={readOnly} onChange={() => onChange(v)} /> {l}
        </label>))}</div>;
    case 'yesno':
      return <div className="ap-radio-group">{[[1, 'Yes'], [0, 'No']].map(([v, l]) => (
        <label key={v} className={`ap-chip${value !== '' && value != null && Number(value) === v ? ' on' : ''}`}>
          <input type="radio" checked={value !== '' && value != null && Number(value) === v} disabled={readOnly} onChange={() => onChange(v)} /> {l}
        </label>))}</div>;
    case 'checkbox':
      return <label className="ap-chip" style={{ width: '100%' }}><input type="checkbox" checked={!!value} disabled={readOnly} onChange={e => onChange(e.target.checked)} /> {f.label}</label>;
    case 'date':
      return <input className={cls} type="date" value={value ?? ''} readOnly={readOnly} onChange={e => onChange(e.target.value)} />;
    case 'number':
      return <input className={cls} inputMode="decimal" value={value ?? ''} readOnly={readOnly} placeholder={f.placeholder} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))} />;
    case 'zip':
      return <input className={cls} inputMode="numeric" value={value ?? ''} readOnly={readOnly} placeholder="00000" maxLength={10} onChange={e => onChange(e.target.value.replace(/[^0-9-]/g, ''))} />;
    case 'phone':
      return <input className={cls} type="tel" inputMode="tel" value={value ?? ''} readOnly={readOnly} placeholder="(000) 000-0000" onChange={e => onChange(e.target.value)} />;
    case 'email':
      return <input className={cls} type="email" value={value ?? ''} readOnly={readOnly || f.readOnly} onChange={e => onChange(e.target.value)} style={f.readOnly ? { background: '#f3f4f6', color: '#6b7280' } : undefined} />;
    default:
      return <input className={cls} type="text" value={value ?? ''} readOnly={readOnly} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />;
  }
}

/** A grid of fields over one object. `ctx` is what showIf sees. */
function FieldsGrid({ fields, obj, ctx, onChange, showErrors, readOnly }) {
  const vis = visibleFields(fields, ctx);
  return (
    <div className={`ap-grid${readOnly ? ' ap-ro' : ''}`}>
      {vis.map(f => {
        const val = obj?.[f.key] ?? '';
        const bad = showErrors && f.req && !f.virtual && isEmpty(val);
        if (f.type === 'checkbox') return <div key={f.key} className={f.span === 2 ? 'ap-span2' : ''}><Field f={f} value={val} onChange={v => onChange(f.key, v)} readOnly={readOnly} /></div>;
        return (
          <div key={f.key} className={`form-group${f.span === 2 ? ' ap-span2' : ''}`}>
            <label className="form-label">{f.label}{f.req && <span style={{ color: '#ef4444' }}> *</span>}</label>
            <Field f={f} value={val} onChange={v => onChange(f.key, v)} invalid={bad} readOnly={readOnly} />
            {bad ? <div className="ap-err">Required</div> : f.hint ? <div className="ap-hint">{f.hint}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Repeating entries (incomes, assets, …) with add / remove. */
function ListEditor({ step, entries, onChange, showErrors, none, onNone, readOnly }) {
  const add = () => {
    const e = { id: Date.now() };
    for (const f of step.entryFields) if (f.defaultValue !== undefined) e[f.key] = f.defaultValue;
    onChange([...entries, e]);
  };
  const upd = (i, k, v) => onChange(entries.map((e, j) => j === i ? { ...e, [k]: v } : e));
  const del = i => onChange(entries.filter((_, j) => j !== i));
  return (
    <>
      {entries.map((e, i) => (
        <div key={e.id ?? i} className="ap-entry">
          <div className="ap-entry-hdr"><span>{step.entryName} {entries.length > 1 ? i + 1 : ''}</span>
            {!readOnly && <button className="ap-btn" style={{ padding: '6px 12px', fontSize: 13, color: '#b91c1c' }} onClick={() => del(i)}>Remove</button>}</div>
          <FieldsGrid fields={step.entryFields} obj={e} ctx={e} onChange={(k, v) => upd(i, k, v)} showErrors={showErrors} readOnly={readOnly} />
        </div>
      ))}
      {!readOnly && <button className="ap-add" onClick={add}>+ Add {entries.length ? 'another' : 'a'} {step.entryName}</button>}
      {step.noneLabel && entries.length === 0 && !readOnly && (
        <label className={`ap-chip${none ? ' on' : ''}`} style={{ marginTop: 14, width: '100%' }}><input type="checkbox" checked={!!none} onChange={e => onNone(e.target.checked)} /> {step.noneLabel}</label>
      )}
    </>
  );
}

function DeclarationsEditor({ data, onChange, showErrors, readOnly }) {
  const qs = DECLARATIONS.filter(q => !q.showIf || q.showIf(data));
  return (
    <div>
      {qs.map(q => {
        const v = data[q.id];
        const bad = showErrors && v !== 'yes' && v !== 'no';
        return (
          <div key={q.id} className="ap-yn">
            <div className="ap-yn-q"><strong>{q.id}.</strong>{q.q}{bad && <div className="ap-err">Please answer</div>}</div>
            <div className="ap-radio-group">
              {['yes', 'no'].map(opt => <label key={opt} className={`ap-chip${v === opt ? ' on' : ''}`}><input type="radio" checked={v === opt} disabled={readOnly} onChange={() => onChange({ ...data, [q.id]: opt })} /> {opt === 'yes' ? 'Yes' : 'No'}</label>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DemographicsEditor({ data, onChange, readOnly }) {
  const d = data || {};
  const set = patch => onChange({ ...d, collectionMethod: 'Email or Internet', ...patch });
  const toggle = (k, v) => { const cur = Array.isArray(d[k]) ? d[k] : []; set({ [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }); };
  const has = (k, v) => Array.isArray(d[k]) && d[k].includes(v);
  const Chip = ({ on, onClick, children, type = 'checkbox' }) => <label className={`ap-chip${on ? ' on' : ''}`}><input type={type} checked={!!on} disabled={readOnly} onChange={onClick} /> {children}</label>;
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div>
        <div className="form-label" style={{ marginBottom: 8 }}>Ethnicity</div>
        <div className="ap-radio-group">
          <Chip type="radio" on={d.hispanic === true && !d.ethnicityRefused} onClick={() => set({ hispanic: true, ethnicityRefused: false })}>Hispanic or Latino</Chip>
          <Chip type="radio" on={d.hispanic === false && !d.ethnicityRefused} onClick={() => set({ hispanic: false, ethnicities: [], ethnicityRefused: false })}>Not Hispanic or Latino</Chip>
          <Chip type="radio" on={!!d.ethnicityRefused} onClick={() => set({ hispanic: undefined, ethnicities: [], ethnicityRefused: true })}>I do not wish to provide</Chip>
        </div>
        {d.hispanic === true && !d.ethnicityRefused && <div className="ap-radio-group" style={{ marginTop: 10, paddingLeft: 8 }}>
          {DEMOGRAPHICS.ethnicityDetail.map(e => <Chip key={e} on={has('ethnicities', e)} onClick={() => toggle('ethnicities', e)}>{e}</Chip>)}
        </div>}
      </div>
      <div>
        <div className="form-label" style={{ marginBottom: 8 }}>Sex</div>
        <div className="ap-radio-group">
          {['Female', 'Male'].map(s => <Chip key={s} type="radio" on={d.sex === s && !d.sexRefused} onClick={() => set({ sex: s, sexRefused: false })}>{s}</Chip>)}
          <Chip type="radio" on={!!d.sexRefused} onClick={() => set({ sex: '', sexRefused: true })}>I do not wish to provide</Chip>
        </div>
      </div>
      <div>
        <div className="form-label" style={{ marginBottom: 8 }}>Race (select all that apply)</div>
        <div className="ap-radio-group">
          {DEMOGRAPHICS.races.map(r => <Chip key={r} on={has('races', r) && !d.raceRefused} onClick={() => set({ raceRefused: false, races: has('races', r) ? d.races.filter(x => x !== r) : [...(d.races || []), r] })}>{DEMOGRAPHICS.raceLabels[r]}</Chip>)}
          <Chip on={!!d.raceRefused} onClick={() => set({ races: [], raceRefused: !d.raceRefused })}>I do not wish to provide</Chip>
        </div>
        {has('races', 'Asian') && !d.raceRefused && <div className="ap-radio-group" style={{ marginTop: 10, paddingLeft: 8 }}>
          {DEMOGRAPHICS.asianDetail.map(e => <Chip key={e} on={has('races', e)} onClick={() => toggle('races', e)}>{e}</Chip>)}</div>}
        {has('races', 'PacificIslander') && !d.raceRefused && <div className="ap-radio-group" style={{ marginTop: 10, paddingLeft: 8 }}>
          {DEMOGRAPHICS.pacificDetail.map(e => <Chip key={e} on={has('races', e)} onClick={() => toggle('races', e)}>{e}</Chip>)}</div>}
      </div>
    </div>
  );
}

// ── the application ─────────────────────────────────────────────────────
export default function Application({ loanId, user, onExit, showToast }) {
  const [form, setForm] = useState(null);           // { loan, me, borrower, shared, lists, declarations, demographics, flags, others, ... }
  const [loadErr, setLoadErr] = useState('');
  const [stepIdx, setStepIdx] = useState(0);
  const [showErrors, setShowErrors] = useState({});   // stepId → true once the user tried to move past it
  const [saveState, setSaveState] = useState('idle'); // idle | dirty | saving | saved | error
  const [sheet, setSheet] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const dirty = useRef(new Set());
  const timer = useRef(null);
  const formRef = useRef(null);
  const stepRef = useRef(0);
  formRef.current = form;
  stepRef.current = stepIdx;

  const steps = useMemo(() => {
    if (!form) return STEPS;
    // Co-borrowers see the loan step read-only; everyone sees the rest.
    return STEPS;
  }, [form]);
  const step = steps[stepIdx];
  const isPrimary = form?.me?.slot === 1;
  const locked = !!form?.locked;

  // ── load ──
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/apply/${loanId}/form`).then(d => {
      if (!alive) return;
      const flags = { ...(d.progress?.flags || {}) };
      if (!flags._hasProperty) flags._hasProperty = d.shared?.sp_addr1 ? 'yes' : (d.shared?.purpose === 'Refinance' ? 'yes' : '');
      const borrower = { ...d.borrower };
      if (borrower.mailing_same_as_present === '' || borrower.mailing_same_as_present == null) borrower.mailing_same_as_present = 1;
      if (!borrower.email) borrower.email = d.me?.email || '';
      const shared = { ...d.shared };
      if (!shared.purpose) shared.purpose = d.loan?.purpose || 'Purchase Home';
      if (shared.num_units === '' || shared.num_units == null) shared.num_units = '1';
      setForm({ ...d, borrower, shared, flags });
      // resume where they left off
      const i = STEPS.findIndex(s => s.id === d.lastSeenStep);
      if (i > 0) setStepIdx(i);
    }).catch(e => { if (alive) setLoadErr(e.message || 'Could not load'); });
    return () => { alive = false; };
  }, [loanId]);

  // ── save ──
  const buildPayload = useCallback((parts, f, extra = {}) => {
    const p = { ...extra };
    const lists = {};
    for (const part of parts) {
      if (part === 'borrower') p.borrower = f.borrower;
      else if (part === 'shared') p.shared = f.shared;
      else if (part === 'declarations') p.declarations = f.declarations;
      else if (part === 'demographics') p.demographics = f.demographics;
      else if (f.lists && part in f.lists) lists[part] = f.lists[part];
    }
    if (Object.keys(lists).length) p.lists = lists;
    // progress rides along with every save
    const stepsProg = {};
    for (const s of STEPS) { const st = stepStatus(s, f); if (st !== 'todo' && s.scope !== 'review') stepsProg[s.id] = st; }
    p.progress = { steps: stepsProg, flags: f.flags || {} };
    p.lastSeenStep = STEPS[Math.min(stepRef.current, STEPS.length - 1)].id;
    return p;
  }, []);

  const save = useCallback(async (opts = {}) => {
    const f = formRef.current;
    if (!f || locked) return true;
    const parts = [...dirty.current];
    if (parts.length === 0 && !opts.force) return true;
    dirty.current.clear();
    setSaveState('saving');
    try {
      await apiFetch(`/api/apply/${loanId}/form`, { method: 'PUT', body: buildPayload(parts, f, opts.extra) });
      setSaveState(dirty.current.size ? 'dirty' : 'saved');
      return true;
    } catch (e) {
      parts.forEach(x => dirty.current.add(x));
      setSaveState('error');
      if (e.status === 409) showToast && showToast('⚠ ' + e.message);
      else if (e.status === 401) { /* handled globally */ }
      else timer.current = setTimeout(() => save(), 5000);
      return false;
    }
  }, [loanId, buildPayload, locked, showToast]);

  const markDirty = useCallback(part => {
    dirty.current.add(part);
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), 1200);
  }, [save]);

  // flush on leave (tab close, app switch on a phone)
  useEffect(() => {
    const flush = () => {
      const f = formRef.current;
      if (!f || dirty.current.size === 0) return;
      try {
        fetch(`${API_URL}/api/apply/${loanId}/form`, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload([...dirty.current], f)) });
        dirty.current.clear();
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis); clearTimeout(timer.current); };
  }, [loanId, buildPayload]);

  // ── edit helpers ──
  const setBorrower = (k, v) => { setForm(f => ({ ...f, borrower: { ...f.borrower, [k]: v } })); markDirty('borrower'); };
  const setShared   = (k, v) => { setForm(f => ({ ...f, shared: { ...f.shared, [k]: v } })); markDirty('shared'); };
  const setList     = (name, entries) => { setForm(f => ({ ...f, lists: { ...f.lists, [name]: entries } })); markDirty(name); };
  const setDecl     = d => { setForm(f => ({ ...f, declarations: d })); markDirty('declarations'); };
  const setDemo     = d => { setForm(f => ({ ...f, demographics: d })); markDirty('demographics'); };
  const setFlag     = (k, v) => { setForm(f => ({ ...f, flags: { ...f.flags, [k]: v } })); markDirty('progress'); };

  const goTo = async i => {
    const next = Math.max(0, Math.min(steps.length - 1, i));
    if (next === stepIdx) return;
    setShowErrors(s => ({ ...s, [step.id]: true }));
    stepRef.current = next;           // so the save below records the step we are going TO
    setStepIdx(next);
    setSheet(false);
    window.scrollTo({ top: 0 });
    clearTimeout(timer.current);
    dirty.current.add('progress');
    save();
  };

  const finish = async () => {
    setFinishing(true);
    const ok = await save({ force: true, extra: { completed: true } });
    if (ok) { setForm(f => ({ ...f, completedAt: new Date().toISOString() })); showToast && showToast('✓ Your loan officer can see your application is complete'); }
    setFinishing(false);
  };

  if (loadErr) return <div className="ap-wrap"><div className="ap-card"><div className="ap-banner">{loadErr}</div><button className="ap-btn" onClick={onExit}>← Back</button></div></div>;
  if (!form) return <div className="ap-wrap"><div className="ap-card" style={{ textAlign: 'center', color: '#6b7280' }}>Loading your application…</div></div>;

  const statuses = steps.map(s => stepStatus(s, form));
  const doneCount = statuses.filter(s => s === 'done').length;
  const total = steps.length - 1; // review doesn't count
  const ctxShared = { ...form, _hasProperty: form.flags._hasProperty };
  const primaryName = form.others?.find(o => o.slot === 1)?.name || 'the primary borrower';

  const saveLabel = { idle: '', dirty: 'Unsaved changes', saving: 'Saving…', saved: 'All changes saved', error: 'Could not save — retrying' }[saveState];

  const body = (() => {
    switch (step.scope) {
      case 'shared':
        return <>
          {!isPrimary && <div className="ap-banner info">These loan and property details are entered by <strong>{primaryName}</strong>. You can read them here; ask {primaryName.split(' ')[0]} or your loan officer to change them.</div>}
          <FieldsGrid fields={step.fields} obj={{ ...form.shared, _hasProperty: form.flags._hasProperty }} ctx={ctxShared} showErrors={showErrors[step.id]} readOnly={!isPrimary || locked}
            onChange={(k, v) => k === '_hasProperty' ? setFlag('_hasProperty', v) : setShared(k, v)} />
        </>;
      case 'borrower':
        return <>
          <FieldsGrid fields={step.fields} obj={form.borrower} ctx={form} onChange={setBorrower} showErrors={showErrors[step.id]} readOnly={locked} />
          {step.id === 'addresses' && <PrevAddresses form={form} onChange={v => setBorrower('prev_addresses_json', v)} showErrors={showErrors[step.id]} readOnly={locked} />}
        </>;
      case 'list':
        return <ListEditor step={step} entries={form.lists[step.list] || []} onChange={v => setList(step.list, v)} showErrors={showErrors[step.id]}
          none={form.flags[`none_${step.list}`]} onNone={v => setFlag(`none_${step.list}`, v)} readOnly={locked} />;
      case 'declarations':
        return <DeclarationsEditor data={form.declarations || {}} onChange={setDecl} showErrors={showErrors[step.id]} readOnly={locked} />;
      case 'demographics':
        return <DemographicsEditor data={form.demographics || {}} onChange={setDemo} readOnly={locked} />;
      case 'review':
        return <Review steps={steps} statuses={statuses} form={form} isPrimary={isPrimary} onEdit={i => goTo(i)} onFinish={finish} finishing={finishing} locked={locked} />;
      default: return null;
    }
  })();

  const NavList = ({ compact }) => steps.map((s, i) => (
    <button key={s.id} className={`ap-nav-item${i === stepIdx ? ' active' : ''}`} onClick={() => goTo(i)}>
      <span className={`ap-dot ${statuses[i] === 'done' ? 'done' : statuses[i] === 'started' ? 'started' : ''}${i === stepIdx && statuses[i] !== 'done' ? ' active' : ''}`}>{statuses[i] === 'done' ? '✓' : i + 1}</span>
      <span style={{ flex: 1 }}>{compact ? s.short : s.title}</span>
      {!isPrimary && s.scope === 'shared' && <span style={{ fontSize: 10, color: '#9ca3af' }}>view</span>}
    </button>
  ));

  return (
    <div className="ap-wrap">
      <style>{CSS}</style>

      <div className="ap-mobile-top">
        <div className="ap-progress"><div style={{ width: `${Math.round((doneCount / total) * 100)}%` }} /></div>
        <div className="ap-mobile-top-row">
          <button className="ap-nav-item" style={{ width: 'auto', padding: '4px 8px', fontWeight: 600, color: '#2563EB' }} onClick={() => setSheet(true)}>☰ Step {stepIdx + 1} of {steps.length}</button>
          <span className={`ap-save${saveState === 'error' ? ' error' : ''}`}>{saveLabel}</span>
        </div>
      </div>

      <div className="ap-layout">
        <aside className="ap-nav">
          <div style={{ padding: '6px 10px 10px', fontSize: 12, color: '#6b7280' }}>{doneCount} of {total} sections complete</div>
          <NavList />
          {form.others?.length > 0 && <div style={{ borderTop: '1px solid #f0efeb', marginTop: 8, padding: '10px 10px 4px', fontSize: 12, color: '#6b7280' }}>
            {form.others.map(o => <div key={o.slot} style={{ marginBottom: 4 }}>{o.role === 'primary' ? 'Primary borrower' : 'Co-borrower'} <strong>{o.name}</strong>: {o.completedAt ? 'finished' : `${Object.values(o.progress?.steps || {}).filter(x => x === 'done').length} of ${total} done`}</div>)}
          </div>}
          <div style={{ borderTop: '1px solid #f0efeb', marginTop: 8, padding: '10px 10px 4px' }}><span className={`ap-save${saveState === 'error' ? ' error' : ''}`}>{saveLabel || ' '}</span></div>
        </aside>

        <main className="ap-card">
          {locked && <div className="ap-banner ok">This application was submitted{form.loan?.submittedAt ? ` on ${new Date(form.loan.submittedAt).toLocaleDateString()}` : ''}. It can no longer be edited here — contact your loan officer for any changes.</div>}
          {form.completedAt && !locked && step.scope !== 'review' && <div className="ap-banner ok">You marked your part complete. You can still make changes — they save automatically.</div>}
          <h1 className="ap-title">{step.title}</h1>
          {step.intro && <p className="ap-intro">{step.intro}</p>}
          {body}
          <div className="ap-footer">
            <button className="ap-btn" onClick={() => stepIdx === 0 ? onExit() : goTo(stepIdx - 1)}>{stepIdx === 0 ? '← Home' : '← Back'}</button>
            <span className={`ap-save${saveState === 'error' ? ' error' : ''}`}>{saveLabel}</span>
            {stepIdx < steps.length - 1 ? <button className="ap-btn primary" onClick={() => goTo(stepIdx + 1)}>Next: {steps[stepIdx + 1].short} →</button> : <button className="ap-btn" onClick={onExit}>Home</button>}
          </div>
        </main>
      </div>

      <div className="ap-mobile-bar">
        <button className="ap-btn" onClick={() => stepIdx === 0 ? onExit() : goTo(stepIdx - 1)}>{stepIdx === 0 ? 'Home' : '← Back'}</button>
        {stepIdx < steps.length - 1 ? <button className="ap-btn primary" onClick={() => goTo(stepIdx + 1)}>Next →</button> : <button className="ap-btn primary" onClick={onExit}>Home</button>}
      </div>

      {sheet && <div className="ap-sheet" onClick={() => setSheet(false)}><div className="ap-sheet-body" onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 12, color: '#6b7280', padding: '0 10px 8px' }}>{doneCount} of {total} sections complete</div>
        <NavList compact />
      </div></div>}
    </div>
  );
}

function PrevAddresses({ form, onChange, showErrors, readOnly }) {
  const yrs = Number(form.borrower?.current_how_long_addr);
  const prev = form.borrower?.prev_addresses_json || [];
  const covered = (Number.isFinite(yrs) ? yrs : 0) + prev.reduce((a, p) => a + (Number(p.years) || 0), 0);
  const needs = form.borrower?.current_how_long_addr !== '' && Number.isFinite(yrs) && yrs < 2;
  if (!needs && prev.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="form-label" style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Previous address{prev.length > 1 ? 'es' : ''}</div>
      {needs && covered < 2 && <div className="ap-banner">You have been at your current address for less than two years, so we need where you lived before.</div>}
      {prev.map((p, i) => (
        <div key={i} className="ap-entry">
          <div className="ap-entry-hdr"><span>Previous address {prev.length > 1 ? i + 1 : ''}</span>
            {!readOnly && <button className="ap-btn" style={{ padding: '6px 12px', fontSize: 13, color: '#b91c1c' }} onClick={() => onChange(prev.filter((_, j) => j !== i))}>Remove</button>}</div>
          <FieldsGrid fields={PREV_ADDRESS_FIELDS} obj={p} ctx={p} showErrors={showErrors} readOnly={readOnly}
            onChange={(k, v) => onChange(prev.map((a, j) => j === i ? { ...a, [k]: v } : a))} />
        </div>
      ))}
      {!readOnly && <button className="ap-add" onClick={() => onChange([...prev, { addr1: '', unit: '', city: '', state: '', zip: '', country: 'United States', years: '', own: '' }])}>+ Add {prev.length ? 'another' : 'a'} previous address</button>}
    </div>
  );
}

function Review({ steps, statuses, form, isPrimary, onEdit, onFinish, finishing, locked }) {
  const rows = steps.filter(s => s.scope !== 'review');
  const allDone = rows.every((s, i) => statuses[steps.indexOf(s)] === 'done' || (!isPrimary && s.scope === 'shared'));
  return (
    <div>
      {rows.map(s => {
        const i = steps.indexOf(s);
        const st = statuses[i];
        const missing = stepMissing(s, form);
        const viewOnly = !isPrimary && s.scope === 'shared';
        return (
          <div key={s.id} className="ap-review-row">
            <span className={`ap-dot ${st === 'done' ? 'done' : st === 'started' ? 'started' : ''}`}>{st === 'done' ? '✓' : ''}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}{viewOnly && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>entered by the primary borrower</span>}</div>
              {!viewOnly && missing.length > 0 && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Still needed: {missing.slice(0, 4).join(' · ')}{missing.length > 4 ? ` · +${missing.length - 4} more` : ''}</div>}
              {!viewOnly && st === 'done' && <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>Complete</div>}
            </div>
            <button className="ap-btn" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => onEdit(i)}>{viewOnly ? 'View' : 'Edit'}</button>
          </div>
        );
      })}
      {!locked && (
        <div style={{ marginTop: 24, padding: 18, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          {form.completedAt ? (
            <div style={{ fontSize: 14, color: '#065f46' }}>✓ You marked your part complete on {new Date(form.completedAt).toLocaleDateString()}. Your loan officer will review it and reach out about next steps — including authorizing your credit report, which comes next.</div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: '#374151', marginBottom: 12 }}>{allDone ? 'Everything is filled in. Let your loan officer know you are done.' : 'Finish the sections above, then let your loan officer know you are done. You can still mark it complete now and come back for the rest.'}</div>
              <button className="ap-btn primary" onClick={onFinish} disabled={finishing}>{finishing ? 'Saving…' : "I'm done with my part"}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
