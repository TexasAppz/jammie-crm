import { useState, useEffect, useRef } from 'react';

export default function AISidebar({ open, onClose, context }) {
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Hi! I'm Jammie, your AI mortgage assistant. I can help with loan questions, draft follow-up emails, suggest conditions checklists, and analyze rate pricing. What do you need?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(p => [...p, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const systemPrompt = `You are Jammie, an expert AI assistant for a Mortgage Loan Originator (MLO). You help with:
- Loan pipeline questions (loan statuses, conditions, documents needed)
- Drafting professional follow-up emails to borrowers and realtors
- Loan condition checklists (FHA, Conventional, NON-QM, VA)
- Rate and pricing recommendations
- Lead prioritization and scoring advice
- Regulatory guidance (RESPA, TILA, HMDA, etc.)
Current pipeline context: ${context || 'General MLO workflow'}
Be concise, professional, and practical. Format emails with proper structure when requested.`;

      const history = messages
        .filter((m, i) => !(m.role === 'ai' && i === 0))
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [...history, { role: 'user', content: userMsg }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response.";
      setMessages(p => [...p, { role: 'ai', text: reply }]);
    } catch {
      setMessages(p => [...p, { role: 'ai', text: 'Connection error. Please try again.' }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    'Draft follow-up email for a new lead',
    'FHA condition checklist',
    'Should I recommend locking the rate now?',
    'Score my leads by priority',
  ];

  return (
    <div className={`ai-sidebar${open ? ' open' : ''}`}>
      <div className="ai-header">
        <div className="ai-title">
          <span>✨</span>
          <span>Jammie AI</span>
          <span className="ai-badge">BETA</span>
        </div>
        <button className="modal-close" style={{ color: '#64748b' }} onClick={onClose}>×</button>
      </div>

      <div className="ai-messages">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-name">{m.role === 'ai' ? 'Jammie AI' : 'You'}</div>
            <div className="ai-bubble">{m.text}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg-ai">
            <div className="ai-name">Jammie AI</div>
            <div className="ai-bubble ai-loading">
              <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {quickPrompts.map((p, i) => (
            <button key={i} onClick={() => setInput(p)}
              style={{ background: '#1e2d45', border: '1px solid #334155', borderRadius: 8, padding: '7px 12px', color: '#94a3b8', fontSize: 12, textAlign: 'left', cursor: 'pointer' }}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="ai-input-row">
        <textarea
          className="ai-input"
          rows={2}
          placeholder="Ask Jammie anything…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
        />
        <button className="ai-send" onClick={sendMessage}>↑</button>
      </div>
    </div>
  );
}
