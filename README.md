# Jammie Mortgage CRM

A full-featured Mortgage Loan Originator (MLO) CRM built with React + Vite.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open in browser
http://localhost:5173
```

## Build for Production

```bash
npm run build
npm run preview   # preview the production build locally
```

## Project Structure

```
src/
├── data/
│   └── db.js              # Mock database + constants (swap for Supabase here)
├── components/
│   ├── shared.jsx          # StatusBadge, ScoreBadge, Toast, ConfirmModal
│   └── AISidebar.jsx       # Jammie AI chat sidebar
├── pages/
│   ├── DashboardPage.jsx
│   ├── TasksPage.jsx
│   ├── LoansPage.jsx
│   ├── LeadsPage.jsx
│   ├── PricingPage.jsx
│   ├── ContactsPage.jsx
│   └── ReportsPage.jsx
├── styles/
│   └── globals.css         # All global styles + CSS variables
├── App.jsx                 # Root component + nav routing
└── main.jsx                # React entry point
```

## AI Features

All AI features call the Anthropic API directly from the browser.
They work out of the box in Claude.ai artifacts (API key injected automatically).

To use in a standalone deployment, set up a proxy server that adds your API key,
or use an environment variable approach with a backend.

## Pages

| Page       | Description |
|------------|-------------|
| Dashboard  | KPIs, pipeline chart, rate snapshot, activity feed, hot leads |
| Tasks      | Overdue / Today / Upcoming task manager with CRUD |
| Loans      | Full loan pipeline table with add/edit/delete |
| Leads      | Lead tracking with AI email drafting & scoring |
| Pricing    | Rate calculator + lender matrix + AI lock recommendation |
| Contacts   | Realtor, lender, title, inspector directory |
| Reports    | Pipeline analytics + AI executive summary |
# jammie-crm
# jammie-crm
