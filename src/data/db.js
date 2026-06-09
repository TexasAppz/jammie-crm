// ─── MOCK DATABASE ───────────────────────────────────────────────
// Replace these arrays with Supabase / REST API calls when ready.

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

export const contacts = [
  { id:1, name:"Sarah Mitchell", role:"Real Estate Agent", company:"Century 21", phone:"703-555-1234", email:"s.mitchell@c21.com", type:"Realtor", color:"#2563EB", deals:4 },
  { id:2, name:"Tom Reynolds", role:"Title Officer", company:"First American Title", phone:"571-555-2345", email:"t.reynolds@fat.com", type:"Title", color:"#7c3aed", deals:6 },
  { id:3, name:"Janet Cruz", role:"Loan Processor", company:"PRMG", phone:"240-555-3456", email:"j.cruz@prmg.com", type:"Lender", color:"#0891b2", deals:8 },
  { id:4, name:"Mike Hanson", role:"Home Inspector", company:"Hanson Inspections", phone:"301-555-4567", email:"mike@hansoninsp.com", type:"Inspector", color:"#059669", deals:3 },
  { id:5, name:"Lisa Wong", role:"Real Estate Agent", company:"Keller Williams", phone:"703-555-5678", email:"l.wong@kw.com", type:"Realtor", color:"#d97706", deals:7 },
  { id:6, name:"Carlos Mendez", role:"Underwriter", company:"UWM", phone:"571-555-6789", email:"c.mendez@uwm.com", type:"Lender", color:"#dc2626", deals:12 },
];

let _nextLoanId = 9, _nextLeadId = 6, _nextTaskId = 8;

export const db = {
  loans: {
    getAll: () => Promise.resolve([..._loans]),
    insert: r => { const n = { ...r, id: _nextLoanId++, updated_at: new Date().toISOString() }; _loans.push(n); return Promise.resolve(n); },
    update: (id, r) => { _loans = _loans.map(l => l.id === id ? { ...l, ...r, updated_at: new Date().toISOString() } : l); return Promise.resolve(); },
    delete: id => { _loans = _loans.filter(l => l.id !== id); return Promise.resolve(); },
  },
  leads: {
    getAll: () => Promise.resolve([..._leads]),
    insert: r => { const n = { ...r, id: _nextLeadId++, updated_at: new Date().toISOString() }; _leads.push(n); return Promise.resolve(n); },
    update: (id, r) => { _leads = _leads.map(l => l.id === id ? { ...l, ...r, updated_at: new Date().toISOString() } : l); return Promise.resolve(); },
    delete: id => { _leads = _leads.filter(l => l.id !== id); return Promise.resolve(); },
  },
  tasks: {
    getAll: () => Promise.resolve([..._tasks]),
    insert: r => { const n = { ...r, id: _nextTaskId++, created_at: new Date().toISOString() }; _tasks.push(n); return Promise.resolve(n); },
    update: (id, r) => { _tasks = _tasks.map(t => t.id === id ? { ...t, ...r } : t); return Promise.resolve(); },
    delete: id => { _tasks = _tasks.filter(t => t.id !== id); return Promise.resolve(); },
  },
};

export const LOAN_STATUSES = ["App Intake","Loan Setup","Pre-Approved","Processing","Closing","Funded"];
export const LOAN_PURPOSES  = ["Purchase","Refinance","Cash-Out Refinance","Investment"];
export const LOAN_PRODUCTS  = ["FHA 30 Year Fixed","CONF CONV 30 Year","NON-QM Fixed 30","VA 30 Year Fixed","ARM 5/1","TBD"];
export const LENDERS        = ["PRMG","UWM","NQM FUNDING","Caliber","Freedom Mortgage","No Lender"];
export const LEAD_STATUSES  = ["New","Contacted","Qualified","In Progress","Closed Won","Closed Lost"];
export const LEAD_SOURCES   = ["--","Website","Zillow","Realtor","Referral","Social Media","Direct Mail","Other"];
export const LEAD_PURPOSES  = ["Purchase","Refinance","Cash-Out Refinance","Investment","Construction"];

export const LENDER_MATRIX = {
  Conventional: [
    { lender:"UWM",     rate:6.875, pts:0.0, apr:6.932 },
    { lender:"PRMG",    rate:6.990, pts:0.5, apr:7.058 },
    { lender:"Caliber", rate:6.750, pts:1.0, apr:6.925 },
    { lender:"Freedom", rate:7.125, pts:0.0, apr:7.181 },
  ],
  FHA: [
    { lender:"PRMG",    rate:7.125, pts:0.0,  apr:8.12 },
    { lender:"UWM",     rate:7.250, pts:0.0,  apr:8.24 },
    { lender:"Caliber", rate:6.990, pts:0.75, apr:8.05 },
    { lender:"Freedom", rate:7.375, pts:0.0,  apr:8.35 },
  ],
  "NON-QM": [
    { lender:"NQM FUNDING", rate:7.750, pts:0.0, apr:7.93 },
    { lender:"Angel Oak",   rate:8.125, pts:0.0, apr:8.30 },
    { lender:"Citadel",     rate:7.500, pts:1.0, apr:7.78 },
  ],
  VA: [
    { lender:"PRMG",    rate:6.500, pts:0.0, apr:6.72 },
    { lender:"UWM",     rate:6.625, pts:0.0, apr:6.84 },
    { lender:"Freedom", rate:6.375, pts:0.5, apr:6.65 },
  ],
};
