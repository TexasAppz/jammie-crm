import { useState } from 'react';
import { LENDER_MATRIX } from '../data/db';
import { fmt$ } from '../components/shared';

export default function PricingPage() {
  const [loanAmount,  setLoanAmount]  = useState(350000);
  const [downPct,     setDownPct]     = useState(5);
  const [loanType,    setLoanType]    = useState('Conventional');
  const [termYears,   setTermYears]   = useState(30);
  const [creditScore, setCreditScore] = useState(720);
  const [aiRec,       setAiRec]       = useState('');
  const [aiLoading,   setAiLoading]   = useState(false);

  const rates    = LENDER_MATRIX[loanType] || LENDER_MATRIX.Conventional;
  const bestRate = rates.reduce((a, b) => a.rate < b.rate ? a : b);
  const principal    = loanAmount * (1 - downPct / 100);
  const monthlyRate  = bestRate.rate / 100 / 12;
  const n            = termYears * 12;
  const rawPayment   = principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  const piPayment    = isNaN(rawPayment) ? 0 : rawPayment;
  const miMonthly    = loanType === 'FHA'
    ? principal * 0.0055 / 12
    : (downPct < 20 && loanType === 'Conventional') ? principal * 0.0065 / 12 : 0;
  const total = piPayment + miMonthly;

  const getAiRec = async () => {
    setAiLoading(true);
    setAiRec('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `As a mortgage pricing expert, provide a concise rate/lock recommendation:
Loan Type: ${loanType}
Loan Amount: ${fmt$(loanAmount)}
Down Payment: ${downPct}%
Credit Score: ${creditScore}
Best Available Rate: ${bestRate.rate}% from ${bestRate.lender}
Date: May 25, 2026
Provide: (1) Lock/float recommendation with brief reasoning, (2) Product alternatives, (3) One pricing tip. Under 150 words, MLO-professional tone.`,
          }],
        }),
      });
      const data = await res.json();
      setAiRec(data.content?.[0]?.text || 'Could not generate recommendation.');
    } catch {
      setAiRec('Error fetching AI recommendation.');
    }
    setAiLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Pricing & Rate Calculator</span>
      </div>

      <div className="pricing-grid">
        {/* LEFT: inputs */}
        <div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 16 }}>
            <div className="form-section-title" style={{ marginBottom: 14 }}><span className="form-section-num">1</span>Loan Parameters</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Loan Type</label>
                <select className="form-select" value={loanType} onChange={e => setLoanType(e.target.value)}>
                  {['Conventional','FHA','NON-QM','VA'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <Slider label={`Loan Amount: ${fmt$(loanAmount)}`} min={100000} max={2000000} step={5000}
                value={loanAmount} onChange={setLoanAmount} minLabel="$100K" maxLabel="$2M" />
              <Slider label={`Down Payment: ${downPct}%`} min={loanType === 'VA' ? 0 : 3} max={50} step={1}
                value={downPct} onChange={setDownPct} minLabel={`${loanType === 'VA' ? 0 : 3}%`} maxLabel="50%" />
              <div className="form-group">
                <label className="form-label">Loan Term</label>
                <select className="form-select" value={termYears} onChange={e => setTermYears(Number(e.target.value))}>
                  <option value={30}>30 Year</option><option value={20}>20 Year</option>
                  <option value={15}>15 Year</option><option value={10}>10 Year</option>
                </select>
              </div>
              <Slider label={`Credit Score: ${creditScore}`} min={580} max={850} step={10}
                value={creditScore} onChange={setCreditScore} minLabel="580" maxLabel="850" />
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={getAiRec}>
            ✨ Get AI Rate Recommendation
          </button>

          {(aiLoading || aiRec) && (
            <div style={{ marginTop: 12, background: '#0f172a', border: '1px solid #1e2d45', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✨ Jammie AI Recommendation</div>
              {aiLoading
                ? <div className="ai-loading"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
                : <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiRec}</div>}
            </div>
          )}
        </div>

        {/* RIGHT: results */}
        <div>
          <div className="payment-result">
            <div className="payment-label">Est. Monthly Payment (P&I{miMonthly > 0 ? ' + MI' : ''})</div>
            <div className="payment-amount">${Math.round(total).toLocaleString()}<span style={{ fontSize: 18, fontWeight: 400, color: '#94a3b8' }}>/mo</span></div>
            <div className="payment-breakdown">
              <div className="breakdown-item"><div className="breakdown-value">${Math.round(piPayment).toLocaleString()}</div><div className="breakdown-label">P&I</div></div>
              <div className="breakdown-item"><div className="breakdown-value">{miMonthly > 0 ? '$' + Math.round(miMonthly).toLocaleString() : '--'}</div><div className="breakdown-label">MI/MIP</div></div>
              <div className="breakdown-item"><div className="breakdown-value">{fmt$(Math.round(principal))}</div><div className="breakdown-label">Loan Amt</div></div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Lender Pricing Matrix — {loanType}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--cream)', borderBottom: '1px solid var(--border)' }}>
                    {['Lender','Rate','Points','APR'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Lender' ? 'left' : 'right', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', background: r.lender === bestRate.lender ? 'var(--accent-light)' : '' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.lender}</div>
                        {r.lender === bestRate.lender && <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>★ Best Rate</div>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 16, fontWeight: 700, color: r.lender === bestRate.lender ? 'var(--accent)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{r.rate.toFixed(3)}%</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>{r.pts > 0 ? `${r.pts} pts` : 'No pts'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{r.apr.toFixed(3)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: 'var(--cream)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <strong>Key Metrics:</strong> LTV {(100 - downPct).toFixed(1)}% ·{' '}
            {loanType === 'FHA' ? 'MIP Required' : downPct >= 20 ? 'No PMI Required' : 'PMI Required'} ·{' '}
            Credit {creditScore} · {termYears}-Year Term
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, minLabel, maxLabel }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)' }}>
        <span>{minLabel}</span><span>{maxLabel}</span>
      </div>
    </div>
  );
}
