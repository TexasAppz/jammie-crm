import { useState, useEffect } from 'react';
import { db } from '../data/db';

const TODAY = '2026-05-25';

export default function TasksPage({ showToast }) {
  const [tasks, setTasks] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', borrower: '', loan: '', due: '', priority: 'medium' });

  useEffect(() => { db.tasks.getAll().then(setTasks); }, []);

  const toggle = async task => {
    await db.tasks.update(task.id, { done: !task.done });
    setTasks(p => p.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
  };

  const deleteTask = async id => {
    await db.tasks.delete(id);
    setTasks(p => p.filter(t => t.id !== id));
    showToast('Task deleted');
  };

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    const n = await db.tasks.insert({ ...newTask, done: false });
    setTasks(p => [n, ...p]);
    setNewTask({ title: '', borrower: '', loan: '', due: '', priority: 'medium' });
    setShowAdd(false);
    showToast('Task added');
  };

  const overdue   = tasks.filter(t => !t.done && t.due < TODAY);
  const today     = tasks.filter(t => !t.done && t.due === TODAY);
  const upcoming  = tasks.filter(t => !t.done && t.due > TODAY);
  const done      = tasks.filter(t => t.done);

  const upd = k => e => setNewTask(p => ({ ...p, [k]: e.target.value }));

  const TaskList = ({ items }) => {
    if (!items.length) return <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No tasks</div>;
    return items.map(t => (
      <div key={t.id} className={`task-item${t.done ? ' done' : ''}`}>
        <input type="checkbox" className="task-check" checked={t.done} onChange={() => toggle(t)} />
        <div className="task-content">
          <div className="task-title" style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
          <div className="task-meta">
            {t.borrower && <span>👤 {t.borrower}</span>}
            {t.loan     && <span>🏠 #{t.loan}</span>}
            {t.due      && <span>📅 {t.due}</span>}
          </div>
        </div>
        <span className={`task-priority ${t.priority}`}>{t.priority}</span>
        <button className="btn-icon" onClick={() => deleteTask(t.id)}>🗑</button>
      </div>
    ));
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Tasks</span>
        <div className="page-header-right">
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{tasks.filter(t => !t.done).length} open · {overdue.length} overdue</span>
          <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>+ Add Task</button>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="form-group form-full">
              <label className="form-label">Task Title *</label>
              <input className="form-input" value={newTask.title} onChange={upd('title')} placeholder="What needs to be done?" />
            </div>
            <div className="form-group">
              <label className="form-label">Borrower</label>
              <input className="form-input" value={newTask.borrower} onChange={upd('borrower')} placeholder="Borrower name" />
            </div>
            <div className="form-group">
              <label className="form-label">Loan #</label>
              <input className="form-input" value={newTask.loan} onChange={upd('loan')} placeholder="Loan number" />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" value={newTask.due} onChange={upd('due')} />
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-select" value={newTask.priority} onChange={upd('priority')}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={addTask}>Add Task</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {overdue.length  > 0 && <Section title={`⚠ Overdue (${overdue.length})`} red><TaskList items={overdue} /></Section>}
      <Section title={`Today (${today.length})`}><TaskList items={today} /></Section>
      <Section title={`Upcoming (${upcoming.length})`}><TaskList items={upcoming} /></Section>
      {done.length > 0 && <Section title={`Completed (${done.length})`}><TaskList items={done} /></Section>}
    </div>
  );
}

function Section({ title, red, children }) {
  return (
    <div className="task-section">
      <div className="task-section-title" style={red ? { color: '#b91c1c' } : {}}>{title}</div>
      {children}
    </div>
  );
}
