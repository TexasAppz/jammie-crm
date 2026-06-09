import { useState, useEffect, useCallback } from 'react';
import './styles/globals.css';

import AISidebar    from './components/AISidebar';
import { Toast }    from './components/shared';
import { db }       from './data/db';

import DashboardPage from './pages/DashboardPage';
import TasksPage     from './pages/TasksPage';
import LoansPage     from './pages/LoansPage';
import LeadsPage     from './pages/LeadsPage';
import PricingPage   from './pages/PricingPage';
import ContactsPage  from './pages/ContactsPage';
import ReportsPage   from './pages/ReportsPage';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard'  },
  { id: 'tasks',     label: 'Tasks'      },
  { id: 'loans',     label: 'Loans'      },
  { id: 'leads',     label: 'Leads'      },
  { id: 'pricing',   label: 'Pricing'    },
  { id: 'contacts',  label: 'Contacts'   },
  { id: 'reports',   label: 'Reports'    },
];

export default function App() {
  const [page,    setPage]    = useState('dashboard');
  const [toast,   setToast]   = useState(null);
  const [aiOpen,  setAiOpen]  = useState(false);
  const [loans,   setLoans]   = useState([]);
  const [leads,   setLeads]   = useState([]);
  const [tasks,   setTasks]   = useState([]);

  useEffect(() => {
    db.loans.getAll().then(setLoans);
    db.leads.getAll().then(setLeads);
    db.tasks.getAll().then(setTasks);
  }, []);

  const showToast = useCallback(msg => setToast(msg), []);

  const aiContext = `Page: ${page}. Active loans: ${loans.filter(l => l.loan_status !== 'Funded').length}. Total leads: ${leads.length}. Open tasks: ${tasks.filter(t => !t.done).length}.`;

  return (
    <div>
      <nav id="nav">
        <div className="nav-logo">
          <span>Jammie</span>
          <span className="nav-logo-sub">MORTGAGE</span>
        </div>
        <div className="nav-links">
          {NAV_ITEMS.map(({ id, label }) => (
            <div key={id} className={`nav-link${page === id ? ' active' : ''}`} onClick={() => setPage(id)}>
              {label}
            </div>
          ))}
        </div>
        <div className="nav-right">
          <button
            onClick={() => setAiOpen(p => !p)}
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            ✨ Jammie AI
          </button>
          <div className="nav-avatar">IC</div>
        </div>
      </nav>

      <div style={{ marginRight: aiOpen ? 360 : 0, transition: 'margin 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
        {page === 'dashboard' && <DashboardPage loans={loans} leads={leads} tasks={tasks} />}
        {page === 'tasks'     && <TasksPage     showToast={showToast} />}
        {page === 'loans'     && <LoansPage     showToast={showToast} />}
        {page === 'leads'     && <LeadsPage     showToast={showToast} />}
        {page === 'pricing'   && <PricingPage   showToast={showToast} />}
        {page === 'contacts'  && <ContactsPage  showToast={showToast} />}
        {page === 'reports'   && <ReportsPage   loans={loans} leads={leads} />}
      </div>

      <AISidebar open={aiOpen} onClose={() => setAiOpen(false)} context={aiContext} />
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
