import { useState } from 'react';
import { StatusBadge, fmt$ } from '../components/shared';

const STATUSES  = ['App Intake','Loan Setup','Pre-Approved','Processing','Closing','Funded'];
const PRODUCTS  = ['FHA 30 Year Fixed','CONF CONV 30 Year','NON-QM Fixed 30','VA 30 Year Fixed','TBD'];

export default function ReportsPage({ loans, leads }) {
  const [aiReport, setAiReport]   = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const totalVolume  = loans.reduce((a, l) => a + (l.loan_amount || 0), 0);
  const avgLoanSize  = loans.length ? totalVolume / loans.length : 0;
  const fundedLoans  = loans.filter(l => l.loan_status === 'Funded');
  const avgScore     = leads.length ? (leads.reduce((a, l) => a + (l.score || 0), 0) / leads.length).toFixed(0) : 0;
  const byStatus     = STATUSES.map(s => ({ status: s, count: loans.filter(l => l.loan_status === s).length, volume: loans.filter(l => l.loan_status === s).reduce((a, l) => a + (l.loan_amount || 0), 0) }));
  const byProduct    = PRODUCTS.map(p => ({ product: p, count: loans.filter(l => l.product === p).length })).filter(p => p.count > 0);

  const generateReport = async () => {
    setAiLoading(true);
    setAiReport('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Generate a concise monthly pipeline performance report for an MLO:
Total Pipeline Volume: ${fmt$(totalVolume)}
Active Loans: ${loans.filter(l => l.loan_status !== 'Funded').length}
Funded Loans: ${fundedLoans.length} (${fmt$(fundedLoans.reduce((a, l) => a + (l.loan_amount || 0), 0))})
Avg Loan Size: ${fmt$(Math.round(avgLoanSize))}
Total Leads: ${leads.length}
Avg Lead Score: ${avgScore}
By Status: ${byStatus.filter(s => s.count > 0).map(s => `${s.status}:${s.count}`).join(', ')}
By Product: ${byProduct.map(p => `${p.product}:${p.count}`).join(', ')}
Date: May 25, 2026
Write a 3-paragraph executive summary: key wins, areas needing attention, and 2 specific action items. Concise and actionable.`,
          }],
        }),
      });
      const data = await res.json();
      setAiReport(data.content?.[0]?.text || 'Could not generate report.');
    } catch {
      setAiReport('Error generating report.');
    }
    setAiLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Reports</span>
        <button className="btn btn-primary" onClick={generateReport}>✨ Generate AI Summary</button>
      </div>

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Pipeline Volume', value: fmt$(totalVolume),             trend: '+12%', up: true  },
          { label: 'Active Loans',          value: loans.filter(l => l.loan_status !== 'Funded').length, trend: '+2',   up: true  },
          { label: 'Avg Loan Size',         value: fmt$(Math.round(avgLoanSize)), trend: '-3%',  up: false },
          { label: 'Avg Lead Score',        value: avgScore,                      trend: '+5 pts', up: true },
        ].map((s, i) => (
          <div key={i} className="report-stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className={`stat-trend ${s.up ? 'trend-up' : 'trend-down'}`}>{s.up ? '↑' : '↓'} {s.trend} vs last month</div>
          </div>
        ))}
      </div>

      {/* CHARTS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">Loans by Status</div>
          <div className="card-body" style={{ padding: '0 18px' }}>
            {byStatus.filter(s => s.count > 0).map(s => (
              <div key={s.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
                <StatusBadge status={s.status} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.count} loan{s.count !== 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmt$(s.volume)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Loans by Product</div>
          <div className="card-body" style={{ padding: '0 18px' }}>
            {byProduct.map(p => (
              <div key={p.product} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{p.product}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 6, background: 'var(--accent)', borderRadius: 3, width: `${p.count * 20}px`, minWidth: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 13, minWidth: 16, textAlign: 'right' }}>{p.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI REPORT */}
      {(aiLoading || aiReport) && (
        <div style={{ background: '#0f172a', border: '1px solid #1e2d45', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ✨ Jammie AI — Pipeline Report · May 2026
          </div>
          {aiLoading
            ? <div className="ai-loading"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
            : <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{aiReport}</div>}
        </div>
      )}
    </div>
  );
}
