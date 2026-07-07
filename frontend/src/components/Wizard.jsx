import React, { useState, useRef } from 'react';
import { 
  Building2, Users, DollarSign, Briefcase, AlertTriangle, HelpCircle, 
  CheckCircle2, BookOpen, AlertCircle, FileText, ArrowRight, Loader2,
  ChevronRight, Info
} from 'lucide-react';

export default function Wizard({ formData, onChange, activeTab, onNext, onPrev, validationResults }) {
  const [draftingFields, setDraftingFields] = useState({});

  const handleAIDraft = async (key) => {
    setDraftingFields(prev => ({ ...prev, [key]: true }));
    try {
      const response = await fetch('http://127.0.0.1:8000/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_key: key, form_data: formData })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.draft) onChange(key, data.draft);
      }
    } catch (err) {
      console.error('Error contacting draft API:', err);
    } finally {
      setDraftingFields(prev => ({ ...prev, [key]: false }));
    }
  };

  const renderTooltip = (regText) => (
    <div className="group relative inline-block ml-1.5 cursor-pointer align-middle select-none">
      <HelpCircle className="w-3.5 h-3.5 text-slate-600 hover:text-sky-400 transition-colors" />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 w-64 -translate-x-1/2 rounded-md bg-[#0a1020] px-3 py-2.5 text-[11px] font-normal leading-relaxed text-slate-300 opacity-0 shadow-2xl transition-opacity duration-200 group-hover:opacity-100 border border-[#1e3054]">
        <div className="font-bold text-sky-400 uppercase tracking-wider mb-1 text-[9px]">SEBI ICDR Requirement</div>
        {regText}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a1020]"></div>
      </div>
    </div>
  );

  const getFieldValidation = (key, value) => {
    if (value === undefined || value === null || value === '') return { status: 'empty' };

    if (key === 'pan') {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(value)) return { status: 'error', message: 'Invalid PAN structure. Must be 5 letters, 4 digits, 1 letter (e.g. AAACA1234A).' };
      if (formData.pan_name && formData.company_name && formData.pan_name.toLowerCase() !== formData.company_name.toLowerCase()) {
        return { status: 'warning', message: 'Company name on PAN does not match RoC registered name.' };
      }
    }
    if (key === 'authorized_capital') {
      if (formData.paid_up_capital_pre && Number(formData.paid_up_capital_pre) > Number(value)) {
        return { status: 'error', message: 'Pre-Issue Paid-up Capital cannot exceed Authorized Share Capital.' };
      }
    }
    if (key === 'promoter_shareholding_pre_pct') {
      if (Number(value) < 20) return { status: 'warning', message: 'SEBI ICDR Reg 246 requires promoters to hold at least 20% post-issue. Please verify.' };
      if (Number(value) > 100) return { status: 'error', message: 'Percentage value cannot exceed 100%.' };
    }
    if (key === 'auditor_membership') {
      if (value.length < 5) return { status: 'error', message: 'Membership number appears too short — please verify.' };
    }
    const objectFields = ['expansion_amount', 'working_capital_amount', 'debt_repayment_amount', 'general_corp_amount', 'issue_expenses'];
    if (objectFields.includes(key) && formData.issue_size) {
      const sum = objectFields.reduce((acc, f) => acc + (Number(formData[f]) || 0), 0);
      if (Math.abs(sum - Number(formData.issue_size)) > 0.01) {
        return { status: 'warning', message: `Objects sum ₹${sum.toFixed(2)} Cr ≠ Issue Size ₹${Number(formData.issue_size).toFixed(2)} Cr.` };
      }
    }
    return { status: 'valid' };
  };

  /* ── Character counter helper ── */
  const CharCounter = ({ value, soft = 300, hard = 600 }) => {
    const len = (value || '').length;
    if (len === 0) return null;
    const cls = len > hard ? 'text-rose-400' : len > soft ? 'text-amber-400' : 'text-slate-500';
    return (
      <span className={`text-[10px] font-mono font-semibold tabular-nums transition-colors ${cls}`}>
        {len.toLocaleString()} chars
      </span>
    );
  };

  /* ── Section sub-group header ── */
  const SubGroupHeader = ({ icon: Icon, label, note }) => (
    <div className="flex items-center gap-2 mt-5 mb-3 pb-2 border-b border-[#1a2a40]">
      {Icon && <Icon className="w-3.5 h-3.5 text-sky-500/70 shrink-0" />}
      <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400/70">{label}</span>
      {note && <span className="text-[10px] text-slate-500 font-medium ml-1">{note}</span>}
    </div>
  );

  const renderInput = (key, label, type = 'text', tooltip = '', placeholder = '', options = null) => {
    const value = formData[key] !== undefined && formData[key] !== null ? formData[key] : '';
    const validation = getFieldValidation(key, value);
    const isTextarea = type === 'textarea';
    const isNumber = type === 'number';
    const isCheckbox = type === 'checkbox';

    // Determine rows dynamically for textareas based on content
    const textLen = isTextarea ? String(value).length : 0;
    const dynamicRows = Math.max(4, Math.min(12, Math.ceil(textLen / 60) + 1));

    return (
      <div className="mb-5">
        {/* Label row */}
        <div className="flex justify-between items-center mb-2 select-none">
          <label
            htmlFor={key}
            className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5 cursor-pointer"
          >
            {label}
            {tooltip && renderTooltip(tooltip)}
          </label>

          <div className="flex items-center gap-2">
            {/* Character counter for textareas */}
            {isTextarea && <CharCounter value={String(value)} />}

            {/* Validation badge */}
            {validation.status === 'valid' && !isCheckbox && (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" /> Passed
              </span>
            )}
            {validation.status === 'warning' && (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-400 bg-amber-950/50 border border-amber-900/60 px-2 py-0.5 rounded" title={validation.message}>
                <AlertTriangle className="w-3 h-3" /> Advisory
              </span>
            )}
            {validation.status === 'error' && (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-rose-400 bg-rose-950/50 border border-rose-900/60 px-2 py-0.5 rounded" title={validation.message}>
                <AlertCircle className="w-3 h-3" /> Error
              </span>
            )}

            {/* AI Assist button for textareas */}
            {isTextarea && (
              <button
                type="button"
                onClick={() => handleAIDraft(key)}
                disabled={draftingFields[key]}
                className="inline-flex items-center gap-1 text-[9.5px] font-bold text-sky-400 hover:text-sky-300 transition-all cursor-pointer bg-sky-950/40 hover:bg-sky-900/40 border border-sky-900/50 hover:border-sky-600/60 px-2 py-0.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {draftingFields[key] ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /><span>Drafting…</span></>
                ) : (
                  <><span>✨</span><span>AI Assist</span></>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Input element */}
        {isTextarea ? (
          <div className="relative">
            <textarea
              id={key}
              rows={dynamicRows}
              className="form-input-base"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(key, e.target.value)}
            />
            {/* Subtle filled indicator line */}
            {value && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-sky-500/30 pointer-events-none" />
            )}
          </div>
        ) : type === 'select' ? (
          <select
            id={key}
            className="form-input-base"
            value={value}
            onChange={(e) => onChange(key, e.target.value)}
          >
            <option value="">Select option…</option>
            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : isCheckbox ? (
          <div className="flex items-start gap-3 mt-1 p-3 rounded-md bg-[#0a1020] border border-[#1e2d45] cursor-pointer hover:border-sky-800/40 transition-colors">
            <input
              id={key}
              type="checkbox"
              className="h-4 w-4 mt-0.5 rounded border-slate-700 bg-[#0b0f19] text-sky-600 focus:ring-sky-500 focus:ring-offset-slate-900 cursor-pointer shrink-0"
              checked={!!value}
              onChange={(e) => onChange(key, e.target.checked)}
            />
            <label htmlFor={key} className="text-[12.5px] text-slate-300 font-medium cursor-pointer leading-relaxed">
              {placeholder || 'Confirm and agree'}
            </label>
          </div>
        ) : (
          <input
            id={key}
            type={type}
            className={`form-input-base ${isNumber ? 'font-mono text-right tracking-wider' : ''}`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(key, type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
          />
        )}

        {/* Validation message */}
        {(validation.status === 'error' || validation.status === 'warning') && (
          <p className={`text-[11px] font-semibold mt-1.5 leading-normal flex items-center gap-1.5 ${
            validation.status === 'error' ? 'text-rose-400' : 'text-amber-400'
          }`}>
            {validation.status === 'error' ? <AlertCircle className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
            {validation.message}
          </p>
        )}
      </div>
    );
  };

  /* ── Audit Preview Panel Content ── */
  const getAuditPreviewDetails = () => {
    const fd = formData;
    switch (activeTab) {
      case 'basics': return {
        title: 'Cover Page Regulations',
        reg: 'SEBI ICDR Schedule VI Part I: The cover page must contain the exact registered corporate name, corporate logo, lead manager details, and registrar instructions. It should state that the issue is under Chapter IX for SMEs.',
        previewText: `DRAFT PROSPECTUS\nDated: [•]\n(Please read Section 26 and Section 32 of the Companies Act, 2013)\n\n${(fd.company_name || '[COMPANY NAME]').toUpperCase()}\nIncorporated as a public limited company under the Companies Act.\nAcronym representation: ${fd.company_acronym || '[ACRONYM]'}\n\nLead Manager: ${fd.lead_manager || '[LEAD MANAGER]'}\nRegistrar: ${fd.registrar || '[REGISTRAR]'}`
      };
      case 'general': return {
        title: 'General Information Audits',
        reg: 'SEBI ICDR Chapter IX Reg 244: Issuer must disclose authorized and pre-issue paid-up capital, statutory identifiers (PAN), and incorporation details verified from registered documents.',
        previewText: `SECTION II: GENERAL INFORMATION\n\nAuthorized Share Capital: ₹ ${fd.authorized_capital || '[•]'} Crores\nPre-Issue Paid-up Capital: ₹ ${fd.paid_up_capital_pre || '[•]'} Crores\n\nCIN: ${fd.cin || '[•]'}\nDate of Incorporation: ${fd.incorporation_date || '[•]'}\nRegistered Office: ${fd.registered_office || '[•]'}\n\nPAN of the Issuer: ${fd.pan || '[PAN NUMBER]'}\nPAN Name: ${fd.pan_name || '[PAN NAME]'}\nGSTIN: ${fd.gstin || '[•]'}\n\nStatutory Auditor: ${fd.auditor_name || '[•]'}\nICAI Membership No.: ${fd.auditor_membership || '[•]'}`
      };
      case 'management': return {
        title: 'Board Eligibility Audits',
        reg: 'SEBI ICDR Chapter IX Reg 245: Promoter narrative must detail experience in the relevant industry. Statutory auditor details must list registration and membership identifiers.',
        previewText: `SECTION III: MANAGEMENT & PROMOTERS\n\nPromoters: ${fd.promoters_names || '[PROMOTERS NAMES]'}\nBoard of Directors: ${fd.directors_names || '[DIRECTORS NAMES]'}\n\nPROMOTER PROFILE:\n${fd.promoter_experience || '[Promoter experience pending…]'}\n\nStatutory Auditor: ${fd.auditor_name || '[AUDITOR FIRM]'}\nMembership: ${fd.auditor_membership || '[MEMBERSHIP NO]'}`
      };
      case 'capital': return {
        title: 'Capital Lock-in Audits',
        reg: 'SEBI ICDR Chapter IX Reg 246: Promoter contribution must account for at least 20% of post-issue share capital, subject to a lock-in period of 3 years.',
        previewText: `SECTION IV: CAPITAL STRUCTURE\n\nPre-Issue Promoter Shareholding: ${fd.promoter_shareholding_pre_pct || '[•]'} %\nIPO Price Band: ₹ ${fd.price_band || '[•]'} per share\nProposed Issue Size: ₹ ${fd.issue_size || '[•]'} Crores`
      };
      case 'objects': return {
        title: 'Procedural Allocation Audits',
        reg: 'SEBI ICDR Chapter IX Reg 247: Use of proceeds must specify allocation amounts for capital expansion, working capital, debt clearing, and general corporate expenses (cap 25% of issue size).',
        previewText: `SECTION V: OBJECTS OF THE ISSUE\n\n- Capital Expansion (CAPEX): ₹ ${fd.expansion_amount || '0.00'} Crores\n- Working Capital: ₹ ${fd.working_capital_amount || '0.00'} Crores\n- Debt Repayment: ₹ ${fd.debt_repayment_amount || '0.00'} Crores\n- General Corporate: ₹ ${fd.general_corp_amount || '0.00'} Crores\n- Issue Expenses: ₹ ${fd.issue_expenses || '0.00'} Crores\n\nTotal: ₹ ${(
          (parseFloat(fd.expansion_amount)||0) + (parseFloat(fd.working_capital_amount)||0) +
          (parseFloat(fd.debt_repayment_amount)||0) + (parseFloat(fd.general_corp_amount)||0) +
          (parseFloat(fd.issue_expenses)||0)
        ).toFixed(2)} Crores`
      };
      case 'business': return {
        title: 'Operations Disclosure Audits',
        reg: 'SEBI ICDR Chapter IX Reg 248: Detailed description of products/services, business operations, target customer segments, and sector classification must be presented.',
        previewText: `SECTION VI: BUSINESS & OPERATIONS\n\nSector: ${fd.industry_name || '[SECTOR]'}\nKey Customers: ${fd.key_customers || '[CUSTOMERS]'}\n\nBUSINESS MODEL:\n${fd.business_model || '[Describe operations…]'}\n\nKEY PRODUCTS:\n${fd.products_services || '[Detail offerings…]'}`
      };
      case 'disclosures': default: return {
        title: 'Disclosures & Litigations Audits',
        reg: 'SEBI ICDR Chapter IX Reg 250: Issuer must declare internal and external risks, related party transactions, outstanding material litigation schedules, and statutory declarations.',
        previewText: `SECTION VII: RISK FACTORS & DECLARATIONS\n\nINTERNAL RISKS:\n${fd.internal_risks || '[List risks…]'}\n\nEXTERNAL RISKS:\n${fd.external_risks || '[List risks…]'}\n\nLITIGATIONS:\nCompany: ${fd.litigations_company || 'None'}\nPromoters: ${fd.litigations_promoters || 'None'}\n\nDECLARATION SIGNED: ${fd.declaration_signed ? 'YES ✓' : 'PENDING'}`
      };
    }
  };

  const auditDetails = getAuditPreviewDetails();

  const sectionTitles = {
    basics: 'Cover Page Details', general: 'General Information', management: 'Board & Promoters',
    capital: 'Capital Structure', objects: 'Objects of the Issue', business: 'Business Operations',
    disclosures: 'Risk Disclosures'
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in-up">

      {/* ── Left: Form (8 cols) ── */}
      <div className="lg:col-span-8 glass rounded-lg shadow-xl border border-slate-800/80">
        
        {/* Section header */}
        <div className="px-7 pt-6 pb-4 border-b border-[#1a2535]">
          <h2 className="text-lg font-bold text-white tracking-tight">{sectionTitles[activeTab]}</h2>
          <p className="text-[10.5px] text-slate-500 font-semibold uppercase tracking-widest mt-0.5">SEBI Chapter IX — Required Form Fields</p>
        </div>

        {/* Form body */}
        <div className="px-7 py-5">

          {/* ─ BASICS ─ */}
          {activeTab === 'basics' && (
            <div>
              {renderInput('company_name', 'Company Name', 'text', 'Exact registered corporate name with RoC.', 'e.g. Apex Technochem Limited')}
              {renderInput('company_acronym', 'Company Acronym', 'text', 'Short form used throughout prospectus.', 'e.g. APEX')}
              {renderInput('lead_manager', 'Lead Manager Name', 'text', 'SEBI registered Category I Merchant Banker.', 'e.g. BlueSky Capital Advisors Limited')}
              {renderInput('registrar', 'Registrar to the Issue', 'text', 'SEBI registered registrar to maintain share records.', 'e.g. Link Intime India Private Limited')}
            </div>
          )}

          {/* ─ GENERAL ─ */}
          {activeTab === 'general' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('authorized_capital', 'Authorized Capital (₹ Crores)', 'number', 'Maximum share value company is authorized to issue.', '15.00')}
                {renderInput('paid_up_capital_pre', 'Pre-Issue Paid-up Capital (₹ Crores)', 'number', 'Actual paid-up value prior to public issue.', '10.00')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('pan', 'Company PAN Number', 'text', 'Permanent Account Number of the corporate entity.', 'AAACA1234A')}
                {renderInput('pan_name', 'Name on PAN Card', 'text', 'Exact legal name as registered on the PAN.', 'Apex Technochem Limited')}
              </div>

              <SubGroupHeader icon={FileText} label="From Incorporation Certificate" note="(auto-extracted from doc, or enter manually)" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('cin', 'CIN Number', 'text', 'Corporate Identification Number — 21 digits.', 'U74999MH2018PLC312456')}
                {renderInput('incorporation_date', 'Date of Incorporation', 'text', 'Date the company was officially incorporated.', 'e.g. 2018-05-15')}
              </div>
              {renderInput('registered_office', 'Registered Office Address', 'text', 'Official address registered with ROC.', 'e.g. Plot 42, GIDC Industrial Area, Vapi, Gujarat')}
              {renderInput('company_type', 'Company Type', 'select', 'Legal form of the company.', '', ['Public Limited Company', 'Private Limited Company', 'LLP'])}

              <SubGroupHeader icon={FileText} label="From GST Certificate" note="(auto-extracted from doc, or enter manually)" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('gstin', 'GSTIN Number', 'text', 'GST registration number of the entity.', 'e.g. 27AAACG1234A1Z5')}
                {renderInput('gst_annual_turnover', 'GST Declared Turnover (₹ Crores)', 'number', 'Annual turnover declared in GST filings.', '42.8')}
              </div>

              <SubGroupHeader icon={FileText} label="From Financial Statements" note="(auto-extracted from doc, or enter manually)" />
              {renderInput('fy_years', 'Financial Years Covered', 'text', 'Fiscal years included in restated financials.', 'e.g. FY24, FY25, FY26')}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5">
                {renderInput('revenue_fy_latest', 'Latest Revenue (₹ Crores)', 'number', 'Total revenue in most recent fiscal year.', '45.5')}
                {renderInput('pat_fy_latest', 'Latest PAT (₹ Crores)', 'number', 'Net profit after tax in most recent fiscal year.', '3.8')}
                {renderInput('borrowings_latest', 'Total Borrowings (₹ Crores)', 'number', 'Total outstanding borrowings at year end.', '12.4')}
              </div>

              <SubGroupHeader icon={Users} label="Statutory Auditor" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('auditor_name', 'Statutory Auditor Firm', 'text', 'Audit firm restating the financial profiles.', 'e.g. M/s R.K. Associates & Co.')}
                {renderInput('auditor_membership', 'Auditor Membership No.', 'text', 'ICAI firm membership / registration code.', 'e.g. 084532N')}
              </div>
            </div>
          )}

          {/* ─ MANAGEMENT ─ */}
          {activeTab === 'management' && (
            <div>
              {renderInput('promoters_names', 'Promoter Names', 'text', 'Names of founders / controlling shareholders.', 'e.g. Rajesh Kumar, Sunita Kumar')}
              {renderInput('directors_names', 'Board Directors Names', 'text', 'Full Board of Directors names list.', 'e.g. Rajesh Kumar, Sunita Kumar, Anil Sharma')}
              {renderInput('promoter_experience', 'Promoter Experience Summary', 'textarea', 'Work achievements, education profile, and track record.', 'Describe background, industry experience, and key achievements…')}
              <SubGroupHeader icon={Users} label="Statutory Auditor" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('auditor_name', 'Statutory Auditor Firm', 'text', 'Audit firm restating financial profiles.', 'e.g. M/s R.K. Associates & Co.')}
                {renderInput('auditor_membership', 'Auditor Membership No.', 'text', 'ICAI firm membership / registration code.', 'e.g. 084532N')}
              </div>
            </div>
          )}

          {/* ─ CAPITAL ─ */}
          {activeTab === 'capital' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
              {renderInput('promoter_shareholding_pre_pct', 'Pre-Issue Promoter Shareholding (%)', 'number', 'Percentage pre-issue held by promoters.', '78.5')}
              {renderInput('price_band', 'Price Band (₹)', 'text', 'Proposed share price or bid range.', '100 - 105')}
              {renderInput('issue_size', 'Proposed Issue Size (₹ Crores)', 'number', 'Total funding sought through IPO.', '25.0')}
            </div>
          )}

          {/* ─ OBJECTS ─ */}
          {activeTab === 'objects' && (
            <div>
              <div className="mb-5 p-4 rounded-lg bg-[#050c18] border border-[#0d2036]">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-3.5 h-3.5 text-sky-500/70 shrink-0" />
                  <span className="text-[10.5px] font-bold text-sky-400/70 uppercase tracking-widest">Fund Allocation Structure</span>
                </div>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">All amounts must sum to the Proposed Issue Size. General Corporate Purposes is capped at 25% of issue size per SEBI Reg 247.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('expansion_amount', 'CAPEX Expansion (₹ Crores)', 'number', 'Machinery, setup or real-estate acquisition.', '8.5')}
                {renderInput('working_capital_amount', 'Working Capital Support (₹ Crores)', 'number', 'Inventory, payroll, operational support.', '10.0')}
                {renderInput('debt_repayment_amount', 'Debt Repayment (₹ Crores)', 'number', 'Clearing borrowings or outstanding loans.', '3.0')}
                {renderInput('general_corp_amount', 'General Corporate Purposes (₹ Crores)', 'number', 'Marketing, admin, minor legal, corporate cycles.', '2.0')}
                {renderInput('issue_expenses', 'IPO Expenses (₹ Crores)', 'number', 'Merchant banking fees, underwriting, registries.', '1.5')}
              </div>
              {/* Live sum display */}
              {formData.issue_size && (
                <div className="mt-1 p-3 rounded-md bg-[#050c18] border border-[#0d2036] flex justify-between items-center">
                  <span className="text-[11px] text-slate-400 font-semibold">Current Objects Sum</span>
                  <span className={`font-mono font-bold text-sm ${
                    Math.abs((['expansion_amount','working_capital_amount','debt_repayment_amount','general_corp_amount','issue_expenses']
                      .reduce((a,f) => a + (Number(formData[f])||0), 0)) - Number(formData.issue_size)) < 0.01
                      ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    ₹ {(['expansion_amount','working_capital_amount','debt_repayment_amount','general_corp_amount','issue_expenses']
                      .reduce((a,f) => a + (Number(formData[f])||0), 0)).toFixed(2)} Cr
                    <span className="text-slate-500 font-sans text-[11px] ml-2">/ ₹{Number(formData.issue_size).toFixed(2)} Cr target</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ─ BUSINESS ─ */}
          {activeTab === 'business' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                {renderInput('industry_name', 'Industry Sector Name', 'text', 'Standard category classification.', 'e.g. Speciality Chemicals')}
                {renderInput('key_customers', 'Key Customer Segments', 'text', 'Target groups or enterprise segments.', 'e.g. Paint manufacturers, Packaging firms')}
              </div>
              {renderInput('business_model', 'Business Model Description', 'textarea', 'Revenue model, operations, logistics, warehouses.', 'Describe revenue flows, sales channels, manufacturing capacity, logistics networks…')}
              {renderInput('products_services', 'Key Products & Solutions', 'textarea', 'Detailed product SKU profiles, services offered.', 'Detail product lines, technical specifications, quality certifications…')}
              {renderInput('summary_business_note', 'Summary Business Note (Prospectus Cover)', 'textarea', 'A brief one-paragraph summary for the Offer Summary section.', 'e.g. We are a Gujarat-based manufacturer of specialty chemicals…')}
            </div>
          )}

          {/* ─ DISCLOSURES ─ */}
          {activeTab === 'disclosures' && (
            <div>
              {renderInput('internal_risks', 'Internal Risk Factors', 'textarea', 'Specific company operational risks and dependencies.', 'List key internal risks, e.g.:\n1. Dependency on key raw materials…\n2. Customer concentration risk…')}
              {renderInput('external_risks', 'External Risk Factors', 'textarea', 'Sector legal rules, economic, currency, and market risks.', 'List external risks, e.g.:\n1. Regulatory changes (pollution control norms)…\n2. Foreign exchange fluctuation…')}

              <SubGroupHeader icon={AlertTriangle} label="Litigation Disclosures" />
              {renderInput('litigations_company', 'Litigations Against the Issuer', 'textarea', 'Pending corporate civil or criminal suits.', 'e.g. No material litigations are pending against the Company as of date. — OR — describe pending cases.')}
              {renderInput('litigations_promoters', 'Litigations Against Promoters', 'textarea', 'Pending disputes against the promoter group.', 'e.g. None — OR — describe pending cases.')}

              <SubGroupHeader icon={FileText} label="Transactions & Contracts" />
              {renderInput('rpt_declared', 'Related Party Transactions (Last 3 Years)', 'textarea', 'Leases, loan profiles, promoter remuneration disclosures.', 'e.g. Rent of office warehouse from Rajesh Kumar: ₹12.0 Lakhs/annum; Director Remuneration: ₹1.2 Crores/annum')}
              {renderInput('material_contracts_desc', 'Material Contracts for Inspection', 'textarea', 'Key corporate agreements, registrar mandates, underwriting.', 'e.g.\n1. Tripartite Agreement dated Jan 12, 2026 with Registrar and Issuer.\n2. Underwriting Agreement dated Feb 1, 2026 with Lead Manager.')}

              <SubGroupHeader icon={CheckCircle2} label="Board Declaration" />
              <div className="p-4 rounded-lg bg-[#050c18] border border-[#0d2036] mb-5">
                <p className="text-[12px] text-slate-400 leading-relaxed italic">
                  "We hereby certify that all guidelines and regulations issued by SEBI under the Chapter IX framework are complied with, and the facts presented in this Draft Prospectus represent the true and fair status of the entity."
                </p>
              </div>
              {renderInput('declaration_signed', 'Board Approval Declaration', 'checkbox', 'Must be confirmed by the Board of Directors.', 'I confirm that the Board of Directors has approved and agreed to this declaration.')}
            </div>
          )}

          {/* ─ Nav buttons ─ */}
          <div className="flex justify-between items-center mt-8 pt-5 border-t border-[#1a2535] select-none">
            <button
              onClick={onPrev}
              disabled={activeTab === 'basics'}
              className="px-5 py-2.5 rounded-md text-xs font-bold border border-slate-700/60 bg-[#0f172a] text-slate-300 hover:bg-[#131c31] hover:text-white hover:border-slate-600 transition-all disabled:opacity-25 disabled:pointer-events-none cursor-pointer flex items-center gap-2"
            >
              ← Previous
            </button>
            <button
              onClick={onNext}
              disabled={activeTab === 'disclosures'}
              className="px-6 py-2.5 rounded-md text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-900/30 transition-all cursor-pointer disabled:opacity-30 flex items-center gap-2"
            >
              Next Step <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Regulatory Reference + Live Preview (4 cols) ── */}
      <div className="lg:col-span-4 flex flex-col gap-5 select-none">

        {/* Compliance Reference */}
        <div className="glass rounded-lg p-5 bg-[#0e1829] border border-[#1a2d46]">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-sky-400 flex items-center gap-1.5 mb-3">
            <BookOpen className="w-3.5 h-3.5" /> {auditDetails.title}
          </h3>
          <p className="text-[12px] text-slate-300 leading-relaxed">{auditDetails.reg}</p>
          <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-4 pt-2.5 border-t border-[#1a2d46]">
            Compliance Module Active
          </div>
        </div>

        {/* Live Prospectus Preview */}
        <div className="glass rounded-lg p-5 bg-[#0e1829] border border-[#1a2d46] flex-1 flex flex-col min-h-[300px]">
          <div className="border-b border-[#1a2d46] pb-2.5 mb-3 flex justify-between items-center">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Live Document Compile</h3>
            <span className="text-[8px] uppercase bg-slate-900 text-slate-500 px-2 py-0.5 rounded font-mono font-bold tracking-wider border border-slate-800">Legal Draft Style</span>
          </div>

          <div className="flex-1 bg-[#06090f] border border-[#1a2535] p-4 rounded-md overflow-y-auto relative">
            {/* Watermark */}
            <div className="absolute top-3 right-3 text-[8.5px] uppercase border border-[#1a2535] text-slate-600 font-mono px-2 py-0.5 rounded rotate-2 opacity-50 font-bold pointer-events-none select-none">
              Draft Preview
            </div>
            <pre className="font-serif text-[11.5px] leading-[1.75] text-slate-200 whitespace-pre-wrap break-words">
              {auditDetails.previewText}
            </pre>
          </div>
          <div className="text-[9.5px] text-slate-600 italic mt-2.5 leading-normal">
            * Text compiles automatically as form fields update.
          </div>
        </div>

      </div>
    </div>
  );
}
