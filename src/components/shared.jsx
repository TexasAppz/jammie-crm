import { useEffect } from 'react';

export const fmt$ = v => v == null ? '--' : '$' + Number(v).toLocaleString();
export const fmtRate = v => v == null ? '--' : Number(v).toFixed(3) + '%';

export function StatusBadge({ status }) {
  const map = {
    "New":"new","Contacted":"contacted","Qualified":"qualified","In Progress":"qualified",
    "App Intake":"app-intake","Loan Setup":"loan-setup","Pre-Approved":"pre-approved",
    "Processing":"processing","Closing":"closing","Funded":"funded",
    "Closed Won":"funded","Closed Lost":"default",
  };
  const cls = map[status] || "default";
  return (
    <span className={`badge badge-${cls}`}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}

export function ScoreBadge({ score }) {
  const cls   = score >= 80 ? "score-hot"  : score >= 60 ? "score-warm"  : "score-cold";
  const label = score >= 80 ? "🔥 Hot"     : score >= 60 ? "⚡ Warm"     : "❄️ Cold";
  return <span className={`score-badge ${cls}`}>{label} {score}</span>;
}

export function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className="toast">{msg}</div>;
}

export function ConfirmModal({ msg, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Confirm</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{msg}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
