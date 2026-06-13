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
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => { db.loans.getAll().then(setLoans); }, []);

  const filtered = useMemo(() => {
    let r = [...loans];
    if (statusFilter !== "All") r = r.filter(l => l.loan_status === statusFilter);
    if (search) r = r.filter(l => (l.borrower||"").toLowerCase().includes(search.toLowerCase()) || (l.loan_number||"").includes(search));
    return r.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }, [loans, search, statusFilter]);

  const handleAdd = async data => { const n = await db.loans.insert(data); setLoans(p=>[n,...p]); setShowAdd(false); showToast("Loan created"); };
  const handleEdit = async data => { await db.loans.update(editItem.id, data); setLoans(p=>p.map(l=>l.id===editItem.id?{...l,...data}:l)); setEditItem(null); showToast("Loan updated"); };
  const handleDelete = async () => { await db.loans.delete(confirmDel.id); setLoans(p=>p.filter(l=>l.id!==confirmDel.id)); setConfirmDel(null); showToast("Loan deleted"); };

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
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ New Loan</button>
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
                <td><div className="td-primary" onClick={()=>setEditItem(l)}>{l.borrower}</div><div className="td-sub">{l.subject_property}</div></td>
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
                    <button className="btn-icon" title="Edit" onClick={()=>setEditItem(l)}>✏️</button>
                    <button className="btn-icon" title="Delete" onClick={()=>setConfirmDel(l)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10}><div className="empty-state"><div className="empty-icon">🏠</div><div className="empty-title">No loans found</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">New Loan</span><button className="modal-close" onClick={()=>setShowAdd(false)}>×</button></div>
            <div className="modal-body"><LoanForm onSave={handleAdd} onClose={()=>setShowAdd(false)} /></div>
          </div>
        </div>
      )}
      {editItem && (
        <div className="modal-overlay" onClick={()=>setEditItem(null)}>
          <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Edit Loan — {editItem.borrower}</span><button className="modal-close" onClick={()=>setEditItem(null)}>×</button></div>
            <div className="modal-body"><LoanForm initial={editItem} onSave={handleEdit} onClose={()=>setEditItem(null)} /></div>
          </div>
        </div>
      )}
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
// APP ROOT
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [loans, setLoans] = useState([]);
  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    db.loans.getAll().then(setLoans);
    db.leads.getAll().then(setLeads);
    db.tasks.getAll().then(setTasks);
  }, []);

  const showToast = useCallback(msg => setToast(msg), []);

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
          <div className="nav-avatar">IC</div>
        </div>
      </nav>

      <div style={{marginRight: aiOpen ? 360 : 0, transition:'margin 0.25s cubic-bezier(0.4,0,0.2,1)'}}>
        {page === 'dashboard' && <DashboardPage loans={loans} leads={leads} tasks={tasks} />}
        {page === 'tasks' && <TasksPage showToast={showToast} />}
        {page === 'loans' && <LoansPage showToast={showToast} />}
        {page === 'leads' && <LeadsPage showToast={showToast} />}
        {page === 'pricing' && <PricingPage showToast={showToast} />}
        {page === 'contacts' && <ContactsPage showToast={showToast} />}
        {page === 'reports' && <ReportsPage loans={loans} leads={leads} />}
      </div>

      <AISidebar open={aiOpen} onClose={()=>setAiOpen(false)} context={pageContext} />

      {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
