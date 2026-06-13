import { useState } from "react";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming","District of Columbia",
];

const MARITAL_STATUSES   = ["Please Select","Married","Unmarried","Separated"];
const VA_USE_TYPES        = ["Please Select","First Use","Subsequent Use","Exempt"];
const OWNERSHIP_TYPES     = ["Please Select","Own","Rent","Living Rent Free"];
const JOINED_OPTIONS      = ["Please Select","Spouse","Civil Union Partner","Other"];
const SAME_AS_OPTIONS     = ["Please Select","Borrower","Co-Borrower"];

function emptyBorrower(label = "Borrower") {
  return {
    label,
    // Personal
    firstName: "", middleName: "", lastName: "", suffix: "",
    ssn: "", dob: "", maritalStatus: "Please Select",
    numDependents: "", ageOfDependents: "",
    joinedToBorrower: "Please Select",
    taxFilingSameAs: "Please Select",
    presentAddressSameAs: "Please Select",
    citizenship: "us_citizen",
    isVeteran: false, vaUseType: "Please Select", isDisabledVeteran: false, isExempt: false,
    // Alternate names
    alternateNames: [],
    // Present Address
    presentAddr1: "", presentUnit: "", presentCity: "",
    presentState: "Please Select", presentZip: "", presentCountry: "United States",
    presentYears: "", presentOwnership: "Please Select",
    // Previous Address (shown if presentYears < 2)
    previousAddresses: [],
    // Mailing Address
    mailingSameAsPresent: true,
    mailingAddr1: "", mailingUnit: "", mailingCity: "",
    mailingState: "Please Select", mailingZip: "", mailingCountry: "United States",
  };
}

function emptyPreviousAddress() {
  return {
    addr1: "", unit: "", city: "", state: "Please Select",
    zip: "", country: "United States", years: "", ownership: "Please Select",
  };
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const S = {
  page: {
    padding: "24px",
    background: "var(--white, #fff)",
    minHeight: "calc(100vh - 46px)",
    fontFamily: "'DM Sans', sans-serif",
  },
  pageHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginBottom: 20,
  },
  pageTitle: { fontSize: 20, fontWeight: 600, color: "#111827" },
  // Borrower tabs
  tabBar: {
    display: "flex", alignItems: "center", gap: 0,
    borderBottom: "1px solid #e5e4e0", marginBottom: 24,
    overflowX: "auto",
  },
  tab: (active) => ({
    padding: "9px 20px", fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? "#2563EB" : "#6b7280",
    borderBottom: active ? "2px solid #2563EB" : "2px solid transparent",
    cursor: "pointer", whiteSpace: "nowrap", background: "none", border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: active ? "#2563EB" : "transparent",
    transition: "all 0.15s",
  }),
  addBorrowerBtn: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "6px 14px", borderRadius: 5, fontSize: 13, fontWeight: 500,
    background: "#2563EB", color: "white", border: "none", cursor: "pointer",
    marginLeft: "auto", whiteSpace: "nowrap", flexShrink: 0,
  },
  removeBorrowerBtn: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500,
    background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5",
    cursor: "pointer", marginLeft: 8,
  },
  // Section
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13, fontWeight: 600, color: "#111827",
    marginBottom: 16, paddingBottom: 8,
    borderBottom: "1px solid #e5e4e0",
    display: "flex", alignItems: "center", gap: 8,
  },
  sectionNum: {
    width: 20, height: 20, background: "#2563EB", color: "white",
    borderRadius: "50%", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0,
  },
  // Grid
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 },
  grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 },
  full:  { gridColumn: "1 / -1" },
  // Form elements
  group: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 11.5, fontWeight: 500, color: "#4b5563", letterSpacing: "0.02em" },
  labelReq: { fontSize: 11.5, fontWeight: 500, color: "#4b5563", letterSpacing: "0.02em" },
  input: {
    padding: "7px 10px", border: "1px solid #e5e4e0", borderRadius: 5,
    fontSize: 13, color: "#111827", background: "#fff",
    transition: "border-color 0.15s, box-shadow 0.15s", width: "100%",
    outline: "none",
  },
  select: {
    padding: "7px 10px", border: "1px solid #e5e4e0", borderRadius: 5,
    fontSize: 13, color: "#111827", background: "#fff", width: "100%",
    outline: "none",
  },
  // Citizenship radio group
  radioGroup: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  radioRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", cursor: "pointer" },
  radio: { accentColor: "#2563EB", width: 14, height: 14, cursor: "pointer" },
  // Checkbox
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", cursor: "pointer" },
  checkbox: { accentColor: "#2563EB", width: 14, height: 14, cursor: "pointer" },
  // Previous address card
  prevAddrCard: {
    border: "1px solid #e5e4e0", borderRadius: 8,
    padding: 16, marginBottom: 12, background: "#f9f9f8",
  },
  prevAddrHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12, fontSize: 12, fontWeight: 600, color: "#4b5563",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  // Alternate name row
  altNameRow: {
    display: "flex", alignItems: "center", gap: 10,
    border: "1px solid #e5e4e0", borderRadius: 6, padding: "10px 14px",
    marginBottom: 8, background: "#f9f9f8",
  },
  // Warning banner
  warning: {
    background: "#fffbeb", border: "1px solid #fde68a",
    borderRadius: 6, padding: "8px 12px",
    fontSize: 12, color: "#92400e", marginBottom: 14,
    display: "flex", alignItems: "center", gap: 6,
  },
  // Primary badge
  primaryBadge: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
    background: "#eff6ff", color: "#1d4ed8",
  },
  // Action buttons row
  actionRow: {
    display: "flex", alignItems: "center", justifyContent: "flex-end",
    gap: 8, marginTop: 24, paddingTop: 16, borderTop: "1px solid #e5e4e0",
  },
  btnSecondary: {
    padding: "7px 16px", borderRadius: 5, fontSize: 13, fontWeight: 500,
    background: "#fff", color: "#4b5563", border: "1px solid #e5e4e0", cursor: "pointer",
  },
  btnPrimary: {
    padding: "7px 16px", borderRadius: 5, fontSize: 13, fontWeight: 500,
    background: "#2563EB", color: "white", border: "none", cursor: "pointer",
  },
  btnGhost: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 12px", borderRadius: 5, fontSize: 12, fontWeight: 500,
    background: "transparent", color: "#4b5563", border: "1px solid #e5e4e0", cursor: "pointer",
  },
  btnDanger: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500,
    background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", cursor: "pointer",
  },
};

// ─────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────
function Field({ label, required, children, style }) {
  return (
    <div style={{ ...S.group, ...style }}>
      <label style={S.label}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style, ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ ...S.input, ...style }}
      onFocus={e => { e.target.style.borderColor = "#2563EB"; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
      onBlur={e => { e.target.style.borderColor = "#e5e4e0"; e.target.style.boxShadow = "none"; }}
      {...rest}
    />
  );
}

function Select({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{ ...S.select, ...style }}
      onFocus={e => { e.target.style.borderColor = "#2563EB"; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
      onBlur={e => { e.target.style.borderColor = "#e5e4e0"; e.target.style.boxShadow = "none"; }}
    >
      {children}
    </select>
  );
}

// Address block reused for Present, Previous, Mailing
function AddressBlock({ prefix, data, onChange, disabled }) {
  const f = (key) => (e) => onChange(key, e.target.value);
  const inputStyle = disabled ? { ...S.input, background: "#f3f4f6", color: "#9ca3af" } : S.input;
  const selectStyle = disabled ? { ...S.select, background: "#f3f4f6", color: "#9ca3af" } : S.select;

  return (
    <div>
      <div style={{ ...S.grid2, marginBottom: 14 }}>
        <Field label="Address Line 1" required={!disabled}>
          <input type="text" value={data.addr1 || ""} onChange={f("addr1")}
            placeholder="Street address" style={inputStyle} disabled={disabled}
            onFocus={e => !disabled && (e.target.style.borderColor = "#2563EB")}
            onBlur={e => !disabled && (e.target.style.borderColor = "#e5e4e0")} />
        </Field>
        <Field label="Unit #">
          <input type="text" value={data.unit || ""} onChange={f("unit")}
            placeholder="Apt, Suite, etc." style={inputStyle} disabled={disabled}
            onFocus={e => !disabled && (e.target.style.borderColor = "#2563EB")}
            onBlur={e => !disabled && (e.target.style.borderColor = "#e5e4e0")} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="City" required={!disabled}>
          <input type="text" value={data.city || ""} onChange={f("city")}
            placeholder="City" style={inputStyle} disabled={disabled}
            onFocus={e => !disabled && (e.target.style.borderColor = "#2563EB")}
            onBlur={e => !disabled && (e.target.style.borderColor = "#e5e4e0")} />
        </Field>
        <Field label="State">
          <select value={data.state || "Please Select"} onChange={f("state")}
            style={selectStyle} disabled={disabled}>
            <option>Please Select</option>
            {US_STATES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="ZIP Code">
          <input type="text" value={data.zip || ""} onChange={f("zip")}
            placeholder="00000" maxLength={10} style={inputStyle} disabled={disabled}
            onFocus={e => !disabled && (e.target.style.borderColor = "#2563EB")}
            onBlur={e => !disabled && (e.target.style.borderColor = "#e5e4e0")} />
        </Field>
        <Field label="Country">
          <select value={data.country || "United States"} onChange={f("country")}
            style={selectStyle} disabled={disabled}>
            <option>United States</option>
            <option>Other</option>
          </select>
        </Field>
      </div>
      {/* Time + Ownership only for non-mailing */}
      {(data.years !== undefined) && (
        <div style={{ ...S.grid2 }}>
          <Field label="Time at Residence (Years)">
            <input type="number" value={data.years || ""} onChange={f("years")}
              placeholder="e.g. 2" step="0.1" min="0" style={inputStyle} disabled={disabled}
              onFocus={e => !disabled && (e.target.style.borderColor = "#2563EB")}
              onBlur={e => !disabled && (e.target.style.borderColor = "#e5e4e0")} />
          </Field>
          <Field label="Ownership">
            <select value={data.ownership || "Please Select"} onChange={f("ownership")}
              style={selectStyle} disabled={disabled}>
              {OWNERSHIP_TYPES.map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BORROWER FORM
// ─────────────────────────────────────────────────────────────────
function BorrowerForm({ borrower, allBorrowers, onChange }) {
  const upd = (key, val) => onChange({ ...borrower, [key]: val });
  const updAddr = (section, key, val) => onChange({ ...borrower, [section]: { ...borrower[section], [key]: val } });

  const needsPrevious = parseFloat(borrower.presentYears) < 2 && borrower.presentYears !== "";

  // Previous addresses helpers
  const addPrevAddr = () => onChange({ ...borrower, previousAddresses: [...borrower.previousAddresses, emptyPreviousAddress()] });
  const removePrevAddr = (i) => onChange({ ...borrower, previousAddresses: borrower.previousAddresses.filter((_, idx) => idx !== i) });
  const updPrevAddr = (i, key, val) => {
    const updated = borrower.previousAddresses.map((a, idx) => idx === i ? { ...a, [key]: val } : a);
    onChange({ ...borrower, previousAddresses: updated });
  };

  // Alternate names helpers
  const addAltName = () => onChange({ ...borrower, alternateNames: [...borrower.alternateNames, ""] });
  const removeAltName = (i) => onChange({ ...borrower, alternateNames: borrower.alternateNames.filter((_, idx) => idx !== i) });
  const updAltName = (i, val) => {
    const updated = borrower.alternateNames.map((n, idx) => idx === i ? val : n);
    onChange({ ...borrower, alternateNames: updated });
  };

  // Present address object shape
  const presentAddrObj = {
    addr1: borrower.presentAddr1, unit: borrower.presentUnit,
    city: borrower.presentCity, state: borrower.presentState,
    zip: borrower.presentZip, country: borrower.presentCountry,
    years: borrower.presentYears, ownership: borrower.presentOwnership,
  };
  const updPresent = (key, val) => {
    const keyMap = { addr1:"presentAddr1", unit:"presentUnit", city:"presentCity", state:"presentState", zip:"presentZip", country:"presentCountry", years:"presentYears", ownership:"presentOwnership" };
    upd(keyMap[key], val);
  };

  const mailingAddrObj = {
    addr1: borrower.mailingAddr1, unit: borrower.mailingUnit,
    city: borrower.mailingCity, state: borrower.mailingState,
    zip: borrower.mailingZip, country: borrower.mailingCountry,
  };
  const mailingDisabled = borrower.mailingSameAsPresent;
  const effectiveMailingAddr = mailingDisabled ? { ...presentAddrObj, years: undefined, ownership: undefined } : { ...mailingAddrObj };
  const updMailing = (key, val) => {
    const keyMap = { addr1:"mailingAddr1", unit:"mailingUnit", city:"mailingCity", state:"mailingState", zip:"mailingZip", country:"mailingCountry" };
    upd(keyMap[key], val);
  };

  return (
    <div>
      {/* ── 1. PERSONAL INFORMATION ─────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          <span style={S.sectionNum}>1</span>
          Personal Information
          {borrower.label === "Borrower" && <span style={{ ...S.primaryBadge, marginLeft: 4 }}>Primary</span>}
        </div>

        {/* Name row */}
        <div style={{ ...S.grid4, marginBottom: 14 }}>
          <Field label="First Name" required><Input value={borrower.firstName} onChange={e => upd("firstName", e.target.value)} placeholder="First" /></Field>
          <Field label="Middle Name"><Input value={borrower.middleName} onChange={e => upd("middleName", e.target.value)} placeholder="Middle" /></Field>
          <Field label="Last Name" required><Input value={borrower.lastName} onChange={e => upd("lastName", e.target.value)} placeholder="Last" /></Field>
          <Field label="Suffix"><Input value={borrower.suffix} onChange={e => upd("suffix", e.target.value)} placeholder="Jr., Sr., etc." /></Field>
        </div>

        {/* SSN, DOB, Marital, Dependents */}
        <div style={{ ...S.grid4, marginBottom: 14 }}>
          <Field label="Social Security Number" required>
            <Input value={borrower.ssn} onChange={e => upd("ssn", e.target.value)} placeholder="000-00-0000" maxLength={11} />
          </Field>
          <Field label="Date of Birth" required>
            <Input type="date" value={borrower.dob} onChange={e => upd("dob", e.target.value)} />
          </Field>
          <Field label="Marital Status">
            <Select value={borrower.maritalStatus} onChange={e => upd("maritalStatus", e.target.value)}>
              {MARITAL_STATUSES.map(m => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="No. of Dependents">
            <Input type="number" min="0" value={borrower.numDependents} onChange={e => upd("numDependents", e.target.value)} placeholder="0" />
          </Field>
        </div>

        {/* Age of Dependents, Joined to, Tax Filing, Present Address Same As */}
        <div style={{ ...S.grid4, marginBottom: 14 }}>
          <Field label="Age of Dependents">
            <Input value={borrower.ageOfDependents} onChange={e => upd("ageOfDependents", e.target.value)} placeholder="e.g. 5, 8, 12" />
          </Field>
          <Field label="Joined to Borrower">
            <Select value={borrower.joinedToBorrower} onChange={e => upd("joinedToBorrower", e.target.value)}>
              {JOINED_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Tax Filing Address Same As">
            <Select value={borrower.taxFilingSameAs} onChange={e => upd("taxFilingSameAs", e.target.value)}>
              {SAME_AS_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Present Address Same As">
            <Select value={borrower.presentAddressSameAs} onChange={e => upd("presentAddressSameAs", e.target.value)}>
              {SAME_AS_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </Select>
          </Field>
        </div>

        {/* Citizenship + Veteran side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Citizenship */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: "#4b5563", marginBottom: 8 }}>Citizenship</div>
            <div style={S.radioGroup}>
              {[
                { val: "us_citizen",          label: "U.S. Citizen" },
                { val: "permanent_resident",  label: "Permanent Resident Alien" },
                { val: "non_permanent",       label: "Non-Permanent Resident Alien" },
                { val: "foreign_national",    label: "Foreign National" },
              ].map(opt => (
                <label key={opt.val} style={S.radioRow}>
                  <input type="radio" name={`citizenship_${borrower.label}`} value={opt.val}
                    checked={borrower.citizenship === opt.val}
                    onChange={() => upd("citizenship", opt.val)}
                    style={S.radio} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Veteran */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: "#4b5563", marginBottom: 8 }}>Veteran Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={S.checkRow}>
                <input type="checkbox" checked={borrower.isVeteran} onChange={e => upd("isVeteran", e.target.checked)} style={S.checkbox} />
                Veteran?
              </label>
              {borrower.isVeteran && (
                <>
                  <div style={S.group}>
                    <label style={S.label}>VA Use Type</label>
                    <Select value={borrower.vaUseType} onChange={e => upd("vaUseType", e.target.value)}>
                      {VA_USE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </Select>
                  </div>
                  <label style={S.checkRow}>
                    <input type="checkbox" checked={borrower.isDisabledVeteran} onChange={e => upd("isDisabledVeteran", e.target.checked)} style={S.checkbox} />
                    Disabled Veteran?
                  </label>
                  <label style={S.checkRow}>
                    <input type="checkbox" checked={borrower.isExempt} onChange={e => upd("isExempt", e.target.checked)} style={S.checkbox} />
                    Exempt
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Alternate Names */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Alternate Names
            </div>
            <button style={S.btnGhost} onClick={addAltName}>+ Add Alternate Name</button>
          </div>
          {borrower.alternateNames.length === 0 && (
            <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>No alternate names added.</div>
          )}
          {borrower.alternateNames.map((name, i) => (
            <div key={i} style={S.altNameRow}>
              <Input value={name} onChange={e => updAltName(i, e.target.value)} placeholder={`Alternate name ${i + 1}`} style={{ flex: 1 }} />
              <button style={S.btnDanger} onClick={() => removeAltName(i)}>✕ Remove</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. ADDRESS HISTORY ──────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}><span style={S.sectionNum}>2</span>Address History</div>

        {/* Present Address */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 14 }}>Present Address</div>
          <AddressBlock data={presentAddrObj} onChange={updPresent} />
        </div>

        {/* Auto-show previous if < 2 years */}
        {needsPrevious && (
          <div style={{ ...S.warning }}>
            ⚠ Borrower has resided at present address for less than 2 years. Previous address details are required.
          </div>
        )}

        {(needsPrevious || borrower.previousAddresses.length > 0) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 14 }}>Previous Address Details</div>
            {borrower.previousAddresses.map((prev, i) => (
              <div key={i} style={S.prevAddrCard}>
                <div style={S.prevAddrHeader}>
                  <span>Previous Address {borrower.previousAddresses.length > 1 ? i + 1 : ""}</span>
                  <button style={S.btnDanger} onClick={() => removePrevAddr(i)}>✕ Delete</button>
                </div>
                <AddressBlock
                  data={prev}
                  onChange={(key, val) => updPrevAddr(i, key, val)}
                />
              </div>
            ))}
            <button style={S.btnGhost} onClick={addPrevAddr}>+ Add Previous Address</button>
          </div>
        )}

        {/* Mailing Address */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 10 }}>Mailing Address</div>
          <label style={{ ...S.checkRow, marginBottom: 14 }}>
            <input type="checkbox" checked={borrower.mailingSameAsPresent}
              onChange={e => upd("mailingSameAsPresent", e.target.checked)} style={S.checkbox} />
            Same As Present Address
          </label>
          <AddressBlock
            data={effectiveMailingAddr}
            onChange={updMailing}
            disabled={mailingDisabled}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function Form1003PersonalInfo({ onSave, onCancel }) {
  const [borrowers, setBorrowers] = useState([emptyBorrower("Borrower")]);
  const [activeTab, setActiveTab] = useState(0);
  const [saved, setSaved] = useState(false);

  const addBorrower = () => {
    const labels = ["Co-Borrower", "Borrower 3", "Borrower 4", "Borrower 5"];
    const label = labels[borrowers.length - 1] || `Borrower ${borrowers.length + 1}`;
    setBorrowers(p => [...p, emptyBorrower(label)]);
    setActiveTab(borrowers.length);
  };

  const removeBorrower = (i) => {
    if (borrowers.length <= 1) return;
    const updated = borrowers.filter((_, idx) => idx !== i);
    setBorrowers(updated);
    setActiveTab(Math.min(activeTab, updated.length - 1));
  };

  const updateBorrower = (i, data) => {
    setBorrowers(p => p.map((b, idx) => idx === i ? data : b));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (onSave) onSave(borrowers);
  };

  return (
    <div style={S.page}>
      {/* Page Header */}
      <div style={S.pageHeader}>
        <div>
          <div style={S.pageTitle}>1003 — Personal Information</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            Uniform Residential Loan Application · Section III
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onCancel && (
            <button style={S.btnSecondary} onClick={onCancel}>Cancel</button>
          )}
          <button style={S.btnPrimary} onClick={handleSave}>
            {saved ? "✓ Saved" : "Save & Continue"}
          </button>
        </div>
      </div>

      {/* Borrower Tabs */}
      <div style={S.tabBar}>
        {borrowers.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <button style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>
              {b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.label}
            </button>
            {i > 0 && activeTab === i && (
              <button style={{ ...S.btnDanger, padding: "2px 6px", fontSize: 11, marginLeft: -2, marginRight: 4 }}
                onClick={() => removeBorrower(i)} title={`Remove ${b.label}`}>✕</button>
            )}
          </div>
        ))}
        <button style={{ ...S.addBorrowerBtn, marginLeft: 8 }} onClick={addBorrower}>
          + Add New Borrower
        </button>
      </div>

      {/* Active Borrower Form */}
      <BorrowerForm
        key={activeTab}
        borrower={borrowers[activeTab]}
        allBorrowers={borrowers}
        onChange={(data) => updateBorrower(activeTab, data)}
      />

      {/* Bottom action row */}
      <div style={S.actionRow}>
        {onCancel && <button style={S.btnSecondary} onClick={onCancel}>Cancel</button>}
        <button style={S.btnPrimary} onClick={handleSave}>
          {saved ? "✓ Saved" : "Save & Continue →"}
        </button>
      </div>
    </div>
  );
}
