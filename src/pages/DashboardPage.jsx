import { useMemo } from 'react';
import { fmt$ } from '../components/shared';
import { ScoreBadge } from '../components/shared';

const SEG_COLORS = ['#3b82f6','#a855f7','#22c55e','#f97316','#eab308','#10b981'];
const STAGES = ['App Intake','Loan Setup','Pre-Approved','Processing','Closing','Funded'];
const MONTHLY = [
  { month:'Dec', vol:420 },{ month:'Jan', vol:680 },{ month:'Feb', vol:510 },
  { month:'Mar', vol:890 },{ month:'Apr', vol:1240 },{ month:'May', vol:520 },
];
const ACTIVITY = [
  { icon:'📋', bg:'#eff6ff', text:'Julio Tello moved to App Intake',            time:'2 hours ago' },
  { icon:'✅', bg:'#f0fdf4', text:'Robert Kim loan funded — $520,000',          time:'10 days ago' },
  { icon:'👤', bg:'#fdf4ff', text:'New lead: Gina Gutierrez Posada — $510K',   time:'1 month ago' },
  { icon:'🔒', bg:'#fefce8', text:'Cristian Torres rate locked at 7.000%',      time:'1 month ago' },
  { icon:'📄', bg:'#fff7ed', text:'Maria Santos closing disclosure reviewed',    time:'2 days ago'  },
];
const RATES = [
  { product:'30-Yr Conventional', rate:'6.875%', chg:'+0.02' },
  { product:'30-Yr FHA',          rate:'7.125%', chg:'-0.01' },
  { product:'30-Yr VA',           rate:'6.625%', chg:'0.00'  },
  { product:'15-Yr Conventional', rate:'6.250%', chg:'+0.03' },
  { product:'NON-QM 30 Fixed',    rate:'7.750%', chg:'+0.05' },
  { product:'ARM 5/1',            rate:'6.125%', chg:'-0.02' },
];

export default function DashboardPage({ loans, leads, tasks }) {
  const pipeline = useMemo(() =>
    STAGES.map(s => ({
      stage: s,
      count:  loans.filter(l => l.loan_status === s).length,
      volume: loans.filter(l => l.loan_status === s).reduce((a, l) => a + (l.loan_amount || 0), 0),
    })), [loans]);

  const totalVolume  = loans.reduce((a, l) => a + (l.loan_amount || 0), 0);
  const fundedVolume = loans.filter(l => l.loan_status === 'Funded').reduce((a, l) => a + (l.loan_amount || 0), 0);
  const overdue      = tasks.filter(t => !t.done && t.due <= '2026-05-25');
  const today        = tasks.filter(t => !t.done && t.due === '2026-05-25');
  const totalCount   = pipeline.reduce((a, s) => a + s.count, 0) || 1;
  const maxVol       = Math.max(...MONTHLY.map(d => d.vol));

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Dashboard</span>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Monday, May 25, 2026</div>
      </div>

      {/* KPI CARDS */}
      <div className="dash-grid">
        {[
          { label:'Active Loans',          value: loans.filter(l => l.loan_status !== 'Funded').length, sub:'Pipeline loans in progress' },
          { label:'Total Pipeline Volume',  value: fmt$(totalVolume),  sub:`${loans.length} loans total`, small:true },
          { label:'Funded This Month',      value: fmt$(fundedVolume), sub:'↑ 1 loan closed', accent:true, small:true },
          { label:'Tasks Due Today',        value: today.length + overdue.length, sub:`${overdue.length} overdue`, red: overdue.length > 0 },
        ].map((k, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: k.small ? 20 : undefined, color: k.red ? '#b91c1c' : undefined }}>{k.value}</div>
            <div className={`kpi-sub${k.accent ? ' kpi-accent' : ''}`}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* PIPELINE + RATES */}
      <div className="dash-row">
        <div className="card">
          <div className="card-header">
            <span>Loan Pipeline</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{loans.filter(l => l.loan_status !== 'Funded').length} active</span>
          </div>
          <div className="card-body">
            <div className="pipeline-bar">
              {pipeline.map((s, i) => s.count > 0 && (
                <div key={s.stage} style={{ flex: s.count / totalCount, background: SEG_COLORS[i], height: '100%' }} title={`${s.stage}: ${s.count}`} />
              ))}
            </div>
            <div className="pipeline-legend">
              {pipeline.map((s, i) => (
                <div key={s.stage} className="legend-item">
                  <div className="legend-dot" style={{ background: SEG_COLORS[i] }} />
                  <span>{s.stage}</span>
                  <strong style={{ color: 'var(--text)' }}>{s.count}</strong>
                  <span style={{ color: 'var(--text-3)' }}>· {fmt$(s.volume)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Funded Volume ($K)</div>
              <div className="bar-chart">
                {MONTHLY.map(d => (
                  <div key={d.month} className="bar-col">
                    <div className="bar" style={{ height: `${(d.vol / maxVol) * 80}px`, opacity: d.month === 'May' ? 0.5 : 1 }} />
                    <div className="bar-label">{d.month}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span>Rate Snapshot</span><span style={{ fontSize: 11, color: 'var(--text-3)' }}>May 25, 2026</span></div>
          <div className="card-body" style={{ padding: '8px 18px' }}>
            {RATES.map(r => (
              <div key={r.product} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.product}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{r.rate}</div>
                  <div style={{ fontSize: 10, color: r.chg.startsWith('-') ? '#15803d' : r.chg === '0.00' ? 'var(--text-3)' : '#b91c1c' }}>{r.chg}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ACTIVITY + HOT LEADS */}
      <div className="dash-row">
        <div className="card">
          <div className="card-header"><span>Recent Activity</span></div>
          <div className="card-body" style={{ padding: '0 18px' }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} className="activity-item">
                <div className="activity-icon" style={{ background: a.bg }}>{a.icon}</div>
                <div>
                  <div className="activity-text">{a.text}</div>
                  <div className="activity-time">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span>Hot Leads</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{leads.filter(l => l.score >= 75).length} high score</span>
          </div>
          <div className="card-body" style={{ padding: '0 18px' }}>
            {[...leads].sort((a, b) => b.score - a.score).slice(0, 4).map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.purpose} · {fmt$(l.loan_amount)}</div>
                </div>
                <ScoreBadge score={l.score} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
