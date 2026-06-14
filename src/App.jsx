import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─────────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --nav-bg: #0f1623; --nav-border: #1e2d45;
      --accent: #2563EB; --accent-hover: #1d4ed8; --accent-light: #EFF6FF;
      --cream: #f9f9f8; --white: #ffffff;
      --border: #e5e4e0; --border-light: #f0efeb;
      --text: #111827; --text-2: #4b5563; --text-3: #9ca3af; --text-link: #2563EB;
      --row-hover: #f5f5f3; --tag-bg: #f3f4f6; --tag-color: #374151;
      --radius: 5px; --radius-lg: 8px;
      --font: 'DM Sans', sans-serif; --mono: 'DM Mono', monospace;
      --ai-bg: #0f172a; --ai-accent: #818cf8;
    }
    body { font-family: var(--font); background: var(--cream); color: var(--text); font-size: 13px; line-height: 1.5; min-height: 100vh; }
    button { font-family: var(--font); cursor: pointer; font-size: 13px; }
    input, select, textarea { font-family: var(--font); font-size: 13px; }
    a { text-decoration: none; color: inherit; }
    #nav { background: var(--nav-bg); height: 46px; display: flex; align-items: center; padding: 0 18px; gap: 0; position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--nav-border); }
    .nav-logo { color: #fff; font-size: 17px; font-weight: 700; letter-spacing: -0.5px; margin-right: 28px; display: flex; align-items: center; gap: 6px; }
    .nav-logo-sub { font-size: 9px; color: #60a5fa; font-weight: 500; margin-top: 2px; }
    .nav-links { display: flex; align-items: center; gap: 2px; flex: 1; }
    .nav-link { color: #94a3b8; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 400; cursor: pointer; transition: color 0.15s, background 0.15s; white-space: nowrap; }
    .nav-link:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }
    .nav-link.active { color: #fff; background: rgba(255,255,255,0.1); font-weight: 500; border-bottom: 2px solid #2563EB; border-radius: 0; padding-bottom: 4px; }
    .nav-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .nav-avatar { width: 28px; height: 28px; background: #2563EB; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 600; }
    .page { padding: 20px 24px; min-height: calc(100vh - 46px); background: var(--white); }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .page-title { font-size: 20px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; }
    .page-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .page-header-right { display: flex; align-items: center; gap: 8px; }
    .filter-pill { display: flex; align-items: center; gap: 5px; background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 12px; color: var(--text-2); cursor: pointer; transition: border-color 0.15s, background 0.15s; white-space: nowrap; }
    .filter-pill:hover { border-color: #9ca3af; background: var(--cream); }
    .filter-pill.active { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
    .btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: var(--radius); font-size: 13px; font-weight: 500; border: none; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--white); color: var(--text-2); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--cream); border-color: #9ca3af; }
    .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
    .btn-ghost:hover { background: var(--cream); }
    .btn-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .btn-danger:hover { background: #fecaca; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-icon { width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-3); cursor: pointer; transition: all 0.15s; }
    .btn-icon:hover { background: var(--cream); color: var(--text-2); border-color: #9ca3af; }
    .table-wrap { border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: var(--cream); border-bottom: 1px solid var(--border); }
    th { padding: 9px 14px; text-align: left; font-size: 11.5px; font-weight: 500; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    tbody tr { border-bottom: 1px solid var(--border-light); transition: background 0.1s; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--row-hover); }
    td { padding: 11px 14px; vertical-align: middle; }
    .td-primary { font-size: 13px; color: var(--text-link); font-weight: 500; cursor: pointer; }
    .td-primary:hover { text-decoration: underline; }
    .td-sub { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
    .td-amount { font-size: 13.5px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
    .row-actions { display: flex; align-items: center; gap: 4px; opacity: 0; transition: opacity 0.15s; }
    tbody tr:hover .row-actions { opacity: 1; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; white-space: nowrap; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge-new { background: #eff6ff; color: #1d4ed8; } .badge-new .badge-dot { background: #3b82f6; }
    .badge-contacted { background: #fff7ed; color: #c2410c; } .badge-contacted .badge-dot { background: #f97316; }
    .badge-qualified { background: #f0fdf4; color: #15803d; } .badge-qualified .badge-dot { background: #22c55e; }
    .badge-app-intake { background: #eff6ff; color: #1d4ed8; } .badge-app-intake .badge-dot { background: #3b82f6; }
    .badge-loan-setup { background: #fdf4ff; color: #7e22ce; } .badge-loan-setup .badge-dot { background: #a855f7; }
    .badge-pre-approved { background: #f0fdf4; color: #15803d; } .badge-pre-approved .badge-dot { background: #22c55e; }
    .badge-processing { background: #fff7ed; color: #c2410c; } .badge-processing .badge-dot { background: #f97316; }
    .badge-closing { background: #fefce8; color: #a16207; } .badge-closing .badge-dot { background: #eab308; }
    .badge-funded { background: #f0fdf4; color: #15803d; } .badge-funded .badge-dot { background: #22c55e; }
    .badge-default { background: var(--tag-bg); color: var(--tag-color); } .badge-default .badge-dot { background: #9ca3af; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(2px); }
    .modal { background: var(--white); border-radius: 12px; width: 100%; box-shadow: 0 25px 70px rgba(0,0,0,0.2); display: flex; flex-direction: column; max-height: 90vh; }
    .modal-sm { max-width: 480px; } .modal-md { max-width: 640px; } .modal-lg { max-width: 860px; } .modal-xl { max-width: 1000px; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .modal-title { font-size: 15px; font-weight: 600; color: var(--text); }
    .modal-close { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: var(--text-3); font-size: 20px; border-radius: 4px; }
    .modal-close:hover { background: var(--cream); color: var(--text-2); }
    .modal-body { padding: 22px; overflow-y: auto; flex: 1; }
    .modal-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--border); flex-shrink: 0; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
    .form-full { grid-column: 1 / -1; }
    .form-group { display: flex; flex-direction: column; gap: 5px; }
    .form-label { font-size: 11.5px; font-weight: 500; color: var(--text-2); letter-spacing: 0.02em; }
    .form-label-req::after { content: ' *'; color: #ef4444; }
    .form-input, .form-select, .form-textarea { padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 13px; color: var(--text); background: var(--white); transition: border-color 0.15s, box-shadow 0.15s; width: 100%; }
    .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .form-textarea { resize: vertical; min-height: 80px; }
    .form-section { margin-bottom: 24px; }
    .form-section-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
    .form-section-num { width: 20px; height: 20px; background: var(--accent); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-3); }
    .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }
    .empty-title { font-size: 15px; font-weight: 500; color: var(--text-2); margin-bottom: 6px; }
    .empty-sub { font-size: 13px; }
    .search-wrap { position: relative; }
    .search-wrap input { padding: 6px 10px 6px 32px; border: 1px solid var(--border); border-radius: 20px; font-size: 12.5px; color: var(--text); background: var(--cream); width: 200px; transition: border-color 0.15s, box-shadow 0.15s; }
    .search-wrap input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); width: 240px; background: white; }
    .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-3); font-size: 13px; pointer-events: none; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #111827; color: white; padding: 10px 18px; border-radius: 8px; font-size: 13px; z-index: 999; animation: slideUp 0.2s ease; }
    @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .section-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); overflow-x: auto; flex-shrink: 0; }
    .section-tab { padding: 10px 16px; font-size: 12px; font-weight: 500; color: var(--text-3); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap; background: none; border-top: none; border-left: none; border-right: none; }
    .section-tab:hover { color: var(--text-2); }
    .section-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    /* AI SIDEBAR */
    .ai-fab { position: fixed; bottom: 28px; right: 28px; width: 48px; height: 48px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(79,70,229,0.4); z-index: 100; transition: transform 0.2s, box-shadow 0.2s; font-size: 20px; }
    .ai-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(79,70,229,0.5); }
    .ai-sidebar { position: fixed; right: 0; top: 46px; bottom: 0; width: 360px; background: var(--ai-bg); border-left: 1px solid #1e2d45; display: flex; flex-direction: column; z-index: 90; transform: translateX(100%); transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); }
    .ai-sidebar.open { transform: translateX(0); }
    .ai-header { padding: 14px 16px; border-bottom: 1px solid #1e2d45; display: flex; align-items: center; justify-content: space-between; }
    .ai-title { color: #e2e8f0; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .ai-badge { background: linear-gradient(135deg,#4f46e5,#7c3aed); color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: 600; letter-spacing: 0.05em; }
    .ai-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .ai-msg { display: flex; flex-direction: column; gap: 4px; }
    .ai-msg-user .ai-bubble { background: #1e3a5f; color: #e2e8f0; align-self: flex-end; border-radius: 12px 12px 4px 12px; }
    .ai-msg-ai .ai-bubble { background: #1e2d45; color: #cbd5e1; align-self: flex-start; border-radius: 12px 12px 12px 4px; }
    .ai-bubble { padding: 10px 14px; font-size: 13px; line-height: 1.6; max-width: 90%; }
    .ai-name { font-size: 10px; color: #64748b; font-weight: 500; }
    .ai-msg-user .ai-name { text-align: right; }
    .ai-input-row { padding: 12px 14px; border-top: 1px solid #1e2d45; display: flex; gap: 8px; }
    .ai-input { flex: 1; background: #1e2d45; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 13px; resize: none; outline: none; font-family: var(--font); line-height: 1.4; }
    .ai-input::placeholder { color: #475569; }
    .ai-input:focus { border-color: #4f46e5; }
    .ai-send { width: 34px; height: 34px; background: linear-gradient(135deg,#4f46e5,#7c3aed); border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; align-self: flex-end; flex-shrink: 0; transition: opacity 0.15s; }
    .ai-send:hover { opacity: 0.9; }
    .ai-loading { display: flex; gap: 4px; padding: 10px 14px; }
    .ai-dot { width: 6px; height: 6px; background: #475569; border-radius: 50%; animation: aiDot 1.2s ease-in-out infinite; }
    .ai-dot:nth-child(2) { animation-delay: 0.2s; }
    .ai-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes aiDot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
    /* DASHBOARD */
    .dash-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; }
    .kpi-label { font-size: 11px; font-weight: 500; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .kpi-value { font-size: 26px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1; }
    .kpi-sub { font-size: 11.5px; color: var(--text-3); margin-top: 5px; }
    .kpi-accent { color: var(--accent); }
    .dash-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 24px; }
    .card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius-lg); }
    .card-header { padding: 14px 18px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--text); display: flex; align-items: center; justify-content: space-between; }
    .card-body { padding: 16px 18px; }
    .pipeline-bar { display: flex; height: 10px; border-radius: 6px; overflow: hidden; margin: 8px 0 16px; }
    .pipeline-seg { height: 100%; transition: flex 0.3s; }
    .pipeline-legend { display: flex; flex-wrap: wrap; gap: 10px; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-2); }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .activity-item { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border-light); }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
    .activity-text { font-size: 12.5px; color: var(--text-2); line-height: 1.4; }
    .activity-time { font-size: 11px; color: var(--text-3); margin-top: 2px; }
    /* TASKS */
    .task-section { margin-bottom: 24px; }
    .task-section-title { font-size: 12px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .task-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; border: 1px solid var(--border-light); border-radius: var(--radius); margin-bottom: 6px; transition: background 0.1s; cursor: pointer; }
    .task-item:hover { background: var(--cream); }
    .task-item.done { opacity: 0.5; }
    .task-check { width: 16px; height: 16px; border: 2px solid var(--border); border-radius: 4px; flex-shrink: 0; margin-top: 1px; cursor: pointer; accent-color: var(--accent); }
    .task-content { flex: 1; }
    .task-title { font-size: 13px; color: var(--text); font-weight: 500; }
    .task-meta { font-size: 11.5px; color: var(--text-3); margin-top: 3px; display: flex; gap: 10px; }
    .task-priority { display: inline-flex; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 500; }
    .task-priority.high { background: #fee2e2; color: #b91c1c; }
    .task-priority.medium { background: #fefce8; color: #a16207; }
    .task-priority.low { background: #f0fdf4; color: #15803d; }
    /* PRICING */
    .pricing-grid { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
    .rate-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; }
    .rate-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-light); }
    .rate-row:last-child { border-bottom: none; }
    .rate-lender { font-size: 13px; font-weight: 500; color: var(--text); }
    .rate-product { font-size: 11px; color: var(--text-3); }
    .rate-value { font-size: 16px; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
    .rate-apr { font-size: 11px; color: var(--text-3); }
    .payment-result { background: linear-gradient(135deg, #1e3a5f, #0f1623); border-radius: var(--radius-lg); padding: 24px; color: white; text-align: center; margin-bottom: 16px; }
    .payment-amount { font-size: 40px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .payment-label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .payment-breakdown { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 20px; }
    .breakdown-item { background: rgba(255,255,255,0.06); border-radius: 8px; padding: 12px; text-align: center; }
    .breakdown-value { font-size: 16px; font-weight: 600; color: #e2e8f0; }
    .breakdown-label { font-size: 11px; color: #64748b; margin-top: 3px; }
    /* CONTACTS */
    .contact-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; display: flex; align-items: flex-start; gap: 14px; transition: box-shadow 0.15s; cursor: pointer; }
    .contact-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .contact-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; color: white; flex-shrink: 0; }
    .contact-name { font-size: 14px; font-weight: 600; color: var(--text); }
    .contact-role { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
    .contact-detail { font-size: 12px; color: var(--text-2); margin-top: 6px; }
    .contacts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap: 14px; margin-top: 16px; }
    /* REPORTS */
    .report-stat { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; }
    .stat-label { font-size: 11px; font-weight: 500; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
    .stat-value { font-size: 28px; font-weight: 700; color: var(--text); margin-top: 6px; }
    .stat-trend { font-size: 12px; margin-top: 4px; }
    .trend-up { color: #15803d; } .trend-down { color: #b91c1c; }
    .bar-chart { display: flex; align-items: flex-end; gap: 6px; height: 100px; padding-top: 8px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .bar { width: 100%; background: var(--accent); border-radius: 3px 3px 0 0; transition: height 0.3s; min-height: 4px; }
    .bar-label { font-size: 10px; color: var(--text-3); }
    /* LEAD SCORE */
    .score-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .score-hot { background: #fee2e2; color: #b91c1c; }
    .score-warm { background: #fef3c7; color: #b45309; }
    .score-cold { background: #f0f9ff; color: #0369a1; }
    /* ── MLO LOGIN ───────────────────────────────────────────── */
    .auth-wrap { position:fixed;inset:0;background:#f0f4f8;display:flex;flex-direction:column;z-index:1000;font-family:var(--font); }
    .auth-header { background:#0f1623;padding:14px 28px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 12px rgba(0,0,0,.3); }
    .auth-logo { color:#fff;font-size:20px;font-weight:700;letter-spacing:-.5px; }
    .auth-logo-sub { font-size:10px;color:#60a5fa;font-weight:500;margin-top:1px; }
    .auth-main { flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px; }
    .auth-card { background:#fff;border-radius:12px;width:100%;max-width:480px;box-shadow:0 8px 40px rgba(0,0,0,.1);overflow:hidden; }
    .auth-card-hdr { background:#1e3a5f;padding:16px 28px;color:#fff;font-size:14px;font-weight:600; }
    .auth-card-body { padding:36px 32px 32px; }
    .auth-title { font-size:26px;font-weight:700;color:#1e2d45;margin-bottom:28px;text-align:center; }
    .auth-field { position:relative;margin-bottom:20px; }
    .auth-field label { position:absolute;top:-9px;left:12px;background:#fff;padding:0 4px;font-size:12px;font-weight:500;color:#4b5563;pointer-events:none; }
    .auth-field input { width:100%;padding:16px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;color:#1e2d45;outline:none;transition:border-color .2s,box-shadow .2s;font-family:var(--font); }
    .auth-field input:focus { border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.1); }
    .auth-field .auth-pw-toggle { position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;color:#9ca3af; }
    .auth-btn { width:100%;padding:16px;border-radius:8px;border:none;background:#2563EB;color:#fff;font-size:15px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:background .2s;margin-bottom:16px;font-family:var(--font); }
    .auth-btn:hover { background:#1d4ed8; }
    .auth-btn-sec { width:100%;padding:14px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fff;color:#1e2d45;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;font-family:var(--font); }
    .auth-btn-sec:hover { border-color:#2563EB;color:#2563EB; }
    .auth-link { color:#2563EB;font-weight:600;cursor:pointer;text-decoration:none; }
    .auth-link:hover { text-decoration:underline; }
    .auth-alert { padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:16px;display:none;align-items:center;gap:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c; }
    .auth-alert.show { display:flex; }
    .auth-alert.success { background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d; }
    .auth-code-input { width:100%;padding:18px;border:1.5px solid #2563EB;border-radius:8px;font-size:24px;font-weight:600;text-align:center;color:#1e2d45;letter-spacing:.2em;outline:none;box-shadow:0 0 0 3px rgba(37,99,235,.1);margin-bottom:12px;font-family:var(--font); }
    .auth-phone-box { background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:16px;color:#1e2d45;margin-bottom:20px;font-family:monospace;letter-spacing:.05em; }
    .auth-check-row { display:flex;align-items:center;gap:10px;margin-bottom:20px;cursor:pointer;font-size:13px;color:#4b5563; }
    .auth-check-row input { width:16px;height:16px;accent-color:#2563EB;cursor:pointer;flex-shrink:0; }
    .auth-stepper { display:flex;align-items:center;justify-content:center;margin-bottom:28px; }
    .auth-step { display:flex;flex-direction:column;align-items:center;gap:5px; }
    .auth-step-circle { width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #e5e7eb;background:#fff;color:#9ca3af;transition:all .3s; }
    .auth-step-circle.active { border-color:#2563EB;background:#2563EB;color:#fff; }
    .auth-step-circle.done { border-color:#2563EB;background:#2563EB;color:#fff; }
    .auth-step-label { font-size:11px;font-weight:500;color:#9ca3af;white-space:nowrap; }
    .auth-step-label.active { color:#1e2d45;font-weight:600; }
    .auth-step-label.done { color:#2563EB; }
    .auth-connector { flex:1;height:2px;background:#e5e7eb;margin:0 6px;margin-bottom:18px;transition:background .3s; }
    .auth-connector.done { background:#2563EB; }
    .auth-terms { font-size:12px;color:#9ca3af;text-align:center;line-height:1.7;margin-top:16px; }
    .auth-terms a { color:#2563EB;text-decoration:underline; }
    .auth-divider { display:flex;align-items:center;gap:12px;margin:20px 0;color:#9ca3af;font-size:13px; }
    .auth-divider::before,.auth-divider::after { content:'';flex:1;height:1px;background:#e5e7eb; }
    .auth-borrower-box { margin-top:20px;padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;text-align:center; }
    .auth-screen { display:none; }
    .auth-screen.active { display:block; }
    /* ── BORROWER PORTAL ─────────────────────────────────────── */
    .b-wrap { min-height:100vh;background:#f0f4f8;font-family:var(--font); }
    .b-header { background:#0f1623;height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;position:sticky;top:0;z-index:50;border-bottom:1px solid #1e2d45; }
    .b-header-left { display:flex;align-items:center;gap:16px; }
    .b-borrower-name { color:#e2e8f0;font-size:14px;font-weight:600; }
    .b-advisor-pill { display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:4px 12px; }
    .b-advisor-avatar { width:22px;height:22px;border-radius:50%;background:#2563EB;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0; }
    .b-advisor-text { font-size:11px;color:#94a3b8; }
    .b-advisor-text strong { color:#e2e8f0; }
    .b-logout-btn { padding:5px 12px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);border-radius:5px;color:#fca5a5;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;font-family:var(--font); }
    .b-logout-btn:hover { background:rgba(239,68,68,.25); }
    .b-body { max-width:900px;margin:0 auto;padding:32px 20px 80px; }
    .b-page-title { font-size:22px;font-weight:700;color:#111827;margin-bottom:4px; }
    .b-page-sub { font-size:13px;color:#9ca3af;margin-bottom:28px; }
    .b-section { margin-bottom:28px; }
    .b-section-hdr { background:#1e3a5f;color:#fff;padding:11px 20px;border-radius:8px 8px 0 0;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase; }
    .b-section-body { background:#fff;border:1px solid #e5e4e0;border-top:none;border-radius:0 0 8px 8px;padding:22px; }
    .b-sub-hdr { background:#f1f5f9;color:#1e3a5f;padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:-22px -22px 18px;border-bottom:1px solid #e5e4e0; }
    .b-save-bar { position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e4e0;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:40;box-shadow:0 -2px 12px rgba(0,0,0,.06); }
    .b-save-info { font-size:12px;color:#9ca3af; }
    .b-progress-bar { height:3px;background:#2563EB;transition:width .5s ease;border-radius:2px; }
    /* ── 1003 FORM ──────────────────────────────────────────── */
    .f1003-wrap { background: var(--cream); min-height: calc(100vh - 46px); }
    .f1003-topbar { background: #1e3a5f; color: #fff; padding: 0 24px; height: 52px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 46px; z-index: 40; }
    .f1003-loan-name { font-size: 15px; font-weight: 700; color: #fff; }
    .f1003-loan-meta { font-size: 11px; color: #93c5fd; margin-top: 1px; }
    .f1003-progress { background: #fff; border-bottom: 1px solid var(--border); padding: 0 24px; overflow-x: auto; }
    .f1003-steps { display: flex; gap: 0; }
    .f1003-step { display: flex; align-items: center; gap: 6px; padding: 10px 14px; font-size: 11.5px; font-weight: 500; color: var(--text-3); white-space: nowrap; border-bottom: 2px solid transparent; cursor: pointer; transition: all .15s; background: none; border-top: none; border-left: none; border-right: none; }
    .f1003-step:hover { color: var(--text-2); }
    .f1003-step.active { color: var(--accent); border-bottom-color: var(--accent); }
    .f1003-step.done { color: #15803d; }
    .f1003-step-num { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: var(--border); color: var(--text-3); flex-shrink: 0; transition: all .15s; }
    .f1003-step.active .f1003-step-num { background: var(--accent); color: #fff; }
    .f1003-step.done .f1003-step-num { background: #15803d; color: #fff; }
    .f1003-progress-bar { height: 3px; background: var(--accent); transition: width .3s ease; }
    .f1003-body { max-width: 960px; margin: 0 auto; padding: 24px 20px 100px; }
    .f1003-section-hdr { background: #1e3a5f; color: #fff; padding: 11px 20px; border-radius: var(--radius-lg) var(--radius-lg) 0 0; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between; }
    .f1003-section-body { background: #fff; border: 1px solid var(--border); border-top: none; border-radius: 0 0 var(--radius-lg) var(--radius-lg); padding: 22px; margin-bottom: 20px; }
    .f1003-sub-hdr { background: #f1f5f9; color: #1e3a5f; padding: 7px 14px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin: -22px -22px 18px; border-bottom: 1px solid var(--border); }
    .f1003-footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 40; box-shadow: 0 -2px 12px rgba(0,0,0,.06); }
    .f1003-footer-info { font-size: 12px; color: var(--text-3); }
    .item-card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; margin-bottom: 12px; background: #fff; }
    .item-card-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; font-size: 12px; font-weight: 600; color: var(--text-2); }
    .btn-add-dashed { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1.5px dashed var(--accent); border-radius: var(--radius); color: var(--accent); background: var(--accent-light); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; }
    .btn-add-dashed:hover { background: #dbeafe; }
    .yn-row { display: grid; grid-template-columns: 1fr 130px; align-items: center; border-bottom: 1px solid var(--border-light); padding: 10px 0; gap: 12px; }
    .yn-row:last-child { border-bottom: none; }
    .yn-q { font-size: 13px; color: var(--text); line-height: 1.5; }
    .yn-btns { display: flex; align-items: center; gap: 14px; }
    .yn-btns label { display: flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; }
    .yn-btns input { accent-color: var(--accent); width: 14px; height: 14px; }
    .f1003-housing-table { width: 100%; border-collapse: collapse; }
    .f1003-housing-table th { padding: 9px 14px; font-size: 11px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid var(--accent); }
    .f1003-housing-table th:first-child { text-align: left; }
    .f1003-housing-table th:not(:first-child) { text-align: right; }
    .f1003-housing-table td { padding: 9px 14px; border-bottom: 1px solid var(--border-light); font-size: 13px; }
    .f1003-housing-table td:not(:first-child) { text-align: right; }
    .f1003-housing-table tr.total-row td { font-weight: 700; background: var(--cream); border-top: 2px solid var(--accent); }
    .calc-row-1003 { display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid var(--border-light); font-size: 13px; }
    .calc-row-1003:last-child { border-bottom: none; }
    .calc-row-1003.total { font-weight: 700; background: var(--cream); border-radius: var(--radius); }
    .demo-grid { display: grid; grid-template-columns: 160px 1fr; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
    .demo-label { background: var(--cream); padding: 14px; font-size: 11.5px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .demo-content { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .demo-label:last-of-type, .demo-content:last-child { border-bottom: none; }
    .dollar-wrap { position: relative; display: inline-block; width: 100%; }
    .dollar-wrap::before { content: '$'; position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-3); font-size: 13px; pointer-events: none; z-index: 1; }
    .dollar-wrap .form-input { padding-left: 20px; }
    .f1003-inline-checks { display: flex; flex-wrap: wrap; gap: 12px; }
    .radio-row, .check-row { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text); cursor: pointer; }
    .radio-row input, .check-row input { accent-color: var(--accent); width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
    .warning-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius); padding: 8px 12px; font-size: 12px; color: #92400e; display: flex; align-items: flex-start; gap: 6px; margin-bottom: 14px; }
    .info-box-1003 { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius); padding: 10px 14px; font-size: 12px; color: #1e40af; margin-bottom: 16px; line-height: 1.6; }
    .b-tab-1003 { padding: 8px 18px; font-size: 13px; font-weight: 500; color: var(--text-3); border-bottom: 2px solid transparent; cursor: pointer; background: none; border-top: none; border-left: none; border-right: none; white-space: nowrap; transition: all .15s; }
    .b-tab-1003:hover { color: var(--text-2); }
    .b-tab-1003.active { color: var(--accent); border-bottom-color: var(--accent); }
  `}</style>
);

// ─────────────────────────────────────────────────────────────────
// MOCK DATABASE
// ─────────────────────────────────────────────────────────────────
let _loans = [
  { id:1, borrower:"Julio Cesar Tello", loan_number:"16660796", subject_property:"TBD", loan_status:"App Intake", product:"FHA 30 Year Fixed", lender:"PRMG", loan_amount:314204, ltv:96.50, rate:7.250, lock_status:"Not Locked", purpose:"Purchase", closing_date:"N/A", officer:"IC", updated_at:"2026-04-25T10:00:00Z" },
  { id:2, borrower:"Yusmari Rosario Noguera", loan_number:"16516154", subject_property:"310 Cyan Lane", loan_status:"Loan Setup", product:"NON-QM Fixed 30", lender:"NQM FUNDING", loan_amount:280415, ltv:85.00, rate:7.429, lock_status:"Not Locked", purpose:"Purchase", closing_date:"5/15/26", officer:"IC", updated_at:"2026-04-25T09:00:00Z" },
  { id:3, borrower:"Eder Berber", loan_number:"16660370", subject_property:"--", loan_status:"App Intake", product:"TBD", lender:"No Lender", loan_amount:310000, ltv:96.88, rate:6.880, lock_status:"Not Locked", purpose:"Purchase", closing_date:"N/A", officer:"IC", updated_at:"2026-04-25T08:00:00Z" },
  { id:4, borrower:"Juan Camargo Chavez", loan_number:"16283012", subject_property:"1308 Marston St", loan_status:"Pre-Approved", product:"NON-QM Fixed 30", lender:"NQM FUNDING", loan_amount:272425, ltv:85.00, rate:7.625, lock_status:"Not Locked", purpose:"Purchase", closing_date:"5/14/26", officer:"IC", updated_at:"2026-04-25T07:00:00Z" },
  { id:5, borrower:"Bridgette Rimpel", loan_number:"16628896", subject_property:"528 Fortune Ridge Rd", loan_status:"App Intake", product:"CONF CONV 30 Year", lender:"UWM", loan_amount:380000, ltv:95.00, rate:7.125, lock_status:"Not Locked", purpose:"Purchase", closing_date:"N/A", officer:"IC", updated_at:"2026-04-25T06:00:00Z" },
  { id:6, borrower:"Cristian Torres", loan_number:"16659584", subject_property:"TBD", loan_status:"Processing", product:"FHA 30 Year Fixed", lender:"PRMG", loan_amount:267530, ltv:97.00, rate:7.0, lock_status:"Locked", purpose:"Purchase", closing_date:"5/30/26", officer:"IC", updated_at:"2026-04-25T05:00:00Z" },
  { id:7, borrower:"Maria Santos", loan_number:"16700001", subject_property:"45 Elm Court", loan_status:"Closing", product:"CONF CONV 30 Year", lender:"UWM", loan_amount:450000, ltv:80.00, rate:6.875, lock_status:"Locked", purpose:"Purchase", closing_date:"5/28/26", officer:"IC", updated_at:"2026-04-26T09:00:00Z" },
  { id:8, borrower:"Robert Kim", loan_number:"16700002", subject_property:"901 Oak Blvd", loan_status:"Funded", product:"VA 30 Year Fixed", lender:"PRMG", loan_amount:520000, ltv:100.00, rate:6.5, lock_status:"Locked", purpose:"Purchase", closing_date:"4/15/26", officer:"IC", updated_at:"2026-04-15T09:00:00Z" },
];
let _leads = [
  { id:1, name:"Gina Gutierrez Posada", lead_number:"10637421", created_date:"Feb 3, 2026", loan_status:"New", source:"--", purpose:"Purchase", loan_amount:510581, score:85, tags:[], officer:"IC", email:"gina.g@email.com", phone:"301-555-0101", notes:"", updated_at:"2026-04-25T10:00:00Z" },
  { id:2, name:"Jaime Garcia", lead_number:"10636233", created_date:"Jan 31, 2026", loan_status:"New", source:"--", purpose:"Purchase", loan_amount:null, score:42, tags:[], officer:"IC", email:"jaime.g@email.com", phone:"240-555-0202", notes:"", updated_at:"2026-04-25T09:00:00Z" },
  { id:3, name:"Marcus Webb", lead_number:"10635100", created_date:"Jan 20, 2026", loan_status:"Contacted", source:"Website", purpose:"Refinance", loan_amount:275000, score:68, tags:["first-time"], officer:"IC", email:"m.webb@email.com", phone:"571-555-0374", notes:"First-time homebuyer", updated_at:"2026-04-24T10:00:00Z" },
  { id:4, name:"Linda Forsythe", lead_number:"10634899", created_date:"Jan 15, 2026", loan_status:"Qualified", source:"Realtor", purpose:"Purchase", loan_amount:650000, score:91, tags:["vip"], officer:"IC", email:"lforsythe@email.com", phone:"703-555-0219", notes:"High net worth client", updated_at:"2026-04-23T10:00:00Z" },
  { id:5, name:"David Park", lead_number:"10634100", created_date:"Jan 10, 2026", loan_status:"In Progress", source:"Zillow", purpose:"Purchase", loan_amount:385000, score:73, tags:[], officer:"IC", email:"dpark@email.com", phone:"571-555-0500", notes:"Looking to close by summer", updated_at:"2026-04-20T10:00:00Z" },
];
let _tasks = [
  { id:1, title:"Request pay stubs from Julio Tello", borrower:"Julio Cesar Tello", loan:"16660796", due:"2026-05-26", priority:"high", done:false, created_at:"2026-04-25T10:00:00Z" },
  { id:2, title:"Order appraisal - 528 Fortune Ridge Rd", borrower:"Bridgette Rimpel", loan:"16628896", due:"2026-05-27", priority:"high", done:false, created_at:"2026-04-25T09:00:00Z" },
  { id:3, title:"Send pre-approval letter to Juan Chavez", borrower:"Juan Camargo Chavez", loan:"16283012", due:"2026-05-25", priority:"medium", done:false, created_at:"2026-04-25T08:00:00Z" },
  { id:4, title:"Follow up with Marcus Webb re: refinance rates", borrower:"Marcus Webb", loan:"", due:"2026-05-28", priority:"medium", done:false, created_at:"2026-04-24T10:00:00Z" },
  { id:5, title:"Upload title report for 310 Cyan Lane", borrower:"Yusmari Rosario Noguera", loan:"16516154", due:"2026-05-26", priority:"low", done:false, created_at:"2026-04-24T09:00:00Z" },
  { id:6, title:"Review closing disclosure - Maria Santos", borrower:"Maria Santos", loan:"16700001", due:"2026-05-24", priority:"high", done:true, created_at:"2026-04-23T09:00:00Z" },
  { id:7, title:"Collect updated bank statements from Eder Berber", borrower:"Eder Berber", loan:"16660370", due:"2026-05-29", priority:"medium", done:false, created_at:"2026-04-22T09:00:00Z" },
];
let _contacts = [
  { id:1, name:"Sarah Mitchell", role:"Real Estate Agent", company:"Century 21", phone:"703-555-1234", email:"s.mitchell@c21.com", type:"Realtor", color:"#2563EB", deals:4 },
  { id:2, name:"Tom Reynolds", role:"Title Officer", company:"First American Title", phone:"571-555-2345", email:"t.reynolds@fat.com", type:"Title", color:"#7c3aed", deals:6 },
  { id:3, name:"Janet Cruz", role:"Loan Processor", company:"PRMG", phone:"240-555-3456", email:"j.cruz@prmg.com", type:"Lender", color:"#0891b2", deals:8 },
  { id:4, name:"Mike Hanson", role:"Home Inspector", company:"Hanson Inspections", phone:"301-555-4567", email:"mike@hansoninsp.com", type:"Inspector", color:"#059669", deals:3 },
  { id:5, name:"Lisa Wong", role:"Real Estate Agent", company:"Keller Williams", phone:"703-555-5678", email:"l.wong@kw.com", type:"Realtor", color:"#d97706", deals:7 },
  { id:6, name:"Carlos Mendez", role:"Underwriter", company:"UWM", phone:"571-555-6789", email:"c.mendez@uwm.com", type:"Lender", color:"#dc2626", deals:12 },
];
let _nextLoanId = 9, _nextLeadId = 6, _nextTaskId = 8;

const db = {
  loans: {
    getAll: () => Promise.resolve([..._loans]),
    insert: r => { const n={...r,id:_nextLoanId++,updated_at:new Date().toISOString()}; _loans.push(n); return Promise.resolve(n); },
    update: (id,r) => { _loans=_loans.map(l=>l.id===id?{...l,...r,updated_at:new Date().toISOString()}:l); return Promise.resolve(); },
    delete: id => { _loans=_loans.filter(l=>l.id!==id); return Promise.resolve(); },
  },
  leads: {
    getAll: () => Promise.resolve([..._leads]),
    insert: r => { const n={...r,id:_nextLeadId++,updated_at:new Date().toISOString()}; _leads.push(n); return Promise.resolve(n); },
    update: (id,r) => { _leads=_leads.map(l=>l.id===id?{...l,...r,updated_at:new Date().toISOString()}:l); return Promise.resolve(); },
    delete: id => { _leads=_leads.filter(l=>l.id!==id); return Promise.resolve(); },
  },
  tasks: {
    getAll: () => Promise.resolve([..._tasks]),
    insert: r => { const n={...r,id:_nextTaskId++,created_at:new Date().toISOString()}; _tasks.push(n); return Promise.resolve(n); },
    update: (id,r) => { _tasks=_tasks.map(t=>t.id===id?{...t,...r}:t); return Promise.resolve(); },
    delete: id => { _tasks=_tasks.filter(t=>t.id!==id); return Promise.resolve(); },
  },
};

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
const fmt$ = v => v == null ? '--' : '$' + Number(v).toLocaleString();
const fmtRate = v => v == null ? '--' : Number(v).toFixed(3) + '%';

function StatusBadge({ status }) {
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

function ScoreBadge({ score }) {
  const cls = score >= 80 ? "score-hot" : score >= 60 ? "score-warm" : "score-cold";
  const label = score >= 80 ? "🔥 Hot" : score >= 60 ? "⚡ Warm" : "❄️ Cold";
  return <span className={`score-badge ${cls}`}>{label} {score}</span>;
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className="toast">{msg}</div>;
}

function ConfirmModal({ msg, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Confirm</span><button className="modal-close" onClick={onCancel}>×</button></div>
        <div className="modal-body"><p style={{fontSize:14,color:'var(--text-2)',lineHeight:1.6}}>{msg}</p></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AI SIDEBAR
// ─────────────────────────────────────────────────────────────────
function AISidebar({ open, onClose, context }) {
  const [messages, setMessages] = useState([
    { role: "ai", text: "Hi! I'm Jammie, your AI mortgage assistant. I can help with loan questions, draft follow-up emails, suggest conditions checklists, and analyze rate pricing. What do you need?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(p => [...p, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const systemPrompt = `You are Jammie, an expert AI assistant for a Mortgage Loan Originator (MLO). You help with:
- Loan pipeline questions (loan statuses, conditions, documents needed)
- Drafting professional follow-up emails to borrowers and realtors
- Loan condition checklists (FHA, Conventional, NON-QM, VA)
- Rate and pricing recommendations
- Lead prioritization and scoring advice
- Regulatory guidance (RESPA, TILA, HMDA, etc.)
Current pipeline context: ${context || "General MLO workflow"}
Be concise, professional, and practical. Format emails with proper structure when requested.`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            ...messages.filter(m => m.role !== "ai" || messages.indexOf(m) > 0).map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
            { role: "user", content: userMsg }
          ]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response.";
      setMessages(p => [...p, { role: "ai", text: reply }]);
    } catch {
      setMessages(p => [...p, { role: "ai", text: "Connection error. Please try again." }]);
    }
    setLoading(false);
  };

  const quickPrompts = ["Draft follow-up email for a new lead", "FHA condition checklist", "Should I recommend locking the rate now?", "Score my leads by priority"];

  return (
    <div className={`ai-sidebar${open ? " open" : ""}`}>
      <div className="ai-header">
        <div className="ai-title">
          <span>✨</span>
          <span>Jammie AI</span>
          <span className="ai-badge">BETA</span>
        </div>
        <button className="modal-close" style={{color:'#64748b'}} onClick={onClose}>×</button>
      </div>
      <div className="ai-messages">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-name">{m.role === "ai" ? "Jammie AI" : "You"}</div>
            <div className="ai-bubble" style={{whiteSpace:'pre-wrap'}}>{m.text}</div>
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
        <div style={{padding:'0 14px 10px',display:'flex',flexDirection:'column',gap:6}}>
          {quickPrompts.map((p, i) => (
            <button key={i} onClick={() => { setInput(p); }} style={{background:'#1e2d45',border:'1px solid #334155',borderRadius:8,padding:'7px 12px',color:'#94a3b8',fontSize:12,textAlign:'left',cursor:'pointer',transition:'background 0.15s'}}
              onMouseEnter={e=>e.target.style.background='#263548'} onMouseLeave={e=>e.target.style.background='#1e2d45'}>
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="ai-input-row">
        <textarea className="ai-input" rows={2} placeholder="Ask Jammie anything…" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
        <button className="ai-send" onClick={sendMessage}>↑</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────
function DashboardPage({ loans, leads, tasks }) {
  const pipeline = useMemo(() => {
    const stages = ["App Intake","Loan Setup","Pre-Approved","Processing","Closing","Funded"];
    return stages.map(s => ({ stage: s, count: loans.filter(l => l.loan_status === s).length, volume: loans.filter(l => l.loan_status === s).reduce((a, l) => a + (l.loan_amount || 0), 0) }));
  }, [loans]);

  const totalVolume = loans.reduce((a, l) => a + (l.loan_amount || 0), 0);
  const fundedVolume = loans.filter(l => l.loan_status === "Funded").reduce((a, l) => a + (l.loan_amount || 0), 0);
  const overdueTasks = tasks.filter(t => !t.done && t.due <= "2026-05-25");
  const todayTasks = tasks.filter(t => !t.done && t.due === "2026-05-25");

  const segColors = ["#3b82f6","#a855f7","#22c55e","#f97316","#eab308","#10b981"];
  const totalCount = pipeline.reduce((a, s) => a + s.count, 0) || 1;

  const activity = [
    { icon:"📋", bg:"#eff6ff", text:"Julio Tello moved to App Intake", time:"2 hours ago" },
    { icon:"✅", bg:"#f0fdf4", text:"Robert Kim loan funded — $520,000", time:"10 days ago" },
    { icon:"👤", bg:"#fdf4ff", text:"New lead: Gina Gutierrez Posada — $510K purchase", time:"1 month ago" },
    { icon:"🔒", bg:"#fefce8", text:"Cristian Torres rate locked at 7.000%", time:"1 month ago" },
    { icon:"📄", bg:"#fff7ed", text:"Maria Santos closing disclosure reviewed", time:"2 days ago" },
  ];

  const monthlyData = [
    { month:"Dec", vol:420 },{ month:"Jan", vol:680 },{ month:"Feb", vol:510 },
    { month:"Mar", vol:890 },{ month:"Apr", vol:1240 },{ month:"May", vol:520 },
  ];
  const maxVol = Math.max(...monthlyData.map(d => d.vol));

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Dashboard</span>
        <div style={{fontSize:12,color:'var(--text-3)'}}>Monday, May 25, 2026</div>
      </div>

      <div className="dash-grid">
        <div className="kpi-card">
          <div className="kpi-label">Active Loans</div>
          <div className="kpi-value">{loans.filter(l => l.loan_status !== "Funded").length}</div>
          <div className="kpi-sub">Pipeline loans in progress</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Pipeline Volume</div>
          <div className="kpi-value" style={{fontSize:20}}>{fmt$(totalVolume)}</div>
          <div className="kpi-sub">{loans.length} loans total</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Funded This Month</div>
          <div className="kpi-value" style={{fontSize:20}}>{fmt$(fundedVolume)}</div>
          <div className="kpi-sub kpi-accent">↑ 1 loan closed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Tasks Due Today</div>
          <div className="kpi-value" style={{color: overdueTasks.length > 0 ? '#b91c1c' : 'var(--text)'}}>{todayTasks.length + overdueTasks.length}</div>
          <div className="kpi-sub">{overdueTasks.length} overdue</div>
        </div>
      </div>

      <div className="dash-row">
        <div className="card">
          <div className="card-header">
            <span>Loan Pipeline</span>
            <span style={{fontSize:12,color:'var(--text-3)'}}>{loans.filter(l=>l.loan_status!=="Funded").length} active</span>
          </div>
          <div className="card-body">
            <div className="pipeline-bar">
              {pipeline.map((s, i) => s.count > 0 && (
                <div key={s.stage} className="pipeline-seg" title={`${s.stage}: ${s.count}`}
                  style={{flex: s.count / totalCount, background: segColors[i]}} />
              ))}
            </div>
            <div className="pipeline-legend">
              {pipeline.map((s, i) => (
                <div key={s.stage} className="legend-item">
                  <div className="legend-dot" style={{background: segColors[i]}} />
                  <span>{s.stage}</span>
                  <strong style={{color:'var(--text)'}}>{s.count}</strong>
                  <span style={{color:'var(--text-3)'}}>· {fmt$(s.volume)}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:20}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Monthly Funded Volume ($K)</div>
              <div className="bar-chart">
                {monthlyData.map(d => (
                  <div key={d.month} className="bar-col">
                    <div className="bar" style={{height: `${(d.vol/maxVol)*80}px`, opacity: d.month === "May" ? 0.5 : 1}} />
                    <div className="bar-label">{d.month}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span>Rate Snapshot</span><span style={{fontSize:11,color:'var(--text-3)'}}>May 25, 2026</span></div>
          <div className="card-body" style={{padding:'8px 18px'}}>
            {[
              {product:"30-Yr Conventional",rate:"6.875%",chg:"+0.02"},
              {product:"30-Yr FHA",rate:"7.125%",chg:"-0.01"},
              {product:"30-Yr VA",rate:"6.625%",chg:"0.00"},
              {product:"15-Yr Conventional",rate:"6.250%",chg:"+0.03"},
              {product:"NON-QM 30 Fixed",rate:"7.750%",chg:"+0.05"},
              {product:"ARM 5/1",rate:"6.125%",chg:"-0.02"},
            ].map(r => (
              <div key={r.product} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border-light)'}}>
                <div style={{fontSize:12,color:'var(--text-2)'}}>{r.product}</div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--accent)',fontVariantNumeric:'tabular-nums'}}>{r.rate}</div>
                  <div style={{fontSize:10,color:r.chg.startsWith('-')?'#15803d':r.chg==='0.00'?'var(--text-3)':'#b91c1c'}}>{r.chg}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-row">
        <div className="card">
          <div className="card-header"><span>Recent Activity</span></div>
          <div className="card-body" style={{padding:'0 18px'}}>
            {activity.map((a, i) => (
              <div key={i} className="activity-item">
                <div className="activity-icon" style={{background:a.bg}}>{a.icon}</div>
                <div>
                  <div className="activity-text">{a.text}</div>
                  <div className="activity-time">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span>Hot Leads</span><span style={{fontSize:11,color:'var(--text-3)'}}>{leads.filter(l=>l.score>=75).length} high score</span></div>
          <div className="card-body" style={{padding:'0 18px'}}>
            {leads.sort((a,b)=>b.score-a.score).slice(0,4).map(l => (
              <div key={l.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border-light)'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{l.name}</div>
                  <div style={{fontSize:11,color:'var(--text-3)'}}>{l.purpose} · {fmt$(l.loan_amount)}</div>
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

// ─────────────────────────────────────────────────────────────────
// TASKS PAGE
// ─────────────────────────────────────────────────────────────────
function TasksPage({ showToast }) {
  const [tasks, setTasks] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ title:'', borrower:'', loan:'', due:'', priority:'medium' });

  useEffect(() => { db.tasks.getAll().then(setTasks); }, []);

  const toggle = async (task) => {
    await db.tasks.update(task.id, { done: !task.done });
    setTasks(p => p.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
  };
  const deleteTask = async (id) => {
    await db.tasks.delete(id);
    setTasks(p => p.filter(t => t.id !== id));
    showToast("Task deleted");
  };
  const addTask = async () => {
    if (!newTask.title.trim()) return;
    const n = await db.tasks.insert({ ...newTask, done: false });
    setTasks(p => [n, ...p]);
    setNewTask({ title:'', borrower:'', loan:'', due:'', priority:'medium' });
    setShowAdd(false);
    showToast("Task added");
  };

  const overdue = tasks.filter(t => !t.done && t.due < "2026-05-25");
  const today = tasks.filter(t => !t.done && t.due === "2026-05-25");
  const upcoming = tasks.filter(t => !t.done && t.due > "2026-05-25");
  const done = tasks.filter(t => t.done);

  const TaskList = ({ items }) => items.length === 0 ? <div style={{fontSize:12,color:'var(--text-3)',padding:'8px 0'}}>No tasks</div> : items.map(t => (
    <div key={t.id} className={`task-item${t.done ? " done" : ""}`}>
      <input type="checkbox" className="task-check" checked={t.done} onChange={() => toggle(t)} />
      <div className="task-content">
        <div className="task-title" style={{textDecoration: t.done ? 'line-through' : 'none'}}>{t.title}</div>
        <div className="task-meta">
          {t.borrower && <span>👤 {t.borrower}</span>}
          {t.loan && <span>🏠 #{t.loan}</span>}
          {t.due && <span>📅 {t.due}</span>}
        </div>
      </div>
      <span className={`task-priority ${t.priority}`}>{t.priority}</span>
      <button className="btn-icon" style={{opacity:0.5}} onClick={() => deleteTask(t.id)}>🗑</button>
    </div>
  ));

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Tasks</span>
        <div className="page-header-right">
          <span style={{fontSize:12,color:'var(--text-3)'}}>{tasks.filter(t=>!t.done).length} open · {overdue.length} overdue</span>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>+ Add Task</button>
        </div>
      </div>

      {showAdd && (
        <div style={{background:'var(--cream)',border:'1px solid var(--border)',borderRadius:8,padding:16,marginBottom:20}}>
          <div className="form-grid" style={{marginBottom:10}}>
            <div className="form-group form-full"><label className="form-label">Task Title *</label><input className="form-input" value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))} placeholder="What needs to be done?" /></div>
            <div className="form-group"><label className="form-label">Borrower</label><input className="form-input" value={newTask.borrower} onChange={e=>setNewTask(p=>({...p,borrower:e.target.value}))} placeholder="Borrower name" /></div>
            <div className="form-group"><label className="form-label">Loan #</label><input className="form-input" value={newTask.loan} onChange={e=>setNewTask(p=>({...p,loan:e.target.value}))} placeholder="Loan number" /></div>
            <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-input" value={newTask.due} onChange={e=>setNewTask(p=>({...p,due:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Priority</label>
              <select className="form-select" value={newTask.priority} onChange={e=>setNewTask(p=>({...p,priority:e.target.value}))}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={addTask}>Add Task</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {overdue.length > 0 && <div className="task-section"><div className="task-section-title" style={{color:'#b91c1c'}}>⚠ Overdue ({overdue.length})</div><TaskList items={overdue} /></div>}
      <div className="task-section"><div className="task-section-title">Today ({today.length})</div><TaskList items={today} /></div>
      <div className="task-section"><div className="task-section-title">Upcoming ({upcoming.length})</div><TaskList items={upcoming} /></div>
      {done.length > 0 && <div className="task-section"><div className="task-section-title">Completed ({done.length})</div><TaskList items={done} /></div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1003 FORM — ALL 10 SECTIONS
// ─────────────────────────────────────────────────────────────────
const US_STATES_1003 = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','DC'];
const SECTION_NAMES_1003 = ['Personal Info','Employment & Income','Assets','Liabilities','Real Estate Owned','Loan Information','Housing Expenses','Details of Transaction','Declarations','Gov\'t Monitoring'];

function emptyBorrower1003(label='Borrower') {
  return {
    label, firstName:'', middleName:'', lastName:'', suffix:'',
    ssn:'', dob:'', maritalStatus:'', numDeps:'', depAges:'',
    joined:'', taxSameAs:'', addrSameAs:'', citizenship:'us_citizen',
    isVeteran:false, vaUseType:'', isDisabledVet:false, isExempt:false,
    altNames:[],
    presentAddr1:'', presentUnit:'', presentCity:'', presentState:'', presentZip:'', presentCountry:'United States', presentYears:'', presentOwn:'',
    prevAddresses:[],
    mailingSame:true, mailingAddr1:'', mailingUnit:'', mailingCity:'', mailingState:'', mailingZip:'', mailingCountry:'United States',
  };
}

function FInput({ value, onChange, placeholder, type='text', style, ...rest }) {
  return <input type={type} value={value||''} onChange={onChange} placeholder={placeholder}
    className="form-input" style={style}
    onFocus={e=>{e.target.style.borderColor='#2563EB';e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,.1)'}}
    onBlur={e=>{e.target.style.borderColor='';e.target.style.boxShadow=''}}
    {...rest} />;
}
function FSelect({ value, onChange, children, style }) {
  return <select value={value||''} onChange={onChange} className="form-select" style={style}
    onFocus={e=>{e.target.style.borderColor='#2563EB';e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,.1)'}}
    onBlur={e=>{e.target.style.borderColor='';e.target.style.boxShadow=''}}>{children}</select>;
}
function FField({ label, req, children, style }) {
  return <div className="form-group" style={style}>
    <label className="form-label">{label}{req&&<span style={{color:'#ef4444'}}> *</span>}</label>
    {children}
  </div>;
}
function DollarInput({ value, onChange, placeholder='0.00', style }) {
  return <div className="dollar-wrap"><input type="number" value={value||''} onChange={onChange} placeholder={placeholder} className="form-input" style={{paddingLeft:20,...style}} onFocus={e=>{e.target.style.borderColor='#2563EB';e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,.1)'}} onBlur={e=>{e.target.style.borderColor='';e.target.style.boxShadow=''}}/></div>;
}
function YNRow({ label, name, value, onChange }) {
  return <div className="yn-row">
    <div className="yn-q">{label}</div>
    <div className="yn-btns">
      <label><input type="radio" name={name} value="yes" checked={value==='yes'} onChange={()=>onChange('yes')}/> Yes</label>
      <label><input type="radio" name={name} value="no" checked={value==='no'} onChange={()=>onChange('no')}/> No</label>
    </div>
  </div>;
}
function AddrBlock({ data, onChange, disabled }) {
  const f = k => e => onChange(k, e.target.value);
  const s = disabled ? {background:'#f3f4f6',color:'#9ca3af'} : {};
  return <>
    <div className="form-grid" style={{marginBottom:12}}>
      <FField label="Address Line 1"><FInput value={data.addr1} onChange={f('addr1')} placeholder="Street address" style={s} disabled={disabled}/></FField>
      <FField label="Unit #"><FInput value={data.unit} onChange={f('unit')} placeholder="Apt, Suite" style={s} disabled={disabled}/></FField>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:12}}>
      <FField label="City"><FInput value={data.city} onChange={f('city')} placeholder="City" style={s} disabled={disabled}/></FField>
      <FField label="State"><FSelect value={data.state} onChange={f('state')} style={s}><option value="">Select</option>{US_STATES_1003.map(st=><option key={st}>{st}</option>)}</FSelect></FField>
      <FField label="ZIP Code"><FInput value={data.zip} onChange={f('zip')} placeholder="00000" style={s} disabled={disabled}/></FField>
      <FField label="Country"><FSelect value={data.country||'United States'} onChange={f('country')} style={s}><option>United States</option><option>Other</option></FSelect></FField>
    </div>
    {data.years !== undefined && <div className="form-grid">
      <FField label="Time at Residence (Years)"><FInput type="number" value={data.years} onChange={f('years')} placeholder="e.g. 2.5" style={s} disabled={disabled}/></FField>
      <FField label="Ownership"><FSelect value={data.own} onChange={f('own')} style={s}><option value="">Please Select</option><option>Own</option><option>Rent</option><option>Living Rent Free</option></FSelect></FField>
    </div>}
  </>;
}

function Section1PersonalInfo({ borrowers, setBorrowers, activeBIdx, setActiveBIdx }) {
  const b = borrowers[activeBIdx];
  const upd = (k,v) => setBorrowers(prev => prev.map((x,i)=>i===activeBIdx?{...x,[k]:v}:x));
  const updAddr = (section,k,v) => upd(section,{...b[section],[k]:v});

  const needsPrev = parseFloat(b.presentYears) < 2 && b.presentYears !== '';
  const presentObj = {addr1:b.presentAddr1,unit:b.presentUnit,city:b.presentCity,state:b.presentState,zip:b.presentZip,country:b.presentCountry,years:b.presentYears,own:b.presentOwn};
  const updPresent = (k,v) => {
    const km={addr1:'presentAddr1',unit:'presentUnit',city:'presentCity',state:'presentState',zip:'presentZip',country:'presentCountry',years:'presentYears',own:'presentOwn'};
    upd(km[k],v);
  };
  const mailingObj = b.mailingSame ? {addr1:b.presentAddr1,unit:b.presentUnit,city:b.presentCity,state:b.presentState,zip:b.presentZip,country:b.presentCountry} : {addr1:b.mailingAddr1,unit:b.mailingUnit,city:b.mailingCity,state:b.mailingState,zip:b.mailingZip,country:b.mailingCountry};
  const updMailing = (k,v) => {
    const km={addr1:'mailingAddr1',unit:'mailingUnit',city:'mailingCity',state:'mailingState',zip:'mailingZip',country:'mailingCountry'};
    upd(km[k],v);
  };

  return <>
    {/* Borrower Tabs */}
    <div style={{display:'flex',alignItems:'center',borderBottom:'1px solid var(--border)',marginBottom:20}}>
      {borrowers.map((bx,i)=>(
        <button key={i} className={`b-tab-1003${activeBIdx===i?' active':''}`} onClick={()=>setActiveBIdx(i)}>
          {(bx.firstName||bx.lastName) ? `${bx.firstName} ${bx.lastName}`.trim() : bx.label}
        </button>
      ))}
      <button className="btn btn-sm btn-ghost" style={{marginLeft:8}} onClick={()=>{
        const labels=['Co-Borrower','Borrower 3','Borrower 4','Borrower 5'];
        setBorrowers(p=>[...p,emptyBorrower1003(labels[p.length-1]||`Borrower ${p.length+1}`)]);
        setActiveBIdx(borrowers.length);
      }}>+ Add Borrower</button>
      {activeBIdx > 0 && <button className="btn btn-sm btn-danger" style={{marginLeft:4}} onClick={()=>{
        setBorrowers(p=>p.filter((_,i)=>i!==activeBIdx)); setActiveBIdx(0);
      }}>✕ Remove</button>}
    </div>

    <div className="f1003-sub-hdr">Personal Information {activeBIdx===0&&<span style={{fontSize:10,background:'#2563EB',color:'#fff',padding:'1px 6px',borderRadius:8,marginLeft:6}}>Primary</span>}</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:14}}>
      <FField label="First Name" req><FInput value={b.firstName} onChange={e=>upd('firstName',e.target.value)} placeholder="First"/></FField>
      <FField label="Middle Name"><FInput value={b.middleName} onChange={e=>upd('middleName',e.target.value)} placeholder="Middle"/></FField>
      <FField label="Last Name" req><FInput value={b.lastName} onChange={e=>upd('lastName',e.target.value)} placeholder="Last"/></FField>
      <FField label="Suffix"><FInput value={b.suffix} onChange={e=>upd('suffix',e.target.value)} placeholder="Jr., Sr."/></FField>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:14}}>
      <FField label="Social Security #" req><FInput value={b.ssn} onChange={e=>upd('ssn',e.target.value)} placeholder="000-00-0000" maxLength={11}/></FField>
      <FField label="Date of Birth" req><FInput type="date" value={b.dob} onChange={e=>upd('dob',e.target.value)}/></FField>
      <FField label="Marital Status"><FSelect value={b.maritalStatus} onChange={e=>upd('maritalStatus',e.target.value)}><option value="">Please Select</option><option>Married</option><option>Unmarried</option><option>Separated</option></FSelect></FField>
      <FField label="No. of Dependents"><FInput type="number" value={b.numDeps} onChange={e=>upd('numDeps',e.target.value)} placeholder="0" min="0"/></FField>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:20}}>
      <FField label="Age of Dependents"><FInput value={b.depAges} onChange={e=>upd('depAges',e.target.value)} placeholder="e.g. 5,8,12"/></FField>
      <FField label="Joined to Borrower"><FSelect value={b.joined} onChange={e=>upd('joined',e.target.value)}><option value="">Please Select</option><option>Spouse</option><option>Civil Union Partner</option><option>Other</option></FSelect></FField>
      <FField label="Tax Filing Address Same As"><FSelect value={b.taxSameAs} onChange={e=>upd('taxSameAs',e.target.value)}><option value="">Please Select</option><option>Borrower</option><option>Co-Borrower</option></FSelect></FField>
      <FField label="Present Address Same As"><FSelect value={b.addrSameAs} onChange={e=>upd('addrSameAs',e.target.value)}><option value="">Please Select</option><option>Borrower</option><option>Co-Borrower</option></FSelect></FField>
    </div>

    <div className="form-grid" style={{marginBottom:20}}>
      <div>
        <div className="form-section-title" style={{marginTop:0}}>Citizenship</div>
        {[['us_citizen','U.S. Citizen'],['perm_resident','Permanent Resident Alien'],['non_perm','Non-Permanent Resident Alien'],['foreign','Foreign National']].map(([v,lbl])=>(
          <label key={v} className="radio-row" style={{marginBottom:8}}><input type="radio" name={`cit-${activeBIdx}`} checked={b.citizenship===v} onChange={()=>upd('citizenship',v)}/> {lbl}</label>
        ))}
      </div>
      <div>
        <div className="form-section-title" style={{marginTop:0}}>Veteran Status</div>
        <label className="check-row" style={{marginBottom:10}}><input type="checkbox" checked={b.isVeteran} onChange={e=>upd('isVeteran',e.target.checked)}/> Veteran?</label>
        {b.isVeteran && <div style={{paddingLeft:22}}>
          <FField label="VA Use Type" style={{marginBottom:8}}><FSelect value={b.vaUseType} onChange={e=>upd('vaUseType',e.target.value)}><option value="">Please Select</option><option>First Use</option><option>Subsequent Use</option><option>Exempt</option></FSelect></FField>
          <label className="check-row" style={{marginBottom:6}}><input type="checkbox" checked={b.isDisabledVet} onChange={e=>upd('isDisabledVet',e.target.checked)}/> Disabled Veteran?</label>
          <label className="check-row"><input type="checkbox" checked={b.isExempt} onChange={e=>upd('isExempt',e.target.checked)}/> Exempt</label>
        </div>}
      </div>
    </div>

    <div className="f1003-sub-hdr" style={{margin:'0 -22px 18px'}}>Address History</div>
    <div className="form-section-title" style={{marginTop:0}}>Present Address</div>
    <AddrBlock data={presentObj} onChange={updPresent}/>
    {needsPrev && <div className="warning-box" style={{marginTop:12}}>⚠ Less than 2 years at present address — previous address required.</div>}
    {(needsPrev || b.prevAddresses.length > 0) && <>
      <div className="form-section-title">Previous Address Details</div>
      {b.prevAddresses.map((prev,pi)=>(
        <div key={pi} className="item-card">
          <div className="item-card-hdr"><span>Previous Address {b.prevAddresses.length>1?pi+1:''}</span>
            <button className="btn btn-danger btn-sm" onClick={()=>upd('prevAddresses',b.prevAddresses.filter((_,j)=>j!==pi))}>✕ Delete</button>
          </div>
          <AddrBlock data={prev} onChange={(k,v)=>upd('prevAddresses',b.prevAddresses.map((a,j)=>j===pi?{...a,[k]:v}:a))}/>
        </div>
      ))}
      <button className="btn-add-dashed" onClick={()=>upd('prevAddresses',[...b.prevAddresses,{addr1:'',unit:'',city:'',state:'',zip:'',country:'United States',years:'',own:''}])}>+ Add Previous Address</button>
    </>}

    <div className="form-section-title" style={{marginTop:20}}>Mailing Address</div>
    <label className="check-row" style={{marginBottom:12}}><input type="checkbox" checked={b.mailingSame} onChange={e=>upd('mailingSame',e.target.checked)}/> Same As Present Address</label>
    {!b.mailingSame && <AddrBlock data={mailingObj} onChange={updMailing}/>}

    <div className="form-section-title" style={{marginTop:20}}>Alternate Names</div>
    {b.altNames.map((n,i)=>(
      <div key={i} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
        <FInput value={n} onChange={e=>upd('altNames',b.altNames.map((x,j)=>j===i?e.target.value:x))} placeholder={`Alternate name ${i+1}`} style={{flex:1}}/>
        <button className="btn btn-danger btn-sm" onClick={()=>upd('altNames',b.altNames.filter((_,j)=>j!==i))}>✕</button>
      </div>
    ))}
    <button className="btn-add-dashed" onClick={()=>upd('altNames',[...b.altNames,''])}>+ Add Alternate Name</button>
  </>;
}

function Section2Employment({ data, setData }) {
  const addEntry = () => setData(p=>({...p, incomes:[...p.incomes,{id:Date.now(),borrower:'Borrower',type:'Employment Income',employer:'',addr1:'',city:'',state:'',zip:'',country:'United States',phone:'',verPhone:'',verEmail:'',position:'',startDate:'',endDate:'',base:'',overtime:'',bonuses:'',commission:'',tips:'',seasonal:'',otherW2:'',currentEmp:true,primary:false,selfEmp:false,familyRelated:false}]}));
  const updEntry = (idx,k,v) => setData(p=>({...p,incomes:p.incomes.map((x,i)=>i===idx?{...x,[k]:v}:x)}));
  const total = (data.incomes||[]).reduce((a,x)=>a+['base','overtime','bonuses','commission','tips','seasonal','otherW2'].reduce((b,k)=>b+(parseFloat(x[k])||0),0),0);
  return <>
    {(data.incomes||[]).map((inc,idx)=>(
      <div key={inc.id} className="item-card">
        <div className="item-card-hdr"><span>Income Entry #{idx+1}</span><button className="btn btn-danger btn-sm" onClick={()=>setData(p=>({...p,incomes:p.incomes.filter((_,i)=>i!==idx)}))}>✕ Remove</button></div>
        <div className="form-grid" style={{marginBottom:12}}>
          <FField label="Borrower"><FSelect value={inc.borrower} onChange={e=>updEntry(idx,'borrower',e.target.value)}><option>Borrower</option><option>Co-Borrower</option></FSelect></FField>
          <FField label="Income Type"><FSelect value={inc.type} onChange={e=>updEntry(idx,'type',e.target.value)}><option>Employment Income</option><option>Self-Employment</option><option>Rental Income</option><option>Social Security</option><option>Pension/Retirement</option><option>Other</option></FSelect></FField>
        </div>
        <div className="f1003-sub-hdr" style={{margin:'0 -16px 12px',borderRadius:0}}>Employment Details</div>
        <div style={{display:'flex',gap:16,marginBottom:12,flexWrap:'wrap'}}>
          <label className="check-row"><input type="checkbox" checked={inc.primary} onChange={e=>updEntry(idx,'primary',e.target.checked)}/> Primary</label>
          <label className="check-row"><input type="checkbox" checked={inc.currentEmp} onChange={e=>updEntry(idx,'currentEmp',e.target.checked)}/> Current Employment</label>
          <label className="check-row"><input type="checkbox" checked={inc.selfEmp} onChange={e=>updEntry(idx,'selfEmp',e.target.checked)}/> Self-Employed / Business Owner</label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:12}}>
          <FField label="Employer Name"><FInput value={inc.employer} onChange={e=>updEntry(idx,'employer',e.target.value)} placeholder="Company name"/></FField>
          <FField label="Address Line 1"><FInput value={inc.addr1} onChange={e=>updEntry(idx,'addr1',e.target.value)}/></FField>
          <FField label="City"><FInput value={inc.city} onChange={e=>updEntry(idx,'city',e.target.value)}/></FField>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:12}}>
          <FField label="State"><FSelect value={inc.state} onChange={e=>updEntry(idx,'state',e.target.value)}><option value="">Select</option>{US_STATES_1003.map(s=><option key={s}>{s}</option>)}</FSelect></FField>
          <FField label="ZIP"><FInput value={inc.zip} onChange={e=>updEntry(idx,'zip',e.target.value)}/></FField>
          <FField label="Employer Phone"><FInput value={inc.phone} onChange={e=>updEntry(idx,'phone',e.target.value)} placeholder="000-000-0000"/></FField>
          <FField label="Position / Title"><FInput value={inc.position} onChange={e=>updEntry(idx,'position',e.target.value)}/></FField>
        </div>
        <div className="form-grid" style={{marginBottom:12}}>
          <FField label="Start Date"><FInput type="date" value={inc.startDate} onChange={e=>updEntry(idx,'startDate',e.target.value)}/></FField>
          <FField label="End Date"><FInput type="date" value={inc.endDate} onChange={e=>updEntry(idx,'endDate',e.target.value)}/></FField>
        </div>
        <label className="check-row" style={{marginBottom:14,fontSize:12,color:'var(--text-2)'}}><input type="checkbox" checked={inc.familyRelated} onChange={e=>updEntry(idx,'familyRelated',e.target.checked)}/> I am employed by a family member, property seller, real estate agent, or other party to the transaction.</label>
        <div className="f1003-sub-hdr" style={{margin:'0 -16px 12px',borderRadius:0}}>Monthly Income Details</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {[['base','Base Income'],['overtime','Overtime'],['bonuses','Bonuses'],['commission','Commission'],['tips','Tip Income'],['seasonal','Seasonal'],['otherW2','Other W2']].map(([k,lbl])=>(
            <FField key={k} label={`${lbl} ($)`}><DollarInput value={inc[k]} onChange={e=>updEntry(idx,k,e.target.value)}/></FField>
          ))}
        </div>
      </div>
    ))}
    <button className="btn-add-dashed" onClick={addEntry}>+ Add Income / Employment</button>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--accent-light)',borderRadius:'var(--radius)',marginTop:16,fontWeight:700,color:'var(--section-hdr)'}}>
      <span>Total Monthly Income</span><span>${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
    </div>
  </>;
}

function Section3Assets({ data, setData }) {
  const addAsset = () => setData(p=>({...p,assets:[...p.assets,{id:Date.now(),owner:'Borrower',type:'',depositor:'',addr1:'',addr2:'',city:'',state:'',zip:'',acct:'',value:''}]}));
  const upd = (idx,k,v) => setData(p=>({...p,assets:p.assets.map((x,i)=>i===idx?{...x,[k]:v}:x)}));
  const total = (data.assets||[]).reduce((a,x)=>a+(parseFloat(x.value)||0),0);
  return <>
    {(data.assets||[]).map((ast,idx)=>(
      <div key={ast.id} className="item-card">
        <div className="item-card-hdr"><span>Asset #{idx+1}</span><button className="btn btn-danger btn-sm" onClick={()=>setData(p=>({...p,assets:p.assets.filter((_,i)=>i!==idx)}))}>✕ Remove</button></div>
        <FField label="Asset Owner" style={{marginBottom:12}}><FSelect value={ast.owner} onChange={e=>upd(idx,'owner',e.target.value)}><option>Borrower</option><option>Co-Borrower</option><option>Both</option></FSelect></FField>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:12}}>
          <FField label="Asset Type"><FSelect value={ast.type} onChange={e=>upd(idx,'type',e.target.value)}><option value="">Select</option><option>Checking Account</option><option>Savings Account</option><option>Money Market</option><option>CD</option><option>Stocks / Bonds</option><option>Mutual Funds</option><option>Retirement (401k/IRA)</option><option>Life Insurance</option><option>Real Estate</option><option>Automobile</option><option>Earnest Money</option><option>Gift Funds</option><option>Other</option></FSelect></FField>
          <FField label="Depositor / Institution"><FInput value={ast.depositor} onChange={e=>upd(idx,'depositor',e.target.value)} placeholder="Bank name"/></FField>
          <FField label="Address Line 1"><FInput value={ast.addr1} onChange={e=>upd(idx,'addr1',e.target.value)}/></FField>
          <FField label="Address Line 2"><FInput value={ast.addr2} onChange={e=>upd(idx,'addr2',e.target.value)}/></FField>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14}}>
          <FField label="City"><FInput value={ast.city} onChange={e=>upd(idx,'city',e.target.value)}/></FField>
          <FField label="State"><FSelect value={ast.state} onChange={e=>upd(idx,'state',e.target.value)}><option value="">Select</option>{US_STATES_1003.map(s=><option key={s}>{s}</option>)}</FSelect></FField>
          <FField label="Account Number"><FInput value={ast.acct} onChange={e=>upd(idx,'acct',e.target.value)}/></FField>
          <FField label="Cash / Fair Mkt Value ($)"><DollarInput value={ast.value} onChange={e=>upd(idx,'value',e.target.value)}/></FField>
        </div>
      </div>
    ))}
    <button className="btn-add-dashed" onClick={addAsset}>+ Add Asset</button>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--accent-light)',borderRadius:'var(--radius)',marginTop:16,fontWeight:700,color:'var(--section-hdr)'}}>
      <span>Total Assets</span><span>${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
    </div>
  </>;
}

function Section4Liabilities({ data, setData }) {
  const addLiab = () => setData(p=>({...p,liabilities:[...p.liabilities,{id:Date.now(),type:'Installment Loan',creditor:'',acct:'',balance:'',payment:'',dti:'Include'}]}));
  const upd = (idx,k,v) => setData(p=>({...p,liabilities:p.liabilities.map((x,i)=>i===idx?{...x,[k]:v}:x)}));
  const total = (data.liabilities||[]).reduce((a,x)=>a+(parseFloat(x.payment)||0),0);
  return <>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Liability Type</th><th>Creditor</th><th>Account #</th><th>Balance</th><th>Payment</th><th>DTI</th><th></th></tr></thead>
        <tbody>
          {(data.liabilities||[]).length===0 && <tr><td colSpan={7}><div className="empty-state" style={{padding:'30px 20px'}}><div className="empty-icon" style={{fontSize:28}}>📋</div><div className="empty-title">No liabilities added</div></div></td></tr>}
          {(data.liabilities||[]).map((l,idx)=>(
            <tr key={l.id}>
              <td><FSelect value={l.type} onChange={e=>upd(idx,'type',e.target.value)} style={{minWidth:140}}><option>Installment Loan</option><option>Revolving</option><option>Open Account</option><option>Mortgage</option><option>Auto Loan</option><option>Student Loan</option><option>Child Support</option><option>Alimony</option><option>Other</option></FSelect></td>
              <td><FInput value={l.creditor} onChange={e=>upd(idx,'creditor',e.target.value)} placeholder="Creditor name"/></td>
              <td><FInput value={l.acct} onChange={e=>upd(idx,'acct',e.target.value)} placeholder="Account #"/></td>
              <td><DollarInput value={l.balance} onChange={e=>upd(idx,'balance',e.target.value)}/></td>
              <td><DollarInput value={l.payment} onChange={e=>upd(idx,'payment',e.target.value)}/></td>
              <td><FSelect value={l.dti} onChange={e=>upd(idx,'dti',e.target.value)} style={{minWidth:100}}><option>Include</option><option>Exclude</option><option>Pay Off</option></FSelect></td>
              <td><button className="btn btn-danger btn-sm" onClick={()=>setData(p=>({...p,liabilities:p.liabilities.filter((_,i)=>i!==idx)}))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={{marginTop:10}}>
      <button className="btn btn-primary btn-sm" onClick={addLiab}>+ Add Liability</button>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--accent-light)',borderRadius:'var(--radius)',marginTop:12,fontWeight:700,color:'var(--section-hdr)'}}>
      <span>Total Liabilities — Monthly Payments</span><span>${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
    </div>
  </>;
}

function Section5REO({ data, setData }) {
  const addREO = () => setData(p=>({...p,reos:[...p.reos,{id:Date.now(),isSubject:false,addr1:'',city:'',state:'',zip:'',occupancy:'',marketValue:'',propType:'',status:''}]}));
  const upd = (idx,k,v) => setData(p=>({...p,reos:p.reos.map((x,i)=>i===idx?{...x,[k]:v}:x)}));
  return <>
    {(data.reos||[]).map((r,idx)=>(
      <div key={r.id} className="item-card">
        <div className="item-card-hdr"><span>Property #{idx+1}</span><button className="btn btn-danger btn-sm" onClick={()=>setData(p=>({...p,reos:p.reos.filter((_,i)=>i!==idx)}))}>✕ Remove</button></div>
        <label className="check-row" style={{marginBottom:14}}><input type="checkbox" checked={r.isSubject} onChange={e=>upd(idx,'isSubject',e.target.checked)}/> Subject Property</label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:12}}>
          <FField label="Address Line 1" req><FInput value={r.addr1} onChange={e=>upd(idx,'addr1',e.target.value)}/></FField>
          <FField label="City" req><FInput value={r.city} onChange={e=>upd(idx,'city',e.target.value)}/></FField>
          <FField label="State" req><FSelect value={r.state} onChange={e=>upd(idx,'state',e.target.value)}><option value="">Select</option>{US_STATES_1003.map(s=><option key={s}>{s}</option>)}</FSelect></FField>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14}}>
          <FField label="ZIP Code" req><FInput value={r.zip} onChange={e=>upd(idx,'zip',e.target.value)}/></FField>
          <FField label="Intended Occupancy" req><FSelect value={r.occupancy} onChange={e=>upd(idx,'occupancy',e.target.value)}><option value="">Select</option><option>Primary Residence</option><option>Investment</option><option>Second Home</option></FSelect></FField>
          <FField label="Market Value ($)"><DollarInput value={r.marketValue} onChange={e=>upd(idx,'marketValue',e.target.value)}/></FField>
          <FField label="Status" req><FSelect value={r.status} onChange={e=>upd(idx,'status',e.target.value)}><option value="">Select</option><option>Retain</option><option>Pending Sale</option><option>Sold</option><option>Rental</option></FSelect></FField>
        </div>
      </div>
    ))}
    <button className="btn-add-dashed" onClick={addREO}>+ Add Property</button>
  </>;
}

function Section6LoanInfo({ data, setData }) {
  const [subTab, setSubTab] = useState(0);
  const upd = (k,v) => setData(p=>({...p,[k]:v}));
  const baseLoan = parseFloat(data.baseLoan)||0;
  const financedFees = parseFloat(data.financedFees)||0;
  const totalLoan = baseLoan + financedFees;
  const salesPrice = parseFloat(data.salesPrice)||0;
  const ltv = salesPrice > 0 ? (totalLoan/salesPrice*100).toFixed(3)+'%' : '—';
  return <>
    <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:20}}>
      {['Mortgage Purpose, Types & Terms','Subject Property'].map((t,i)=>(
        <button key={i} className={`b-tab-1003${subTab===i?' active':''}`} onClick={()=>setSubTab(i)}>{t}</button>
      ))}
    </div>
    {subTab===0 && <>
      <div className="form-grid" style={{marginBottom:14}}>
        <FField label="Mortgage Applied For"><FSelect value={data.mortgageType||''} onChange={e=>upd('mortgageType',e.target.value)}><option value="">Please Select</option><option>VA</option><option>FHA</option><option>Conventional</option><option>USDA/Rural</option><option>Other</option></FSelect></FField>
        <FField label="Amortization Type"><FSelect value={data.amortType||'Fixed'} onChange={e=>upd('amortType',e.target.value)}><option>Fixed</option><option>ARM</option><option>GPM</option></FSelect></FField>
      </div>
      <div className="form-grid" style={{marginBottom:14}}>
        <FField label="Interest Rate (%)"><FInput type="number" step="0.001" value={data.rate} onChange={e=>upd('rate',e.target.value)} placeholder="e.g. 6.125"/></FField>
        <FField label="Mortgage Purpose"><FSelect value={data.mortgagePurpose||'Purchase Home'} onChange={e=>upd('mortgagePurpose',e.target.value)}><option>Purchase Home</option><option>Refinance</option><option>Construction</option></FSelect></FField>
      </div>
      <div className="form-grid" style={{marginBottom:14}}>
        <FField label="Sales Price ($)"><DollarInput value={data.salesPrice} onChange={e=>upd('salesPrice',e.target.value)}/></FField>
        <FField label="Appraised Value ($)"><DollarInput value={data.appraisedVal} onChange={e=>upd('appraisedVal',e.target.value)}/></FField>
      </div>
      <div className="form-grid" style={{marginBottom:14}}>
        <FField label="Base Loan Amount ($)"><DollarInput value={data.baseLoan} onChange={e=>upd('baseLoan',e.target.value)}/></FField>
        <FField label="Financed Fees ($)"><DollarInput value={data.financedFees} onChange={e=>upd('financedFees',e.target.value)}/></FField>
      </div>
      <div className="form-grid" style={{marginBottom:14}}>
        <FField label="Total Loan Amount (auto)"><div style={{padding:'7px 10px',background:'var(--cream)',border:'1px solid var(--border)',borderRadius:'var(--radius)',fontWeight:700,color:'var(--accent)'}}>${totalLoan.toLocaleString()}</div></FField>
        <FField label="LTV % (auto)"><div style={{padding:'7px 10px',background:'var(--cream)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>{ltv}</div></FField>
      </div>
      <FField label="Qualifying Credit Score" style={{maxWidth:200}}><FInput type="number" value={data.creditScore} onChange={e=>upd('creditScore',e.target.value)} placeholder="580–850"/></FField>
    </>}
    {subTab===1 && <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
        <FField label="Property Type"><FSelect value={data.propType||'Single Family Residence'} onChange={e=>upd('propType',e.target.value)}><option>Single Family Residence</option><option>Condo</option><option>2-4 Unit</option><option>Townhouse</option><option>Manufactured</option></FSelect></FField>
        <FField label="Occupancy"><FSelect value={data.occupancy||'Primary Residence'} onChange={e=>upd('occupancy',e.target.value)}><option>Primary Residence</option><option>Secondary Residence</option><option>Investment Property</option></FSelect></FField>
        <FField label="Attachment Type"><FSelect value={data.attachType||'Detached'} onChange={e=>upd('attachType',e.target.value)}><option>Detached</option><option>Attached</option><option>Semi-Detached</option></FSelect></FField>
      </div>
      <div className="form-grid" style={{marginBottom:14}}>
        <FField label="Address Line 1" req><FInput value={data.spAddr1} onChange={e=>upd('spAddr1',e.target.value)} placeholder="TBD or street address"/></FField>
        <FField label="Unit #"><FInput value={data.spUnit} onChange={e=>upd('spUnit',e.target.value)}/></FField>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:14}}>
        <FField label="City"><FInput value={data.spCity} onChange={e=>upd('spCity',e.target.value)}/></FField>
        <FField label="State"><FSelect value={data.spState||''} onChange={e=>upd('spState',e.target.value)}><option value="">Select</option>{US_STATES_1003.map(s=><option key={s}>{s}</option>)}</FSelect></FField>
        <FField label="ZIP"><FInput value={data.spZip} onChange={e=>upd('spZip',e.target.value)}/></FField>
        <FField label="Year Built"><FInput type="number" value={data.spYearBuilt} onChange={e=>upd('spYearBuilt',e.target.value)} placeholder="YYYY"/></FField>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
        <FField label="Title To Be Held In"><FInput value={data.titleName} onChange={e=>upd('titleName',e.target.value)} placeholder="Borrower name(s)"/></FField>
        <FField label="Manner Held"><FSelect value={data.mannerHeld||''} onChange={e=>upd('mannerHeld',e.target.value)}><option value="">Select</option><option>Single Man/Woman</option><option>Married Man/Woman</option><option>Joint Tenants</option><option>Tenants in Common</option><option>Community Property</option></FSelect></FField>
        <FField label="Property Rights"><FSelect value={data.propRights||'Fee Simple'} onChange={e=>upd('propRights',e.target.value)}><option>Fee Simple</option><option>Leasehold</option></FSelect></FField>
      </div>
    </>}
  </>;
}

function Section7Housing({ data, setData }) {
  const upd = (k,v) => setData(p=>({...p,[k]:v}));
  const rows = [['Monthly Rent','rent',false],['Mortgage Payment (P&I)','mort',true],['Other Financing Payment','other',true],['Hazard Insurance','haz',true],['Monthly Taxes','tax',true],['Monthly MI','mi',true],['Monthly HOA Dues','hoa',true],['Flood Insurance','flood',true],['Monthly Other','otherB',true]];
  const presTotal = rows.filter(r=>r[2]).reduce((a,[,k])=>a+(parseFloat(data[k+'Pres'])||0),0);
  const propTotal = rows.filter(r=>r[2]).reduce((a,[,k])=>a+(parseFloat(data[k+'Prop'])||0),0);
  return <table className="f1003-housing-table">
    <thead><tr><th>Expense Type</th><th>Total Present</th><th>Proposed</th></tr></thead>
    <tbody>
      {rows.map(([label,k,hasProp])=>(
        <tr key={k}>
          <td style={{fontSize:13,color:'var(--text-2)'}}>{label}</td>
          <td><DollarInput value={data[k+'Pres']} onChange={e=>upd(k+'Pres',e.target.value)}/></td>
          <td>{hasProp ? <DollarInput value={data[k+'Prop']} onChange={e=>upd(k+'Prop',e.target.value)}/> : <span style={{color:'var(--text-3)',fontSize:12}}>N/A</span>}</td>
        </tr>
      ))}
      <tr className="total-row">
        <td>Total Amount</td>
        <td><strong>${presTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td>
        <td><strong>${propTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td>
      </tr>
    </tbody>
  </table>;
}

function Section8DOT({ data, setData, loanData }) {
  const upd = (k,v) => setData(p=>({...p,[k]:v}));
  const g = k => parseFloat(data[k])||0;
  const A=g('salesPrice'),B=g('improvements'),C=g('land'),D=g('refiBalance'),E=g('ccDebts'),F=g('closingCosts'),G=g('discount');
  const H = A+B+C+D+E+F-G;
  const I = (parseFloat(loanData.baseLoan)||0)+(parseFloat(loanData.financedFees)||0);
  const J = g('otherLoans');
  const K = I+J;
  const L = g('sellerCredits');
  const M = g('otherCredits');
  const N = L+M;
  const cash = H-K-N;
  const fmt2 = n => '$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const rows = [['A. Sales Contract Price','salesPrice'],['B. Improvements, Renovations & Repairs','improvements'],['C. Land (if acquired separately)','land'],['D. Balance of Mortgage Loans to be Paid Off','refiBalance'],['E. Credit Cards and Other Debts Paid Off','ccDebts'],['F. Borrower Closing Costs (incl. Prepaid & Escrow)','closingCosts'],['G. Discount (if Borrower will pay)','discount']];
  return <>
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:16}}>
      {rows.map(([lbl,k],i)=>(
        <div key={k} style={{display:'grid',gridTemplateColumns:'1fr 200px',alignItems:'center',borderBottom:'1px solid var(--border-light)',padding:'0 0 0 16px',background:i%2===0?'#fff':'var(--cream)'}}>
          <span style={{fontSize:13,color:k==='closingCosts'?'var(--accent)':'var(--text-2)',fontWeight:k==='closingCosts'?500:400,padding:'10px 0'}}>{lbl}</span>
          <div style={{padding:'8px 12px'}}><DollarInput value={data[k]} onChange={e=>upd(k,e.target.value)}/></div>
        </div>
      ))}
      <div style={{display:'grid',gridTemplateColumns:'1fr 200px',background:'var(--cream)',padding:'0 12px 0 16px',borderTop:'2px solid var(--border)'}}>
        <span style={{fontSize:13,fontWeight:700,padding:'10px 0'}}>H. TOTAL DUE FROM BORROWER(S)</span>
        <span style={{fontSize:13,fontWeight:700,padding:'10px 0',textAlign:'right'}}>{fmt2(H)}</span>
      </div>
    </div>
    <div style={{border:'2px solid var(--accent)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:12}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',background:'#fff',padding:'12px 16px'}}>
        <span style={{fontSize:14,fontWeight:700}}>I. Loan Amount</span>
        <span style={{fontSize:14,fontWeight:700,color:'var(--accent)'}}>{fmt2(I)}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 200px',padding:'8px 16px 12px',alignItems:'center',borderTop:'1px solid var(--border-light)'}}>
        <span style={{fontSize:13,color:'var(--text-2)'}}>J. Other New Mortgage Loans</span>
        <DollarInput value={data.otherLoans} onChange={e=>upd('otherLoans',e.target.value)}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',background:'var(--cream)',padding:'10px 16px',borderTop:'1px solid var(--border)'}}>
        <span style={{fontSize:13,fontWeight:700}}>K. TOTAL MORTGAGE LOANS (I+J)</span>
        <span style={{fontWeight:700}}>{fmt2(K)}</span>
      </div>
    </div>
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:20}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 200px',padding:'10px 16px',alignItems:'center'}}>
        <span style={{fontSize:13,fontWeight:600}}>L. Seller Credits</span>
        <DollarInput value={data.sellerCredits} onChange={e=>upd('sellerCredits',e.target.value)}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 200px',padding:'8px 16px 12px',alignItems:'center',borderTop:'1px solid var(--border-light)'}}>
        <span style={{fontSize:13,color:'var(--accent)',fontWeight:500}}>M. Other Credits (Earnest Money, Employer Housing, etc.)</span>
        <DollarInput value={data.otherCredits} onChange={e=>upd('otherCredits',e.target.value)}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',background:'var(--cream)',padding:'10px 16px',borderTop:'1px solid var(--border)'}}>
        <span style={{fontSize:13,fontWeight:700}}>N. TOTAL CREDITS (L+M)</span>
        <span style={{fontWeight:700}}>{fmt2(N)}</span>
      </div>
    </div>
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:20}}>
      <div className="calc-row-1003"><span style={{color:'var(--text-2)'}}>Total Due From Borrower(s) — Line H</span><span style={{fontWeight:500}}>{fmt2(H)}</span></div>
      <div className="calc-row-1003"><span style={{color:'var(--text-2)'}}>Less: Total Mortgage Loans (K) & Total Credits (N)</span><span style={{color:'#b91c1c',fontWeight:500}}>-{fmt2(K+N)}</span></div>
      <div className="calc-row-1003 total"><span style={{fontWeight:700}}>Cash From/To Borrower</span><span style={{fontWeight:700,color:cash<0?'#b91c1c':'#15803d',fontSize:14}}>{cash<0?'-':''}{fmt2(cash)}</span></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
      {[['Liquid Cash Available',fmt2(0),'var(--cream)','var(--text)'],['Cash From/To Borrower',fmt2(cash),cash<0?'#fee2e2':'#f0fdf4',cash<0?'#b91c1c':'#15803d'],['Shortage',cash<0?fmt2(Math.abs(cash)):'$0.00','#fee2e2','#b91c1c']].map(([lbl,val,bg,col])=>(
        <div key={lbl} style={{background:bg,borderRadius:'var(--radius-lg)',padding:14}}>
          <div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>{lbl}</div>
          <div style={{fontSize:16,fontWeight:700,color:col}}>{val}</div>
        </div>
      ))}
    </div>
  </>;
}

const DECL_QS = [
  {id:'A',q:'Will you occupy the property as your primary residence?'},
  {id:'A1',q:'If YES — have you had an ownership interest in another property in the last three years?',indent:1},
  {id:'B',q:'Do you have a family relationship or business affiliation with the seller of the property?'},
  {id:'C',q:'Are you borrowing any money for this transaction or obtaining money from another party not disclosed on this application?'},
  {id:'D1',q:'Have you or will you be applying for a mortgage loan on another property before closing?'},
  {id:'D2',q:'Have you or will you be applying for any new credit before closing this loan?'},
  {id:'E',q:'Will this property be subject to a lien that could take priority over the first mortgage lien?'},
  {id:'F',q:'Are you a co-signer or guarantor on any debt not disclosed on this application?'},
  {id:'G',q:'Are there any outstanding judgments against you?'},
  {id:'H',q:'Are you currently delinquent or in default on a Federal debt?'},
  {id:'I',q:'Are you a party to a lawsuit with potential personal financial liability?'},
  {id:'J',q:'Have you conveyed title to any property in lieu of foreclosure in the past 7 years?'},
  {id:'K',q:'Have you completed a pre-foreclosure or short sale in the past 7 years?'},
  {id:'L',q:'Have you had property foreclosed upon in the last 7 years?'},
  {id:'M',q:'Have you declared bankruptcy within the past 7 years?'},
  {id:'N',q:'Are any of the occupant borrowers first-time homebuyers?'},
  {id:'O',q:'HUD Approved Counseling received?'},
];
function Section9Declarations({ data, setData, borrowers }) {
  const [activeB, setActiveB] = useState(0);
  const upd = (bIdx,k,v) => setData(p=>{
    const d = [...(p.declarations||borrowers.map(()=>({})))];
    d[bIdx] = {...d[bIdx],[k]:v};
    return {...p,declarations:d};
  });
  const bData = (data.declarations||[])[activeB]||{};
  return <>
    <div className="info-box-1003">ℹ Each borrower must answer all declaration questions. "Yes" answers may require additional explanation.</div>
    <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:20}}>
      {borrowers.map((b,i)=><button key={i} className={`b-tab-1003${activeB===i?' active':''}`} onClick={()=>setActiveB(i)}>{b.firstName||b.label}</button>)}
    </div>
    {DECL_QS.map(q=>(
      <YNRow key={q.id} label={<span style={{paddingLeft:(q.indent||0)*16}}><strong>{q.id}.</strong> {q.q}</span>} name={`decl-${q.id}-${activeB}`} value={bData[q.id]||''} onChange={v=>upd(activeB,q.id,v)}/>
    ))}
  </>;
}

function Section10GovtMonitoring({ data, setData, borrowers }) {
  const [activeB, setActiveB] = useState(0);
  return <>
    <div className="info-box-1003">ℹ The following information is requested by the Federal Government to monitor compliance with equal credit opportunity and fair housing laws. You are not required to furnish this information.</div>
    <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:20}}>
      {borrowers.map((b,i)=><button key={i} className={`b-tab-1003${activeB===i?' active':''}`} onClick={()=>setActiveB(i)}>{b.firstName||b.label}</button>)}
    </div>
    <div className="f1003-sub-hdr" style={{margin:'0 -22px 16px'}}>Collection Method</div>
    <div className="f1003-inline-checks" style={{marginBottom:20}}>
      {['Face-to-Face (incl. Electronic Media)','Telephone Interview','Fax or Mail','Email or Internet'].map(m=>(
        <label key={m} className="radio-row"><input type="radio" name={`demoMethod-${activeB}`}/> {m}</label>
      ))}
    </div>
    <div className="demo-grid">
      <div className="demo-label">Ethnicity</div>
      <div className="demo-content">
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <label className="check-row"><input type="checkbox"/> Hispanic or Latino</label>
          <div style={{paddingLeft:22,display:'flex',flexWrap:'wrap',gap:10}}>
            {['Mexican','Puerto Rican','Cuban','Other Hispanic or Latino'].map(e=><label key={e} className="check-row"><input type="checkbox"/> {e}</label>)}
          </div>
          <label className="check-row"><input type="checkbox"/> Not Hispanic or Latino</label>
          <label className="check-row"><input type="checkbox"/> I do not wish to provide this information</label>
        </div>
      </div>
      <div className="demo-label">Sex</div>
      <div className="demo-content">
        <div className="f1003-inline-checks">
          {['Female','Male','I do not wish to provide this information'].map(s=><label key={s} className="check-row"><input type="checkbox"/> {s}</label>)}
        </div>
      </div>
      <div className="demo-label" style={{borderBottom:'none'}}>Race / National Origin</div>
      <div className="demo-content" style={{borderBottom:'none'}}>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <label className="check-row"><input type="checkbox"/> American Indian or Alaska Native</label>
          <label className="check-row"><input type="checkbox"/> Asian</label>
          <div style={{paddingLeft:22,display:'flex',flexWrap:'wrap',gap:10}}>
            {['Asian Indian','Chinese','Filipino','Vietnamese','Korean','Japanese','Other Asian'].map(r=><label key={r} className="check-row"><input type="checkbox"/> {r}</label>)}
          </div>
          <label className="check-row"><input type="checkbox"/> Black or African American</label>
          <label className="check-row"><input type="checkbox"/> Native Hawaiian or Other Pacific Islander</label>
          <div style={{paddingLeft:22,display:'flex',flexWrap:'wrap',gap:10}}>
            {['Native Hawaiian','Samoan','Guamanian or Chamorro','Other Pacific Islander'].map(r=><label key={r} className="check-row"><input type="checkbox"/> {r}</label>)}
          </div>
          <label className="check-row"><input type="checkbox"/> White</label>
          <label className="check-row"><input type="checkbox"/> I do not wish to provide this information</label>
        </div>
      </div>
    </div>
  </>;
}

function Form1003({ loan, onBack, showToast }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [borrowers, setBorrowers] = useState([emptyBorrower1003('Borrower')]);
  const [activeBIdx, setActiveBIdx] = useState(0);
  const [formData, setFormData] = useState({
    incomes:[], assets:[], liabilities:[], reos:[],
    mortgageType:'', amortType:'Fixed', rate:'', mortgagePurpose:'Purchase Home',
    salesPrice:'', appraisedVal:'', baseLoan:'', financedFees:'', creditScore:'',
    propType:'Single Family Residence', occupancy:'Primary Residence', attachType:'Detached',
    spAddr1:'', spUnit:'', spCity:'', spState:'', spZip:'', spYearBuilt:'',
    titleName:'', mannerHeld:'', propRights:'Fee Simple',
    rentPres:'', mortPres:'', otherPres:'', hazPres:'', taxPres:'', miPres:'', hoaPres:'', floodPres:'', otherBPres:'',
    mortProp:'', otherProp:'', hazProp:'', taxProp:'', miProp:'', hoaProp:'', floodProp:'', otherBProp:'',
    salesPrice:'', improvements:'', land:'', refiBalance:'', ccDebts:'', closingCosts:'', discount:'',
    otherLoans:'', sellerCredits:'', otherCredits:'',
    declarations:[], govtMonitoring:[],
  });

  const goTo = (idx) => {
    setCompletedSteps(p => { const s = new Set(p); if(idx > currentStep) s.add(currentStep); return s; });
    setCurrentStep(idx);
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const handleSave = () => {
    showToast(`✓ 1003 saved for ${loan.borrower}`);
  };

  const SECTIONS = [
    { label:'Personal Info',          hdrLabel:'Section 1 — Personal Information',         btnLabel:'+ Add Borrower' },
    { label:'Employment & Income',    hdrLabel:'Section 2 — Employment & Income',           btnLabel:'+ Add Income' },
    { label:'Assets',                 hdrLabel:'Section 3 — Assets Information',            btnLabel:'+ Add Asset' },
    { label:'Liabilities',            hdrLabel:'Section 4 — Liabilities Information',       btnLabel:'+ Add Liability' },
    { label:'Real Estate Owned',      hdrLabel:'Section 5 — Real Estate Owned',             btnLabel:'+ Add Property' },
    { label:'Loan Information',       hdrLabel:'Section 6 — Loan Information',              btnLabel:null },
    { label:'Housing Expenses',       hdrLabel:'Section 7 — Total Present Housing Expense', btnLabel:null },
    { label:'Details of Transaction', hdrLabel:'Section 8 — Details of Transaction',        btnLabel:null },
    { label:'Declarations',           hdrLabel:'Section 9 — Declarations',                  btnLabel:null },
    { label:'Gov\'t Monitoring',      hdrLabel:'Section 10 — Government Monitoring',        btnLabel:null },
  ];

  return (
    <div className="f1003-wrap">
      {/* Top bar */}
      <div className="f1003-topbar">
        <div>
          <div className="f1003-loan-name">📋 1003 — {loan.borrower}</div>
          <div className="f1003-loan-meta">Loan #{loan.loan_number} · {loan.subject_property} · {loan.loan_status}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className="btn btn-sm" style={{background:'rgba(255,255,255,.15)',color:'#fff',border:'1px solid rgba(255,255,255,.3)'}} onClick={handleSave}>💾 Save</button>
          <button className="btn btn-sm" style={{background:'#ef4444',color:'#fff',border:'none'}} onClick={onBack}>← Back to Loans</button>
        </div>
      </div>

      {/* Progress steps */}
      <div className="f1003-progress">
        <div className="f1003-steps">
          {SECTIONS.map((s,i)=>(
            <button key={i} className={`f1003-step${currentStep===i?' active':''}${completedSteps.has(i)?' done':''}`} onClick={()=>goTo(i)}>
              <span className="f1003-step-num">{completedSteps.has(i)?'✓':i+1}</span>
              {s.label}
            </button>
          ))}
        </div>
        <div className="f1003-progress-bar" style={{width:`${Math.round(((currentStep+1)/10)*100)}%`}}/>
      </div>

      {/* Body */}
      <div className="f1003-body">
        <div className="f1003-section-hdr">
          <span>{SECTIONS[currentStep].hdrLabel}</span>
          <span style={{fontSize:11,opacity:.7}}>Step {currentStep+1} of 10</span>
        </div>
        <div className="f1003-section-body">
          {currentStep===0 && <Section1PersonalInfo borrowers={borrowers} setBorrowers={setBorrowers} activeBIdx={activeBIdx} setActiveBIdx={setActiveBIdx}/>}
          {currentStep===1 && <Section2Employment data={formData} setData={setFormData}/>}
          {currentStep===2 && <Section3Assets data={formData} setData={setFormData}/>}
          {currentStep===3 && <Section4Liabilities data={formData} setData={setFormData}/>}
          {currentStep===4 && <Section5REO data={formData} setData={setFormData}/>}
          {currentStep===5 && <Section6LoanInfo data={formData} setData={setFormData}/>}
          {currentStep===6 && <Section7Housing data={formData} setData={setFormData}/>}
          {currentStep===7 && <Section8DOT data={formData} setData={setFormData} loanData={formData}/>}
          {currentStep===8 && <Section9Declarations data={formData} setData={setFormData} borrowers={borrowers}/>}
          {currentStep===9 && <Section10GovtMonitoring data={formData} setData={setFormData} borrowers={borrowers}/>}
        </div>
      </div>

      {/* Footer nav */}
      <div className="f1003-footer">
        <div className="f1003-footer-info">
          Section <strong>{currentStep+1}</strong> of <strong>10</strong> · <strong>{SECTIONS[currentStep].label}</strong>
          {' · '}<span style={{color:'var(--accent)'}}>{loan.borrower}</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" onClick={()=>goTo(Math.max(0,currentStep-1))} disabled={currentStep===0}>← Back</button>
          {currentStep < 9
            ? <button className="btn btn-primary" onClick={()=>goTo(currentStep+1)}>Next →</button>
            : <button className="btn" style={{background:'#15803d',color:'#fff'}} onClick={handleSave}>✓ Save & Complete</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LOANS PAGE
// ─────────────────────────────────────────────────────────────────
const LOAN_STATUSES = ["App Intake","Loan Setup","Pre-Approved","Processing","Closing","Funded"];
const LOAN_PURPOSES = ["Purchase","Refinance","Cash-Out Refinance","Investment"];
const LOAN_PRODUCTS = ["FHA 30 Year Fixed","CONF CONV 30 Year","NON-QM Fixed 30","VA 30 Year Fixed","ARM 5/1","TBD"];
const LENDERS = ["PRMG","UWM","NQM FUNDING","Caliber","Freedom Mortgage","No Lender"];

function LoanForm({ initial = {}, onSave, onClose }) {
  const [d, setD] = useState({
    borrower:'', loan_number:'', subject_property:'TBD', loan_status:'App Intake',
    product:'TBD', lender:'No Lender', loan_amount:'', ltv:'', rate:'',
    lock_status:'Not Locked', purpose:'Purchase', closing_date:'N/A', officer:'IC',
    ...initial, loan_amount: initial.loan_amount || '', ltv: initial.ltv || '', rate: initial.rate || ''
  });
  const upd = k => e => setD(p => ({ ...p, [k]: e.target.value }));
  const submit = e => {
    e.preventDefault();
    onSave({ ...d, loan_amount: d.loan_amount ? Number(d.loan_amount) : null, ltv: d.ltv ? Number(d.ltv) : null, rate: d.rate ? Number(d.rate) : null });
  };
  return (
    <form onSubmit={submit}>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">1</span>Borrower</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label form-label-req">Borrower Name</label><input className="form-input" value={d.borrower} onChange={upd('borrower')} required placeholder="Full name" /></div>
          <div className="form-group"><label className="form-label">Loan #</label><input className="form-input" value={d.loan_number} onChange={upd('loan_number')} placeholder="Auto-generated" /></div>
          <div className="form-group form-full"><label className="form-label">Subject Property</label><input className="form-input" value={d.subject_property} onChange={upd('subject_property')} placeholder="Address or TBD" /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">2</span>Loan Details</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={d.loan_status} onChange={upd('loan_status')}>{LOAN_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Purpose</label><select className="form-select" value={d.purpose} onChange={upd('purpose')}>{LOAN_PURPOSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Product</label><select className="form-select" value={d.product} onChange={upd('product')}>{LOAN_PRODUCTS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Lender</label><select className="form-select" value={d.lender} onChange={upd('lender')}>{LENDERS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Loan Amount ($)</label><input type="number" className="form-input" value={d.loan_amount} onChange={upd('loan_amount')} placeholder="e.g. 350000" /></div>
          <div className="form-group"><label className="form-label">LTV (%)</label><input type="number" className="form-input" value={d.ltv} onChange={upd('ltv')} step="0.01" placeholder="e.g. 96.50" /></div>
          <div className="form-group"><label className="form-label">Rate (%)</label><input type="number" className="form-input" value={d.rate} onChange={upd('rate')} step="0.001" placeholder="e.g. 7.250" /></div>
          <div className="form-group"><label className="form-label">Lock Status</label><select className="form-select" value={d.lock_status} onChange={upd('lock_status')}><option>Not Locked</option><option>Locked</option><option>Lock Expired</option></select></div>
          <div className="form-group"><label className="form-label">Closing Date</label><input className="form-input" value={d.closing_date} onChange={upd('closing_date')} placeholder="N/A or MM/DD/YY" /></div>
          <div className="form-group"><label className="form-label">Officer</label><input className="form-input" value={d.officer} onChange={upd('officer')} /></div>
        </div>
      </div>
      <div className="modal-footer" style={{padding:'14px 0 0',borderTop:'1px solid var(--border)'}}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save Loan</button>
      </div>
    </form>
  );
}

function LoansPage({ showToast }) {
  const [loans, setLoans] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [confirmDel, setConfirmDel] = useState(null);
  const [open1003, setOpen1003] = useState(null); // loan object when 1003 is open

  useEffect(() => { db.loans.getAll().then(setLoans); }, []);

  const filtered = useMemo(() => {
    let r = [...loans];
    if (statusFilter !== "All") r = r.filter(l => l.loan_status === statusFilter);
    if (search) r = r.filter(l => (l.borrower||"").toLowerCase().includes(search.toLowerCase()) || (l.loan_number||"").includes(search));
    return r.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }, [loans, search, statusFilter]);

  const handleDelete = async () => { await db.loans.delete(confirmDel.id); setLoans(p=>p.filter(l=>l.id!==confirmDel.id)); setConfirmDel(null); showToast("Loan deleted"); };

  // If 1003 is open, render the full-page form instead
  if (open1003) {
    return <Form1003 loan={open1003} onBack={()=>setOpen1003(null)} showToast={showToast} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-title">Loans</span>
          <select className="filter-pill" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            {LOAN_STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input placeholder="Search loans..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>setOpen1003({borrower:'New Borrower',loan_number:'—',subject_property:'TBD',loan_status:'App Intake'})}>+ New Loan</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Borrower</th><th>Loan #</th><th>Status</th><th>Product</th>
            <th>Lender</th><th>Amount</th><th>LTV</th><th>Rate</th><th>Closing</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id}>
                <td>
                  <div className="td-primary" onClick={()=>setOpen1003(l)} title="Open 1003">{l.borrower}</div>
                  <div className="td-sub">{l.subject_property}</div>
                </td>
                <td style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text-3)'}}>{l.loan_number}</td>
                <td><StatusBadge status={l.loan_status} /></td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{l.product}</td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{l.lender}</td>
                <td className="td-amount">{fmt$(l.loan_amount)}</td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{l.ltv ? `${l.ltv}%` : '--'}</td>
                <td style={{fontSize:13,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>{fmtRate(l.rate)}</td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{l.closing_date}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn-icon" title="Delete" onClick={()=>setConfirmDel(l)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10}><div className="empty-state"><div className="empty-icon">🏠</div><div className="empty-title">No loans found</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      {confirmDel && <ConfirmModal msg={`Delete loan for "${confirmDel.borrower}"? This cannot be undone.`} onConfirm={handleDelete} onCancel={()=>setConfirmDel(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LEADS PAGE
// ─────────────────────────────────────────────────────────────────
const LEAD_STATUSES = ["New","Contacted","Qualified","In Progress","Closed Won","Closed Lost"];
const LEAD_SOURCES = ["--","Website","Zillow","Realtor","Referral","Social Media","Direct Mail","Other"];
const LEAD_PURPOSES = ["Purchase","Refinance","Cash-Out Refinance","Investment","Construction"];

function LeadForm({ initial = {}, onSave, onClose }) {
  const [d, setD] = useState({
    name:'', lead_number:'', created_date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
    loan_status:'New', source:'--', purpose:'Purchase', loan_amount:'',
    score: 50, tags:[], officer:'IC', email:'', phone:'', notes:'',
    ...initial, loan_amount: initial.loan_amount || ''
  });
  const upd = k => e => setD(p => ({ ...p, [k]: e.target.value }));
  const submit = e => { e.preventDefault(); onSave({ ...d, loan_amount: d.loan_amount ? Number(d.loan_amount) : null, score: Number(d.score) }); };
  return (
    <form onSubmit={submit}>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">1</span>Lead Info</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label form-label-req">Full Name</label><input className="form-input" value={d.name} onChange={upd('name')} required placeholder="Full name" /></div>
          <div className="form-group"><label className="form-label">Lead #</label><input className="form-input" value={d.lead_number} onChange={upd('lead_number')} placeholder="Auto-generated" /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={d.email} onChange={upd('email')} placeholder="email@example.com" /></div>
          <div className="form-group"><label className="form-label">Phone</label><input type="tel" className="form-input" value={d.phone} onChange={upd('phone')} placeholder="555-000-0000" /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">2</span>Loan Interest</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={d.loan_status} onChange={upd('loan_status')}>{LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Source</label><select className="form-select" value={d.source} onChange={upd('source')}>{LEAD_SOURCES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Purpose</label><select className="form-select" value={d.purpose} onChange={upd('purpose')}>{LEAD_PURPOSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Loan Amount ($)</label><input type="number" className="form-input" value={d.loan_amount} onChange={upd('loan_amount')} placeholder="Estimated" /></div>
          <div className="form-group"><label className="form-label">Lead Score (0–100)</label><input type="number" min="0" max="100" className="form-input" value={d.score} onChange={upd('score')} /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title"><span className="form-section-num">3</span>Notes</div>
        <div className="form-group"><textarea className="form-textarea" value={d.notes} onChange={upd('notes')} placeholder="Add notes about this lead..." /></div>
      </div>
      <div className="modal-footer" style={{padding:'14px 0 0',borderTop:'1px solid var(--border)'}}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save Lead</button>
      </div>
    </form>
  );
}

function LeadsPage({ showToast }) {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [sortBy, setSortBy] = useState("updated");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [emailLead, setEmailLead] = useState(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => { db.leads.getAll().then(setLeads); }, []);

  const filtered = useMemo(() => {
    let r = [...leads];
    if (statusFilter !== "All Statuses") r = r.filter(l => l.loan_status === statusFilter);
    if (search) r = r.filter(l => (l.name||"").toLowerCase().includes(search.toLowerCase()) || (l.lead_number||"").includes(search) || (l.email||"").toLowerCase().includes(search.toLowerCase()));
    if (sortBy === "score") r.sort((a,b) => b.score - a.score);
    else if (sortBy === "amount") r.sort((a,b) => (b.loan_amount||0) - (a.loan_amount||0));
    else r.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
    return r;
  }, [leads, search, statusFilter, sortBy]);

  const handleAdd = async data => { const n = await db.leads.insert(data); setLeads(p=>[n,...p]); setShowAdd(false); showToast("Lead created"); };
  const handleEdit = async data => { await db.leads.update(editItem.id, data); setLeads(p=>p.map(l=>l.id===editItem.id?{...l,...data}:l)); setEditItem(null); showToast("Lead updated"); };
  const handleDelete = async () => { await db.leads.delete(confirmDel.id); setLeads(p=>p.filter(l=>l.id!==confirmDel.id)); setConfirmDel(null); showToast("Lead deleted"); };

  const generateEmail = async (lead) => {
    setEmailLead(lead);
    setEmailDraft("");
    setEmailLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Write a professional, warm follow-up email from a Mortgage Loan Originator (MLO) to a lead with the following details:
Name: ${lead.name}
Status: ${lead.loan_status}
Purpose: ${lead.purpose}
Estimated loan amount: ${lead.loan_amount ? fmt$(lead.loan_amount) : 'not specified'}
Source: ${lead.source}
Notes: ${lead.notes || 'none'}
The email should be personalized, concise (3-4 short paragraphs), professional but friendly. Include a clear call-to-action. Sign off as "IC, Mortgage Loan Originator". Output only the email body, no subject line.`
          }]
        })
      });
      const data = await res.json();
      setEmailDraft(data.content?.[0]?.text || "Could not generate email.");
    } catch { setEmailDraft("Error generating email. Please try again."); }
    setEmailLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-title">Leads</span>
          <select className="filter-pill" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option>All Statuses</option>
            {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="filter-pill" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
            <option value="updated">Sort: Recent</option>
            <option value="score">Sort: Score ↓</option>
            <option value="amount">Sort: Amount ↓</option>
          </select>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input placeholder="Search leads..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ New Lead</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Lead #</th><th>Status</th><th>Score</th>
            <th>Source</th><th>Purpose</th><th>Amount</th><th>Contact</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id}>
                <td><div className="td-primary" onClick={()=>setEditItem(l)}>{l.name}</div><div className="td-sub">{l.created_date}</div></td>
                <td style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text-3)'}}>{l.lead_number}</td>
                <td><StatusBadge status={l.loan_status} /></td>
                <td><ScoreBadge score={l.score || 0} /></td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{l.source}</td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{l.purpose}</td>
                <td className="td-amount">{fmt$(l.loan_amount)}</td>
                <td style={{fontSize:12,color:'var(--text-2)'}}><div>{l.phone}</div><div style={{color:'var(--text-3)'}}>{l.email}</div></td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-ghost" title="Draft follow-up email" onClick={()=>generateEmail(l)}>✉ Draft</button>
                    <button className="btn-icon" title="Edit" onClick={()=>setEditItem(l)}>✏️</button>
                    <button className="btn-icon" title="Delete" onClick={()=>setConfirmDel(l)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">👥</div><div className="empty-title">No leads found</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Email Draft Modal */}
      {emailLead && (
        <div className="modal-overlay" onClick={()=>setEmailLead(null)}>
          <div className="modal modal-md" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">✉ AI-Drafted Follow-Up Email</div>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>To: {emailLead.name} · {emailLead.email}</div>
              </div>
              <button className="modal-close" onClick={()=>setEmailLead(null)}>×</button>
            </div>
            <div className="modal-body">
              {emailLoading ? (
                <div style={{display:'flex',alignItems:'center',gap:10,color:'var(--text-3)',padding:'20px 0'}}>
                  <div style={{width:20,height:20,border:'2px solid var(--border)',borderTop:'2px solid var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
                  Generating email with Jammie AI…
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : (
                <textarea className="form-textarea" style={{minHeight:280,fontFamily:'var(--font)',fontSize:13,lineHeight:1.7}} value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>generateEmail(emailLead)}>↺ Regenerate</button>
              <button className="btn btn-primary" onClick={()=>{navigator.clipboard?.writeText(emailDraft); showToast("Email copied to clipboard!");}}>Copy Email</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="modal modal-md" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">New Lead</span><button className="modal-close" onClick={()=>setShowAdd(false)}>×</button></div>
            <div className="modal-body"><LeadForm onSave={handleAdd} onClose={()=>setShowAdd(false)} /></div>
          </div>
        </div>
      )}
      {editItem && (
        <div className="modal-overlay" onClick={()=>setEditItem(null)}>
          <div className="modal modal-md" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Edit Lead — {editItem.name}</span><button className="modal-close" onClick={()=>setEditItem(null)}>×</button></div>
            <div className="modal-body"><LeadForm initial={editItem} onSave={handleEdit} onClose={()=>setEditItem(null)} /></div>
          </div>
        </div>
      )}
      {confirmDel && <ConfirmModal msg={`Delete lead "${confirmDel.name}"?`} onConfirm={handleDelete} onCancel={()=>setConfirmDel(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PRICING PAGE
// ─────────────────────────────────────────────────────────────────
function PricingPage({ showToast }) {
  const [loanAmount, setLoanAmount] = useState(350000);
  const [downPct, setDownPct] = useState(5);
  const [loanType, setLoanType] = useState("Conventional");
  const [termYears, setTermYears] = useState(30);
  const [creditScore, setCreditScore] = useState(720);
  const [aiRec, setAiRec] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const lenderMatrix = {
    "Conventional": [
      { lender:"UWM", rate:6.875, pts:0.0, apr:6.932 },
      { lender:"PRMG", rate:6.990, pts:0.5, apr:7.058 },
      { lender:"Caliber", rate:6.750, pts:1.0, apr:6.925 },
      { lender:"Freedom", rate:7.125, pts:0.0, apr:7.181 },
    ],
    "FHA": [
      { lender:"PRMG", rate:7.125, pts:0.0, apr:8.12 },
      { lender:"UWM", rate:7.250, pts:0.0, apr:8.24 },
      { lender:"Caliber", rate:6.990, pts:0.75, apr:8.05 },
      { lender:"Freedom", rate:7.375, pts:0.0, apr:8.35 },
    ],
    "NON-QM": [
      { lender:"NQM FUNDING", rate:7.750, pts:0.0, apr:7.93 },
      { lender:"Angel Oak", rate:8.125, pts:0.0, apr:8.30 },
      { lender:"Citadel", rate:7.500, pts:1.0, apr:7.78 },
    ],
    "VA": [
      { lender:"PRMG", rate:6.500, pts:0.0, apr:6.72 },
      { lender:"UWM", rate:6.625, pts:0.0, apr:6.84 },
      { lender:"Freedom", rate:6.375, pts:0.5, apr:6.65 },
    ],
  };

  const rates = lenderMatrix[loanType] || lenderMatrix["Conventional"];
  const bestRate = rates.reduce((a, b) => a.rate < b.rate ? a : b);
  const principal = loanAmount * (1 - downPct / 100);
  const monthlyRate = bestRate.rate / 100 / 12;
  const n = termYears * 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  const piPayment = isNaN(payment) ? 0 : payment;
  const miMonthly = loanType === "FHA" ? principal * 0.0055 / 12 : (downPct < 20 && loanType === "Conventional") ? principal * 0.0065 / 12 : 0;
  const total = piPayment + miMonthly;

  const getAiRecommendation = async () => {
    setAiLoading(true);
    setAiRec("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `As a mortgage pricing expert, provide a concise rate/lock recommendation for this scenario:
Loan Type: ${loanType}
Loan Amount: ${fmt$(loanAmount)}
Down Payment: ${downPct}%
Credit Score: ${creditScore}
Best Available Rate: ${bestRate.rate}% from ${bestRate.lender}
Today's Date: May 25, 2026
Provide: (1) Lock/float recommendation with brief reasoning, (2) Any product alternatives to consider, (3) One pricing tip. Keep it under 150 words, MLO-professional tone.`
          }]
        })
      });
      const data = await res.json();
      setAiRec(data.content?.[0]?.text || "Could not generate recommendation.");
    } catch { setAiRec("Error fetching AI recommendation."); }
    setAiLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Pricing & Rate Calculator</span>
      </div>
      <div className="pricing-grid">
        {/* Left: inputs */}
        <div>
          <div style={{border:'1px solid var(--border)',borderRadius:8,padding:18,marginBottom:16}}>
            <div className="form-section-title" style={{marginBottom:14}}><span className="form-section-num">1</span>Loan Parameters</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label className="form-label">Loan Type</label>
                <select className="form-select" value={loanType} onChange={e=>setLoanType(e.target.value)}>
                  {["Conventional","FHA","NON-QM","VA"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Loan Amount: {fmt$(loanAmount)}</label>
                <input type="range" min="100000" max="2000000" step="5000" value={loanAmount} onChange={e=>setLoanAmount(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}} />
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-3)'}}><span>$100K</span><span>$2M</span></div>
              </div>
              <div className="form-group"><label className="form-label">Down Payment: {downPct}%</label>
                <input type="range" min={loanType==="VA"?0:3} max="50" step="1" value={downPct} onChange={e=>setDownPct(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}} />
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-3)'}}><span>{loanType==="VA"?0:3}%</span><span>50%</span></div>
              </div>
              <div className="form-group"><label className="form-label">Loan Term</label>
                <select className="form-select" value={termYears} onChange={e=>setTermYears(Number(e.target.value))}>
                  <option value={30}>30 Year</option><option value={20}>20 Year</option><option value={15}>15 Year</option><option value={10}>10 Year</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Credit Score: {creditScore}</label>
                <input type="range" min="580" max="850" step="10" value={creditScore} onChange={e=>setCreditScore(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}} />
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-3)'}}><span>580</span><span>850</span></div>
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center',gap:6}} onClick={getAiRecommendation}>
            ✨ Get AI Rate Recommendation
          </button>
          {(aiLoading || aiRec) && (
            <div style={{marginTop:12,background:'#0f172a',border:'1px solid #1e2d45',borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:600,color:'#818cf8',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.06em'}}>✨ Jammie AI Recommendation</div>
              {aiLoading ? (
                <div style={{display:'flex',gap:4,padding:'4px 0'}}>
                  <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
                </div>
              ) : (
                <div style={{fontSize:12,color:'#cbd5e1',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{aiRec}</div>
              )}
            </div>
          )}
        </div>

        {/* Right: results */}
        <div>
          <div className="payment-result">
            <div className="payment-label">Est. Monthly Payment (P&I{miMonthly > 0 ? ' + MI' : ''})</div>
            <div className="payment-amount">${Math.round(total).toLocaleString()}<span style={{fontSize:18,fontWeight:400,color:'#94a3b8'}}>/mo</span></div>
            <div className="payment-breakdown">
              <div className="breakdown-item"><div className="breakdown-value">${Math.round(piPayment).toLocaleString()}</div><div className="breakdown-label">P&I</div></div>
              <div className="breakdown-item"><div className="breakdown-value">{miMonthly > 0 ? '$'+Math.round(miMonthly).toLocaleString() : '--'}</div><div className="breakdown-label">MI/MIP</div></div>
              <div className="breakdown-item"><div className="breakdown-value">{fmt$(Math.round(principal))}</div><div className="breakdown-label">Loan Amt</div></div>
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Lender Pricing Matrix — {loanType}</div>
            <div style={{border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'var(--cream)',borderBottom:'1px solid var(--border)'}}>
                  <th style={{padding:'8px 14px',textAlign:'left',fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Lender</th>
                  <th style={{padding:'8px 14px',textAlign:'right',fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Rate</th>
                  <th style={{padding:'8px 14px',textAlign:'right',fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Points</th>
                  <th style={{padding:'8px 14px',textAlign:'right',fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.04em'}}>APR</th>
                </tr></thead>
                <tbody>
                  {rates.map((r, i) => (
                    <tr key={i} style={{borderBottom:'1px solid var(--border-light)',background: r.lender === bestRate.lender ? 'var(--accent-light)' : ''}}>
                      <td style={{padding:'10px 14px'}}>
                        <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{r.lender}</div>
                        {r.lender === bestRate.lender && <div style={{fontSize:10,color:'var(--accent)',fontWeight:600}}>★ Best Rate</div>}
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontSize:16,fontWeight:700,color: r.lender===bestRate.lender?'var(--accent)':'var(--text)',fontVariantNumeric:'tabular-nums'}}>{r.rate.toFixed(3)}%</td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontSize:13,color:'var(--text-2)'}}>{r.pts > 0 ? `${r.pts} pts` : 'No pts'}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontSize:13,color:'var(--text-3)',fontVariantNumeric:'tabular-nums'}}>{r.apr.toFixed(3)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{background:'var(--cream)',borderRadius:8,padding:14,fontSize:12,color:'var(--text-2)',lineHeight:1.7}}>
            <strong>Key Metrics:</strong> LTV {(100-downPct).toFixed(1)}% · {loanType === "FHA" ? "MIP Required" : downPct >= 20 ? "No PMI Required" : "PMI Required"} · Credit {creditScore} · {termYears}-Year Term
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CONTACTS PAGE
// ─────────────────────────────────────────────────────────────────
function ContactsPage({ showToast }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const types = ["All","Realtor","Lender","Title","Inspector"];

  const filtered = useMemo(() => {
    let r = [..._contacts];
    if (typeFilter !== "All") r = r.filter(c => c.type === typeFilter);
    if (search) r = r.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase()));
    return r;
  }, [search, typeFilter]);

  const initials = name => name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-title">Contacts</span>
          {types.map(t => (
            <button key={t} className={`filter-pill${typeFilter===t?" active":""}`} onClick={()=>setTypeFilter(t)}>{t}</button>
          ))}
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input placeholder="Search contacts..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>showToast("Add contact coming soon")}>+ Add Contact</button>
      </div>

      <div className="contacts-grid">
        {filtered.map(c => (
          <div key={c.id} className="contact-card">
            <div className="contact-avatar" style={{background:c.color}}>{initials(c.name)}</div>
            <div style={{flex:1}}>
              <div className="contact-name">{c.name}</div>
              <div className="contact-role">{c.role} · {c.company}</div>
              <div className="contact-detail">📞 {c.phone}</div>
              <div className="contact-detail">✉ {c.email}</div>
              <div style={{marginTop:8,display:'flex',alignItems:'center',gap:8}}>
                <span style={{background:'var(--tag-bg)',color:'var(--tag-color)',padding:'2px 8px',borderRadius:10,fontSize:11}}>{c.type}</span>
                <span style={{fontSize:11,color:'var(--text-3)'}}>{c.deals} deals</span>
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

// ─────────────────────────────────────────────────────────────────
// REPORTS PAGE
// ─────────────────────────────────────────────────────────────────
function ReportsPage({ loans, leads }) {
  const [aiReport, setAiReport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const totalVolume = loans.reduce((a,l)=>a+(l.loan_amount||0),0);
  const avgLoanSize = loans.length ? totalVolume / loans.length : 0;
  const fundedLoans = loans.filter(l=>l.loan_status==="Funded");
  const convRate = leads.length ? ((leads.filter(l=>l.loan_status==="Closed Won").length / leads.length)*100).toFixed(1) : 0;
  const avgScore = leads.length ? (leads.reduce((a,l)=>a+(l.score||0),0)/leads.length).toFixed(0) : 0;

  const byStatus = ["App Intake","Loan Setup","Pre-Approved","Processing","Closing","Funded"].map(s=>({
    status: s, count: loans.filter(l=>l.loan_status===s).length, volume: loans.filter(l=>l.loan_status===s).reduce((a,l)=>a+(l.loan_amount||0),0)
  }));
  const byProduct = ["FHA 30 Year Fixed","CONF CONV 30 Year","NON-QM Fixed 30","VA 30 Year Fixed","TBD"].map(p=>({
    product: p, count: loans.filter(l=>l.product===p).length
  })).filter(p=>p.count>0);

  const generateReport = async () => {
    setAiLoading(true);
    setAiReport("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Generate a concise monthly pipeline performance report for an MLO with this data:
Total Pipeline Volume: ${fmt$(totalVolume)}
Active Loans: ${loans.filter(l=>l.loan_status!=="Funded").length}
Funded Loans: ${fundedLoans.length} (${fmt$(fundedLoans.reduce((a,l)=>a+(l.loan_amount||0),0))})
Avg Loan Size: ${fmt$(Math.round(avgLoanSize))}
Total Leads: ${leads.length}
Avg Lead Score: ${avgScore}
By Status: ${byStatus.filter(s=>s.count>0).map(s=>`${s.status}:${s.count}`).join(', ')}
By Product: ${byProduct.map(p=>`${p.product}:${p.count}`).join(', ')}
Date: May 25, 2026
Write a 3-paragraph executive summary with: key wins, areas needing attention, and 2 specific action items. Keep it concise and actionable.`
          }]
        })
      });
      const data = await res.json();
      setAiReport(data.content?.[0]?.text || "Could not generate report.");
    } catch { setAiReport("Error generating report."); }
    setAiLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Reports</span>
        <button className="btn btn-primary" onClick={generateReport}>✨ Generate AI Summary</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {[
          { label:"Total Pipeline Volume", value:fmt$(totalVolume), trend:"+12%", up:true },
          { label:"Active Loans", value:loans.filter(l=>l.loan_status!=="Funded").length, trend:"+2", up:true },
          { label:"Avg Loan Size", value:fmt$(Math.round(avgLoanSize)), trend:"-3%", up:false },
          { label:"Avg Lead Score", value:avgScore, trend:"+5 pts", up:true },
        ].map((s,i) => (
          <div key={i} className="report-stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className={`stat-trend ${s.up?'trend-up':'trend-down'}`}>{s.up?'↑':'↓'} {s.trend} vs last month</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        <div className="card">
          <div className="card-header">Loans by Status</div>
          <div className="card-body" style={{padding:'0 18px'}}>
            {byStatus.filter(s=>s.count>0).map(s => (
              <div key={s.status} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border-light)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <StatusBadge status={s.status} />
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:600,fontSize:13}}>{s.count} loan{s.count!==1?'s':''}</div>
                  <div style={{fontSize:11,color:'var(--text-3)'}}>{fmt$(s.volume)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">Loans by Product</div>
          <div className="card-body" style={{padding:'0 18px'}}>
            {byProduct.map(p => (
              <div key={p.product} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border-light)'}}>
                <div style={{fontSize:13,color:'var(--text-2)'}}>{p.product}</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{height:6,background:'var(--accent)',borderRadius:3,width:`${p.count*20}px`,minWidth:20}} />
                  <span style={{fontWeight:600,fontSize:13,minWidth:16,textAlign:'right'}}>{p.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(aiLoading || aiReport) && (
        <div style={{background:'#0f172a',border:'1px solid #1e2d45',borderRadius:12,padding:24}}>
          <div style={{fontSize:12,fontWeight:600,color:'#818cf8',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.06em'}}>✨ Jammie AI — Pipeline Report · May 2026</div>
          {aiLoading ? (
            <div style={{display:'flex',gap:4,padding:'8px 0'}}>
              <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
            </div>
          ) : (
            <div style={{fontSize:13,color:'#cbd5e1',lineHeight:1.8,whiteSpace:'pre-wrap'}}>{aiReport}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AUTH CONSTANTS
// ─────────────────────────────────────────────────────────────────
const MLO_CREDENTIALS = { email: 'demo@example.com', password: 'Demo123!' };
const BORROWER_CREDENTIALS = { email: 'demo@example.com', password: 'Demo123!' };
const FIXED_MFA_CODE = '123456';
const MLO_PROFILE = { name:'Ismael Castiblanco', initials:'IC', title:'Loan Officer', nmls:'#1616977', email:'icastiblanco@phomemortgage.com', phone:'(678) 505-7898' };

// ─────────────────────────────────────────────────────────────────
// MLO LOGIN GATE
// ─────────────────────────────────────────────────────────────────
function MLOLogin({ onAuthenticated, onBorrowerPortal }) {
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [resendSecs, setResendSecs] = useState(0);
  const timerRef = useRef(null);
  const [su, setSu] = useState({ accountType:'Broker', company:'', nmls:'', location:'', loCount:'', firstName:'', lastName:'', suEmail:'', phone:'', role:'', personalNmls:'', password:'', confirm:'', terms:false });
  const updSu = (k,v) => setSu(p=>({...p,[k]:v}));

  const startResend = () => {
    setResendSecs(30);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendSecs(s => { if(s<=1){clearInterval(timerRef.current);return 0;} return s-1; });
    }, 1000);
  };

  const handleLogin = () => {
    setError('');
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    if (email.toLowerCase() !== MLO_CREDENTIALS.email.toLowerCase() || password !== MLO_CREDENTIALS.password) {
      setError('Invalid email or password. Try: demo@example.com / Demo123!'); return;
    }
    setScreen('mfa'); startResend();
  };

  const handleMFA = () => {
    setError('');
    if (mfaCode !== FIXED_MFA_CODE) { setError('Incorrect code. Use: ' + FIXED_MFA_CODE); return; }
    onAuthenticated({ name:'Ismael Castiblanco', initials:'IC', email });
  };

  const handleForgot = () => {
    if (!forgotEmail.trim()) return;
    setForgotSent(true);
    setTimeout(() => { setForgotSent(false); setScreen('login'); }, 3000);
  };

  const inp = { width:'100%', padding:'16px 14px', border:'1.5px solid #e5e7eb', borderRadius:8, fontSize:15, color:'#1e2d45', outline:'none', fontFamily:"'DM Sans',sans-serif" };

  return (
    <div className="auth-wrap">
      <div className="auth-header">
        <div><div className="auth-logo">Jammie</div><div className="auth-logo-sub">MORTGAGE CRM</div></div>
      </div>
      <div className="auth-main">
        <div className="auth-card">

          {screen === 'login' && <>
            <div className="auth-card-hdr">Log In</div>
            <div className="auth-card-body">
              <div className="auth-title">Log in to your account</div>
              {error && <div className="auth-alert show">⚠ {error}</div>}
              <div className="auth-field">
                <label>Email ID *</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={inp} placeholder=" " autoComplete="email"/>
              </div>
              <div className="auth-field" style={{position:'relative'}}>
                <label>Password *</label>
                <input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={{...inp,paddingRight:44}} placeholder=" "/>
                <button className="auth-pw-toggle" onClick={()=>setShowPw(p=>!p)} type="button">{showPw?'👁':'🙈'}</button>
              </div>
              <a className="auth-link" onClick={()=>setScreen('forgot')} style={{display:'block',textAlign:'left',marginBottom:24,fontSize:14}}>Forgot Password?</a>
              <button className="auth-btn" onClick={handleLogin}>LOGIN</button>
              <a className="auth-link" onClick={()=>setScreen('forgot')} style={{display:'block',textAlign:'center',fontSize:14,marginBottom:20}}>Reset Your MFA</a>
              <div style={{fontSize:12,color:'#9ca3af',textAlign:'center',lineHeight:1.7}}>
                By logging in, you agree to the <a className="auth-link" href="#">Platform Subscription Agreement</a> and <a className="auth-link" href="#">Terms of Use</a>
              </div>
              <div className="auth-divider">or</div>
              <p style={{textAlign:'center',fontSize:14,color:'#4b5563',marginBottom:16}}>Don't have an account? <a className="auth-link" onClick={()=>setScreen('signup1')}>Sign Up</a></p>
              <div className="auth-borrower-box">
                <div style={{fontSize:11,fontWeight:600,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Are you a Borrower?</div>
                <a className="auth-link" onClick={onBorrowerPortal} style={{fontSize:14,cursor:'pointer'}}>Go to Borrower Portal →</a>
              </div>
            </div>
          </>}

          {screen === 'mfa' && <>
            <div className="auth-card-hdr">Two-Factor Authentication</div>
            <div className="auth-card-body">
              <div className="auth-title" style={{fontSize:22}}>Verify Your Identity</div>
              <p style={{fontSize:14,color:'#4b5563',textAlign:'center',marginBottom:16}}>We've sent a text message to:</p>
              <div className="auth-phone-box">XXXXXXXX7898</div>
              {error && <div className="auth-alert show">⚠ {error}</div>}
              <input className="auth-code-input" type="text" maxLength={6} value={mfaCode}
                onChange={e=>setMfaCode(e.target.value.replace(/\D/g,''))}
                onKeyDown={e=>e.key==='Enter'&&handleMFA()} placeholder="______" inputMode="numeric"/>
              <div style={{fontSize:12,color:'#6b7280',textAlign:'center',marginBottom:12}}>Demo code: <strong>{FIXED_MFA_CODE}</strong></div>
              <label className="auth-check-row"><input type="checkbox" defaultChecked/> Remember this device for 30 days</label>
              <button className="auth-btn" onClick={handleMFA}>VERIFY</button>
              <div style={{textAlign:'center',fontSize:14,color:'#4b5563',marginBottom:12}}>
                Didn't receive a code?{' '}
                {resendSecs > 0
                  ? <span style={{color:'#9ca3af',fontWeight:600}}>({resendSecs}s)</span>
                  : <a className="auth-link" onClick={()=>startResend()}>Resend</a>}
              </div>
              <button className="auth-btn-sec" onClick={()=>setScreen('login')}>← Back to Login</button>
            </div>
          </>}

          {screen === 'forgot' && <>
            <div className="auth-card-hdr">Reset Password</div>
            <div className="auth-card-body">
              <div className="auth-title" style={{fontSize:22}}>Reset Your Password</div>
              <p style={{fontSize:14,color:'#4b5563',textAlign:'center',marginBottom:24}}>Enter your email and we'll send a reset link.</p>
              {forgotSent && <div className="auth-alert success show">✓ Reset link sent! Check your email.</div>}
              <div className="auth-field">
                <label>Email Address *</label>
                <input type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} style={inp} placeholder=" "/>
              </div>
              <button className="auth-btn" onClick={handleForgot}>SEND RESET LINK</button>
              <button className="auth-btn-sec" onClick={()=>setScreen('login')}>← Back to Login</button>
            </div>
          </>}

          {screen === 'signup1' && <>
            <div className="auth-card-hdr">Create Account</div>
            <div className="auth-card-body">
              <div className="auth-stepper">
                <div className="auth-step"><div className="auth-step-circle active">1</div><div className="auth-step-label active">Company Info</div></div>
                <div className="auth-connector"/>
                <div className="auth-step"><div className="auth-step-circle">2</div><div className="auth-step-label">Personal Info</div></div>
                <div className="auth-connector"/>
                <div className="auth-step"><div className="auth-step-circle">3</div><div className="auth-step-label">Other Info</div></div>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:'#1e2d45',marginBottom:20}}>Company Info</div>
              {[['Create Account As','accountType','select',['Broker','Non-Del Correspondent','Contract Processor']],['Company Name *','company','text'],['NMLS Number *','nmls','text'],['No. of Loan Officers','loCount','select',['','1–5','6–10','11–25','26–50','51–100','100+']]].map(([lbl,key,type,opts])=>(
                <div key={key} style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>{lbl}</label>
                  {type==='select'?<select value={su[key]} onChange={e=>updSu(key,e.target.value)} style={{...inp,appearance:'none'}}>{opts.map(o=><option key={o}>{o}</option>)}</select>:<input type={type} value={su[key]} onChange={e=>updSu(key,e.target.value)} style={inp}/>}
                </div>
              ))}
              {error && <div className="auth-alert show" style={{marginBottom:12}}>⚠ {error}</div>}
              <button className="auth-btn" onClick={()=>{if(!su.company||!su.nmls){setError('Company name and NMLS required.');return;}setError('');setScreen('signup2');}}>Next →</button>
              <p style={{textAlign:'center',fontSize:13,color:'#4b5563',marginTop:12}}>Already have an account? <a className="auth-link" onClick={()=>setScreen('login')}>Log In</a></p>
            </div>
          </>}

          {screen === 'signup2' && <>
            <div className="auth-card-hdr">Create Account</div>
            <div className="auth-card-body">
              <div className="auth-stepper">
                <div className="auth-step"><div className="auth-step-circle done">✓</div><div className="auth-step-label done">Company Info</div></div>
                <div className="auth-connector done"/>
                <div className="auth-step"><div className="auth-step-circle active">2</div><div className="auth-step-label active">Personal Info</div></div>
                <div className="auth-connector"/>
                <div className="auth-step"><div className="auth-step-circle">3</div><div className="auth-step-label">Other Info</div></div>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:'#1e2d45',marginBottom:20}}>Personal Info</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                <div><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>First Name *</label><input type="text" value={su.firstName} onChange={e=>updSu('firstName',e.target.value)} style={inp}/></div>
                <div><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>Last Name *</label><input type="text" value={su.lastName} onChange={e=>updSu('lastName',e.target.value)} style={inp}/></div>
              </div>
              {[['Email Address *','suEmail','email'],['Mobile Phone *','phone','tel'],['Personal NMLS #','personalNmls','text']].map(([lbl,key,type])=>(
                <div key={key} style={{marginBottom:14}}><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>{lbl}</label><input type={type} value={su[key]} onChange={e=>updSu(key,e.target.value)} style={inp}/></div>
              ))}
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>Job Title / Role</label>
                <select value={su.role} onChange={e=>updSu('role',e.target.value)} style={{...inp,appearance:'none'}}>
                  <option value="">Select Role</option>
                  <option>Administrator</option><option>Mortgage Loan Originator (MLO)</option>
                  <option>Processor</option><option>Loan Officer Assistant (LOA)</option>
                </select>
              </div>
              {error && <div className="auth-alert show" style={{marginBottom:12}}>⚠ {error}</div>}
              <div style={{display:'flex',gap:10}}>
                <button className="auth-btn-sec" onClick={()=>setScreen('signup1')}>← Back</button>
                <button className="auth-btn" style={{margin:0}} onClick={()=>{if(!su.firstName||!su.lastName||!su.suEmail||!su.phone){setError('Fill all required fields.');return;}setError('');setScreen('signup3');}}>Next →</button>
              </div>
            </div>
          </>}

          {screen === 'signup3' && <>
            <div className="auth-card-hdr">Create Account</div>
            <div className="auth-card-body">
              <div className="auth-stepper">
                <div className="auth-step"><div className="auth-step-circle done">✓</div><div className="auth-step-label done">Company Info</div></div>
                <div className="auth-connector done"/>
                <div className="auth-step"><div className="auth-step-circle done">✓</div><div className="auth-step-label done">Personal Info</div></div>
                <div className="auth-connector done"/>
                <div className="auth-step"><div className="auth-step-circle active">3</div><div className="auth-step-label active">Other Info</div></div>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:'#1e2d45',marginBottom:20}}>Other Info</div>
              {[['Create Password *','password','password'],['Confirm Password *','confirm','password']].map(([lbl,key,type])=>(
                <div key={key} style={{marginBottom:14}}><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>{lbl}</label><input type={type} value={su[key]} onChange={e=>updSu(key,e.target.value)} style={inp}/></div>
              ))}
              <label className="auth-check-row"><input type="checkbox" checked={su.terms} onChange={e=>updSu('terms',e.target.checked)}/> I agree to the <a className="auth-link" href="#">Terms of Use</a> and <a className="auth-link" href="#">Privacy Policy</a></label>
              {error && <div className="auth-alert show" style={{marginBottom:12}}>⚠ {error}</div>}
              <div style={{display:'flex',gap:10}}>
                <button className="auth-btn-sec" onClick={()=>setScreen('signup2')}>← Back</button>
                <button className="auth-btn" style={{margin:0}} onClick={()=>{
                  if(!su.password||su.password.length<8){setError('Password must be at least 8 characters.');return;}
                  if(su.password!==su.confirm){setError('Passwords do not match.');return;}
                  if(!su.terms){setError('You must agree to the Terms of Use.');return;}
                  setError('');
                  onAuthenticated({name:`${su.firstName} ${su.lastName}`,initials:(su.firstName[0]||'')+(su.lastName[0]||''),email:su.suEmail});
                }}>Create Account →</button>
              </div>
            </div>
          </>}

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BORROWER PORTAL — SCROLLABLE 1003
// ─────────────────────────────────────────────────────────────────
function BorrowerPortal({ borrower, onLogout }) {
  const [formData, setFormData] = useState({
    incomes:[], assets:[], liabilities:[], reos:[],
    mortgageType:'', amortType:'Fixed', rate:'', salesPrice:'', baseLoan:'', financedFees:'',
    spAddr1:'', spCity:'', spState:'', spZip:'', propType:'Single Family Residence', occupancy:'Primary Residence',
    titleName:'', mannerHeld:'', propRights:'Fee Simple',
  });
  const [borrowers, setBorrowers] = useState([emptyBorrower1003('Borrower')]);
  const [activeBIdx, setActiveBIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const pct = Math.min(100, Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight || 1)) * 100));
      setScrollPct(pct);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const SectionWrap = ({ num, title, children }) => (
    <div className="b-section">
      <div className="b-section-hdr">Section {num} — {title}</div>
      <div className="b-section-body">{children}</div>
    </div>
  );

  return (
    <div className="b-wrap">
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:100,height:3}}>
        <div className="b-progress-bar" style={{width:`${scrollPct}%`}}/>
      </div>
      <div className="b-header">
        <div className="b-header-left">
          <div style={{color:'#fff',fontSize:17,fontWeight:700,letterSpacing:'-.5px'}}>Jammie <span style={{fontSize:9,color:'#60a5fa',fontWeight:500}}>MORTGAGE</span></div>
          <div className="b-borrower-name">👤 {borrower.name}</div>
          <div className="b-advisor-pill">
            <div className="b-advisor-avatar">{MLO_PROFILE.initials}</div>
            <div className="b-advisor-text">Advisor: <strong>{MLO_PROFILE.name}</strong> · {MLO_PROFILE.phone}</div>
          </div>
        </div>
        <button className="b-logout-btn" onClick={onLogout}>Sign Out</button>
      </div>
      <div className="b-body">
        <div className="b-page-title">Uniform Residential Loan Application — 1003</div>
        <div className="b-page-sub">Complete all sections below and save when done. Scroll down to continue through each section.</div>
        <SectionWrap num={1} title="Personal Information"><Section1PersonalInfo borrowers={borrowers} setBorrowers={setBorrowers} activeBIdx={activeBIdx} setActiveBIdx={setActiveBIdx}/></SectionWrap>
        <SectionWrap num={2} title="Employment & Income"><Section2Employment data={formData} setData={setFormData}/></SectionWrap>
        <SectionWrap num={3} title="Assets Information"><Section3Assets data={formData} setData={setFormData}/></SectionWrap>
        <SectionWrap num={4} title="Liabilities Information"><Section4Liabilities data={formData} setData={setFormData}/></SectionWrap>
        <SectionWrap num={5} title="Real Estate Owned"><Section5REO data={formData} setData={setFormData}/></SectionWrap>
        <SectionWrap num={6} title="Loan Information"><Section6LoanInfo data={formData} setData={setFormData}/></SectionWrap>
        <SectionWrap num={7} title="Housing Expenses"><Section7Housing data={formData} setData={setFormData}/></SectionWrap>
        <SectionWrap num={8} title="Details of Transaction"><Section8DOT data={formData} setData={setFormData} loanData={formData}/></SectionWrap>
        <SectionWrap num={9} title="Declarations"><Section9Declarations data={formData} setData={setFormData} borrowers={borrowers}/></SectionWrap>
        <SectionWrap num={10} title="Government Monitoring"><Section10GovtMonitoring data={formData} setData={setFormData} borrowers={borrowers}/></SectionWrap>
      </div>
      <div className="b-save-bar">
        <div className="b-save-info">
          📋 1003 Application · <strong>{borrower.name}</strong>
          <span style={{marginLeft:12,color:'#6b7280'}}>Progress: {scrollPct}% scrolled</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {saved && <span style={{fontSize:12,color:'#15803d',fontWeight:600}}>✓ Saved!</span>}
          <button onClick={handleSave} className="btn btn-primary" style={{padding:'7px 18px'}}>💾 Save Application</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BORROWER LOGIN
// ─────────────────────────────────────────────────────────────────
function BorrowerLogin({ onAuthenticated, onMLOPortal }) {
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [resendSecs, setResendSecs] = useState(0);
  const timerRef = useRef(null);
  const [bFirst, setBFirst] = useState('');
  const [bLast, setBLast] = useState('');
  const [bEmail, setBEmail] = useState('');
  const [bPw, setBPw] = useState('');
  const [captcha, setCaptcha] = useState(false);

  const startResend = () => {
    setResendSecs(30);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendSecs(s => { if(s<=1){clearInterval(timerRef.current);return 0;} return s-1; });
    }, 1000);
  };

  const inp = { width:'100%', padding:'16px 14px', border:'1.5px solid #e5e7eb', borderRadius:8, fontSize:15, color:'#1e2d45', outline:'none', fontFamily:"'DM Sans',sans-serif" };

  const handleLogin = () => {
    setError('');
    if (!email.trim()||!password) { setError('Please enter your email and password.'); return; }
    if (email.toLowerCase() !== BORROWER_CREDENTIALS.email.toLowerCase() || password !== BORROWER_CREDENTIALS.password) {
      setError('Invalid email or password. Try: demo@example.com / Demo123!'); return;
    }
    setScreen('mfa'); startResend();
  };

  const handleMFA = () => {
    setError('');
    if (mfaCode !== FIXED_MFA_CODE) { setError('Incorrect code. Use: ' + FIXED_MFA_CODE); return; }
    onAuthenticated({ name: bFirst && bLast ? `${bFirst} ${bLast}` : 'Demo Borrower', email });
  };

  const handleSignup = () => {
    setError('');
    if (!bFirst||!bLast||!bEmail||!bPw) { setError('Please fill all required fields.'); return; }
    if (!captcha) { setError('Please complete the reCAPTCHA.'); return; }
    if (bPw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setScreen('verify');
  };

  const handleVerify = () => {
    setError('');
    if (verifyCode !== FIXED_MFA_CODE) { setError('Incorrect code. Use: ' + FIXED_MFA_CODE); return; }
    onAuthenticated({ name:`${bFirst} ${bLast}`, email:bEmail });
  };

  return (
    <div className="auth-wrap">
      <div className="auth-header">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div><div className="auth-logo">Jammie</div><div className="auth-logo-sub">MORTGAGE CRM</div></div>
          <span style={{background:'rgba(37,99,235,.3)',color:'#93c5fd',fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,border:'1px solid rgba(37,99,235,.4)'}}>Borrower Portal</span>
        </div>
        <a onClick={onMLOPortal} style={{color:'#94a3b8',fontSize:13,textDecoration:'none',cursor:'pointer'}}>← MLO Login</a>
      </div>
      <div className="auth-main">
        <div className="auth-card">

          {screen === 'login' && <>
            <div className="auth-card-hdr">Borrower Portal — Log In</div>
            <div className="auth-card-body">
              <div className="auth-title">Welcome Back</div>
              <div style={{fontSize:13,color:'#4b5563',textAlign:'center',marginBottom:20}}>Completing your application with <strong>{MLO_PROFILE.name}</strong></div>
              {error && <div className="auth-alert show">⚠ {error}</div>}
              <div className="auth-field"><label>Email Address *</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={inp} placeholder=" "/></div>
              <div className="auth-field" style={{position:'relative'}}>
                <label>Password *</label>
                <input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={{...inp,paddingRight:44}} placeholder=" "/>
                <button className="auth-pw-toggle" onClick={()=>setShowPw(p=>!p)} type="button">{showPw?'👁':'🙈'}</button>
              </div>
              <button className="auth-btn" onClick={handleLogin}>LOG IN</button>
              <div style={{textAlign:'center',fontSize:14,color:'#4b5563'}}>New borrower? <a className="auth-link" onClick={()=>setScreen('signup')}>Apply Now</a></div>
            </div>
          </>}

          {screen === 'signup' && <>
            <div className="auth-card-hdr">Borrower Portal — Apply Now</div>
            <div className="auth-card-body">
              <div className="auth-title" style={{fontSize:24}}>Apply Now</div>
              <div style={{fontSize:13,color:'#4b5563',textAlign:'center',marginBottom:16}}>Already have an account? <a className="auth-link" onClick={()=>setScreen('login')}>Sign In</a></div>
              <div style={{border:'1.5px solid #e5e7eb',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,marginBottom:20,background:'#f8fafc'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'#6b7fd7',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,flexShrink:0}}>{MLO_PROFILE.initials}</div>
                <div>
                  <div style={{fontSize:11,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2}}>Your Mortgage Advisor</div>
                  <div style={{fontSize:15,fontWeight:700,color:'#1e2d45'}}>{MLO_PROFILE.name}</div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{MLO_PROFILE.title} · {MLO_PROFILE.nmls}</div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{MLO_PROFILE.phone}</div>
                </div>
              </div>
              {error && <div className="auth-alert show" style={{marginBottom:12}}>⚠ {error}</div>}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                <div><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>First Name *</label><input type="text" value={bFirst} onChange={e=>setBFirst(e.target.value)} style={inp}/></div>
                <div><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>Last Name *</label><input type="text" value={bLast} onChange={e=>setBLast(e.target.value)} style={inp}/></div>
              </div>
              <div style={{marginBottom:14}}><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>Email *</label><input type="email" value={bEmail} onChange={e=>setBEmail(e.target.value)} style={inp}/></div>
              <div style={{marginBottom:20}}><label style={{display:'block',fontSize:13,fontWeight:500,color:'#4b5563',marginBottom:5}}>Choose Password *</label><input type="password" value={bPw} onChange={e=>setBPw(e.target.value)} style={inp}/></div>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:13,fontWeight:500,color:'#1e2d45',marginBottom:8}}>Please check the box below to proceed *</div>
                <div onClick={()=>setCaptcha(p=>!p)} style={{border:`1.5px solid ${captcha?'#16a34a':'#e5e7eb'}`,borderRadius:8,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',background:captcha?'#f0fdf4':'#f9fafb',cursor:'pointer'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:22,height:22,borderRadius:3,border:`2px solid ${captcha?'#16a34a':'#d1d5db'}`,background:captcha?'#16a34a':'#fff',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:14,fontWeight:700}}>{captcha?'✓':''}</div>
                    <span style={{fontSize:14,color:'#1e2d45',fontWeight:500}}>I'm not a robot</span>
                  </div>
                  <div style={{textAlign:'right'}}><div style={{fontSize:22}}>🔄</div><div style={{fontSize:10,color:'#9ca3af'}}>reCAPTCHA</div></div>
                </div>
              </div>
              <button className="auth-btn" onClick={handleSignup}>CREATE ACCOUNT</button>
              <div className="auth-terms">By creating an account, you agree to our <a href="#">Terms of Service</a></div>
            </div>
          </>}

          {screen === 'mfa' && <>
            <div className="auth-card-hdr">Two-Factor Authentication</div>
            <div className="auth-card-body">
              <div className="auth-title" style={{fontSize:22}}>Verify Your Identity</div>
              <p style={{fontSize:14,color:'#4b5563',textAlign:'center',marginBottom:16}}>We've sent a text message to:</p>
              <div className="auth-phone-box">XXXXXXXX9999</div>
              {error && <div className="auth-alert show">⚠ {error}</div>}
              <input className="auth-code-input" type="text" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,''))} onKeyDown={e=>e.key==='Enter'&&handleMFA()} placeholder="______" inputMode="numeric"/>
              <div style={{fontSize:12,color:'#6b7280',textAlign:'center',marginBottom:12}}>Demo code: <strong>{FIXED_MFA_CODE}</strong></div>
              <label className="auth-check-row"><input type="checkbox" defaultChecked/> Remember this device for 30 days</label>
              <button className="auth-btn" onClick={handleMFA}>VERIFY</button>
              <div style={{textAlign:'center',fontSize:14,color:'#4b5563',marginBottom:12}}>
                Didn't receive a code?{' '}
                {resendSecs > 0 ? <span style={{color:'#9ca3af',fontWeight:600}}>({resendSecs}s)</span> : <a className="auth-link" onClick={()=>startResend()}>Resend</a>}
              </div>
              <button className="auth-btn-sec" onClick={()=>setScreen('login')}>← Back</button>
            </div>
          </>}

          {screen === 'verify' && <>
            <div className="auth-card-hdr">Verify Your Account</div>
            <div className="auth-card-body">
              <div className="auth-title" style={{fontSize:22}}>Check Your Phone</div>
              <p style={{fontSize:14,color:'#4b5563',textAlign:'center',marginBottom:16}}>We've sent a 6-digit code to activate your account.</p>
              <div className="auth-phone-box">XXXXXXXX0000</div>
              {error && <div className="auth-alert show">⚠ {error}</div>}
              <input className="auth-code-input" type="text" maxLength={6} value={verifyCode} onChange={e=>setVerifyCode(e.target.value.replace(/\D/g,''))} onKeyDown={e=>e.key==='Enter'&&handleVerify()} placeholder="______" inputMode="numeric"/>
              <div style={{fontSize:12,color:'#6b7280',textAlign:'center',marginBottom:12}}>Demo code: <strong>{FIXED_MFA_CODE}</strong></div>
              <button className="auth-btn" onClick={handleVerify}>VERIFY ACCOUNT</button>
              <div style={{textAlign:'center',fontSize:13,color:'#4b5563'}}>Didn't receive a code? <a className="auth-link">Resend</a></div>
            </div>
          </>}

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────
export default function App() {
  // 'none' | 'mlo' | 'borrower'
  const [portalMode, setPortalMode] = useState(() => {
    // Check URL param: ?portal=borrower → borrower portal
    const p = new URLSearchParams(window.location.search).get('portal');
    return p === 'borrower' ? 'borrower' : 'mlo';
  });

  const [mloUser, setMloUser] = useState(null);       // null = not logged in
  const [borrowerUser, setBorrowerUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [loans, setLoans] = useState([]);
  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (mloUser) {
      db.loans.getAll().then(setLoans);
      db.leads.getAll().then(setLeads);
      db.tasks.getAll().then(setTasks);
    }
  }, [mloUser]);

  const showToast = useCallback(msg => setToast(msg), []);

  // ── BORROWER PORTAL MODE ──────────────────────────
  if (portalMode === 'borrower') {
    if (!borrowerUser) return <><GlobalStyles/><BorrowerLogin onAuthenticated={setBorrowerUser} onMLOPortal={()=>setPortalMode('mlo')}/></>;
    return (
      <>
        <GlobalStyles/>
        <BorrowerPortal borrower={borrowerUser} onLogout={()=>setBorrowerUser(null)}/>
        {toast && <Toast msg={toast} onDone={()=>setToast(null)}/>}
      </>
    );
  }

  // ── MLO PORTAL MODE ───────────────────────────────
  if (!mloUser) return <><GlobalStyles/><MLOLogin onAuthenticated={setMloUser} onBorrowerPortal={()=>setPortalMode('borrower')}/></>;

  const navItems = [
    {id:'dashboard',label:'Dashboard'},
    {id:'tasks',label:'Tasks'},
    {id:'loans',label:'Loans'},
    {id:'leads',label:'Leads'},
    {id:'pricing',label:'Pricing'},
    {id:'contacts',label:'Contacts'},
    {id:'reports',label:'Reports'},
  ];

  const pageContext = `Current page: ${page}. Active loans: ${loans.filter(l=>l.loan_status!=="Funded").length}. Total leads: ${leads.length}. Open tasks: ${tasks.filter(t=>!t.done).length}.`;

  return (
    <div>
      <GlobalStyles />

      <nav id="nav">
        <div className="nav-logo">
          <span>Jammie</span>
          <span className="nav-logo-sub">MORTGAGE</span>
        </div>
        <div className="nav-links">
          {navItems.map(({id,label}) => (
            <div key={id} className={`nav-link${page===id?" active":""}`} onClick={()=>setPage(id)}>{label}</div>
          ))}
        </div>
        <div className="nav-right">
          <button
            style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',border:'none',borderRadius:6,padding:'4px 10px',color:'white',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}
            onClick={()=>setAiOpen(p=>!p)}>
            ✨ Jammie AI
          </button>
          <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={()=>setMloUser(null)} title="Sign Out">
            <div className="nav-avatar">{mloUser.initials||'IC'}</div>
            <span style={{fontSize:11,color:'#94a3b8'}}>Sign Out</span>
          </div>
        </div>
      </nav>

      <div style={{marginRight: aiOpen ? 360 : 0, transition:'margin 0.25s cubic-bezier(0.4,0,0.2,1)'}}>
        {page === 'dashboard' && <DashboardPage loans={loans} leads={leads} tasks={tasks} />}
        {page === 'tasks'     && <TasksPage showToast={showToast} />}
        {page === 'loans'     && <LoansPage showToast={showToast} />}
        {page === 'leads'     && <LeadsPage showToast={showToast} />}
        {page === 'pricing'   && <PricingPage showToast={showToast} />}
        {page === 'contacts'  && <ContactsPage showToast={showToast} />}
        {page === 'reports'   && <ReportsPage loans={loans} leads={leads} />}
      </div>

      <AISidebar open={aiOpen} onClose={()=>setAiOpen(false)} context={pageContext} />
      {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
