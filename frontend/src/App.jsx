import React, { useState, useEffect } from 'react';
import { 
  Home, Upload, FormInput, FileCheck, RefreshCw, 
  HelpCircle, Settings, Check, Sparkles, LogOut, Loader2, ShieldCheck
} from 'lucide-react';
import Wizard from './components/Wizard';
import Uploader from './components/Uploader';
import Dashboard from './components/Dashboard';
import Copilot from './components/Copilot';

const BACKEND_URL = 'http://127.0.0.1:8000';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, uploads, basics, general, management, capital, objects, business, disclosures
  const [sessionData, setSessionData] = useState({
    form_data: {},
    extracted_data: {
      financials: {},
      gst: {},
      incorporation: {},
      compliance: {}
    },
    uploaded_files: []
  });
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // saved, saving, error
  const [lastSavedTime, setLastSavedTime] = useState(new Date().toLocaleTimeString());
  const [copilotOpen, setCopilotOpen] = useState(false);

  const handleApplySuggestion = (key, value) => {
    handleFormChange(key, value);
  };

  // Fetch initial session state
  useEffect(() => {
    fetchSession();
  }, []);

  // Whenever sessionData changes, fetch updated validation rules
  // (disabled here - we validate manually after each save to avoid race conditions)
  // useEffect(() => { if (!loading) { validateSession(); } }, [sessionData]);

  // Update auto-saved timestamp when saved status turns to 'saved'
  useEffect(() => {
    if (saveStatus === 'saved') {
      setLastSavedTime(new Date().toLocaleTimeString());
    }
  }, [saveStatus]);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/api/session`);
      if (res.ok) {
        const data = await res.json();
        setSessionData(data);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
      // Always validate after initial load so dashboard shows correct score
      validateSession();
    }
  };

  const validateSession = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/validate`);
      if (res.ok) {
        const data = await res.json();
        setValidationResults(data);
      }
    } catch (err) {
      console.error('Validation engine failed:', err);
    }
  };

  const handleFormChange = async (key, value) => {
    setSaveStatus('saving');
    
    // Update local state first
    const updatedSession = {
      ...sessionData,
      form_data: {
        ...sessionData.form_data,
        [key]: value
      }
    };
    setSessionData(updatedSession);

    // Sync to backend, then validate
    try {
      const res = await fetch(`${BACKEND_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: updatedSession.form_data })
      });
      if (res.ok) {
        setSaveStatus('saved');
        // Validate after save completes (no race condition)
        await validateSession();
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Failed to save session state:', err);
      setSaveStatus('error');
    }
  };

  const handleUploadSuccess = (docType, extractedFields, filename) => {
    const updatedExtracted = {
      ...sessionData.extracted_data,
      [docType]: extractedFields
    };
    
    const updatedFiles = [...sessionData.uploaded_files];
    if (!updatedFiles.some(f => f.filename === filename)) {
      updatedFiles.push({ filename, type: docType, size: 256000 });
    }

    setSessionData(prev => ({
      ...prev,
      extracted_data: updatedExtracted,
      uploaded_files: updatedFiles
    }));
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to reset all form fields and uploaded documents?')) {
      try {
        setLoading(true);
        const res = await fetch(`${BACKEND_URL}/api/reset`, { method: 'POST' });
        if (res.ok) {
          fetchSession();
          setActiveTab('dashboard');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePreFill = async (type) => {
    setSaveStatus('saving');
    setLoading(true);
    
    const sampleForm = {
      company_name: 'Apex Technochem Limited',
      company_acronym: 'APEX',
      authorized_capital: 15.0,
      paid_up_capital_pre: 10.5,
      promoter_shareholding_pre_pct: 78.5,
      promoters_names: 'Rajesh Kumar, Sunita Kumar',
      directors_names: 'Rajesh Kumar, Sunita Kumar, Anil Sharma (Independent), Dr. Priya Vyas (Non-Executive)',
      promoter_experience: 'Mr. Rajesh Kumar has over 22 years of experience in the industrial solvents and speciality chemicals manufacturing industry. Mrs. Sunita Kumar holds a Masters in Chemical Engineering and manages quality assurance operations at our Vapi plant.',
      auditor_name: 'M/s R.K. Associates & Co.',
      auditor_membership: '084532N',
      issue_size: 25.0,
      price_band: '110 - 115',
      lead_manager: 'BlueSky Capital Advisors Limited',
      registrar: 'Link Intime India Private Limited',
      expansion_amount: 8.5,
      working_capital_amount: 10.0,
      debt_repayment_amount: 3.0,
      general_corp_amount: 2.0,
      issue_expenses: 1.5,
      industry_name: 'Speciality Chemicals',
      products_services: 'Manufacturing of high-grade industrial solvents, thinners, and customised chemical blends for paint, automotive, and packaging industries.',
      business_model: 'Direct B2B institutional sales through contracts and regional distributor networks. Operating one primary manufacturing site at GIDC Vapi with 12,000 MT capacity.',
      key_customers: 'Automotive coatings dealers, decorative paint manufacturers, industrial packaging firms.',
      summary_business_note: 'Apex Technochem Limited is a Gujarat-based manufacturer of specialty chemicals serving the paint, automotive and packaging sectors with a revenue of ₹45.5 Crores in FY26.',
      pan: 'AAACA1234A',
      pan_name: 'Apex Technochem Limited',
      cin: 'U74999MH2018PLC312456',
      incorporation_date: '2018-05-15',
      registered_office: 'Plot 42, GIDC Industrial Area, Vapi, Gujarat, 396195',
      company_type: 'Public Limited Company',
      gstin: '27AAACG1234A1Z5',
      gst_annual_turnover: 42.8,
      fy_years: 'FY24, FY25, FY26',
      revenue_fy_latest: 45.5,
      pat_fy_latest: 3.8,
      borrowings_latest: 12.4,
      internal_risks: '1. Dependency on key raw materials like toluene and butyl acetate which suffer global price volatility.\n2. Dependency on paint manufacturers, which are subject to seasonal demand fluctuations.',
      external_risks: '1. Tightening of pollution control standards by Gujarat Pollution Control Board (GPCB) could increase compliance costs.\n2. Foreign exchange fluctuation affecting import prices of organic chemicals.',
      litigations_company: 'None',
      litigations_promoters: 'None',
      rpt_declared: 'Rent of office warehouse space from Rajesh Kumar: ₹12.0 Lakhs/annum; Remuneration to directors: ₹1.2 Crores/annum.',
      material_contracts_desc: '1. Tripartite Agreement dated Jan 12, 2026 with Registrar and Issuer.\n2. Underwriting Agreement dated Feb 1, 2026 with BlueSky Capital Advisors.',
      declaration_signed: true
    };

    let updatedSession = {
      ...sessionData,
      form_data: sampleForm
    };

    if (type === 'complete') {
      updatedSession.extracted_data = {
        financials: {
          fy_years: 'FY24, FY25, FY26',
          revenue_fy_latest: 45.5,
          pat_fy_latest: 3.8,
          borrowings_latest: 12.4,
          auditor_name: 'M/s R.K. Associates & Co.',
          auditor_membership: '084532N'
        },
        gst: {
          gstin: '27AAACG1234A1Z5',
          company_name: 'Apex Technochem Pvt Ltd',
          gst_annual_turnover: 42.8,
          registration_date: '2018-04-12',
          filing_status: 'Active'
        },
        incorporation: {
          cin: 'U74999MH2018PLC312456',
          company_name: 'Apex Technochem Limited',
          incorporation_date: '2018-05-15',
          registered_office: 'Plot 42, GIDC Industrial Area, Vapi, Gujarat, 396195',
          company_type: 'Public Limited Company'
        },
        compliance: {
          pan: 'AAACA1234A',
          pan_name: 'Apex Technochem Limited',
          tan: 'MUMA12345B'
        }
      };

      updatedSession.uploaded_files = [
        { filename: 'financial_statements_restated_3yrs.pdf', type: 'financials', size: 102452 },
        { filename: 'gst_registration_cert_reg06.pdf', type: 'gst', size: 84310 },
        { filename: 'incorporation_certificate_roc.pdf', type: 'incorporation', size: 95411 },
        { filename: 'company_pan_tan_licenses.pdf', type: 'compliance', size: 54124 }
      ];
    }

    setSessionData(updatedSession);

    // Sync form_data to backend
    try {
      await fetch(`${BACKEND_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: updatedSession.form_data })
      });
    } catch (err) {
      console.error(err);
    }

    // Always sync full session (including extracted_data) to backend
    try {
      await fetch(`${BACKEND_URL}/api/session_sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSession)
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    } finally {
      setLoading(false);
      // Trigger validation after full sync
      await validateSession();
    }
  };

  // Sync session on upload changes - always persist extracted_data
  useEffect(() => {
    if (!loading) {
      fetch(`${BACKEND_URL}/api/session_sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      })
      .then(() => validateSession())
      .catch(err => console.error('Full session sync failed:', err));
    }
  }, [sessionData.extracted_data, sessionData.uploaded_files]);

  const handleGenerateProspectus = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        alert(`Generation failed: ${err.detail || res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SME_IPO_Draft_Prospectus.docx';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download prospectus. Make sure the backend is running.');
    } finally {
      setGenerating(false);
    }
  };

  const steps = [
    { id: 'basics', label: 'Cover Page Details', code: 'Sch VI Pt I' },
    { id: 'general', label: 'General Information', code: 'ICDR Reg 244' },
    { id: 'management', label: 'Board & Promoters', code: 'ICDR Reg 245' },
    { id: 'capital', label: 'Capital Structure', code: 'ICDR Reg 246' },
    { id: 'objects', label: 'Objects of the Issue', code: 'ICDR Reg 247' },
    { id: 'business', label: 'Business Operations', code: 'ICDR Reg 248' },
    { id: 'disclosures', label: 'Risk Disclosures', code: 'ICDR Reg 250' }
  ];

  const getStepStatus = (stepId) => {
    // Merge form_data + extracted_data for completeness check (mirrors backend validator)
    const data = { ...sessionData.form_data };
    for (const docType of Object.values(sessionData.extracted_data || {})) {
      if (docType && typeof docType === 'object') Object.assign(data, docType);
    }
    
    // Check if this step has inconsistencies first
    const stepInconsistencies = (validationResults?.inconsistencies || []).filter(inc => {
      const stepFields = {
        basics: ['company_name', 'company_acronym', 'lead_manager', 'registrar'],
        general: ['authorized_capital', 'paid_up_capital_pre', 'pan', 'pan_name', 'auditor_name', 'auditor_membership'],
        management: ['promoters_names', 'directors_names', 'promoter_experience', 'auditor_name', 'auditor_membership'],
        capital: ['promoter_shareholding_pre_pct', 'price_band', 'issue_size'],
        objects: ['expansion_amount', 'working_capital_amount', 'debt_repayment_amount', 'general_corp_amount', 'issue_expenses'],
        business: ['industry_name', 'products_services', 'business_model', 'key_customers'],
        disclosures: ['internal_risks', 'external_risks', 'litigations_company', 'litigations_promoters', 'rpt_declared', 'material_contracts_desc', 'declaration_signed']
      }[stepId] || [];
      
      return stepFields.some(f => inc.description.toLowerCase().includes(f) || inc.title.toLowerCase().includes(f.replace('_', ' ')));
    });

    if (stepInconsistencies.length > 0) return 'error';

    // Only required fields that users can actually fill (no doc-only optional fields)
    const stepFields = {
      basics: ['company_name', 'company_acronym', 'lead_manager', 'registrar'],
      general: ['authorized_capital', 'paid_up_capital_pre', 'pan', 'pan_name', 'auditor_name', 'auditor_membership'],
      management: ['promoters_names', 'directors_names', 'promoter_experience', 'auditor_name', 'auditor_membership'],
      capital: ['promoter_shareholding_pre_pct', 'price_band', 'issue_size'],
      objects: ['expansion_amount', 'working_capital_amount', 'debt_repayment_amount', 'general_corp_amount', 'issue_expenses'],
      business: ['industry_name', 'products_services', 'business_model', 'key_customers'],
      disclosures: ['internal_risks', 'external_risks', 'litigations_company', 'litigations_promoters', 'rpt_declared', 'material_contracts_desc', 'declaration_signed']
    }[stepId] || [];

    const filledCount = stepFields.filter(f => {
      const val = data[f];
      if (f === 'declaration_signed') return val === true || val === 'true';
      return val !== undefined && val !== null && val !== '';
    }).length;

    if (filledCount === 0) return 'empty';
    if (filledCount === stepFields.length) return 'complete';
    return 'in_progress';
  };

  const completedStepsCount = steps.filter(s => getStepStatus(s.id) === 'complete').length;
  const progressPct = Math.round((completedStepsCount / 7) * 100);

  const getStatusDot = (status) => {
    switch (status) {
      case 'complete':
        return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block shrink-0" title="Section Complete"></span>;
      case 'in_progress':
        return <span className="w-1.5 h-1.5 rounded-full bg-amber-550 block shrink-0 animate-pulse" title="In Progress"></span>;
      case 'error':
        return <span className="w-1.5 h-1.5 rounded-full bg-rose-500 block shrink-0 animate-pulse" title="Flagged Issues"></span>;
      case 'empty':
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-slate-600 block shrink-0" title="Not Started"></span>;
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0b0f19] text-[#f1f5f9] relative font-sans">
      
      {/* Pinned Top Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 z-50">
        <div 
          className="h-full bg-sky-500 transition-all duration-500 ease-out" 
          style={{ width: `${progressPct}%` }}
        ></div>
      </div>

      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-[#111827] bg-[#070b12] shrink-0 flex flex-col justify-between hidden md:flex sticky top-0 h-screen z-40 shadow-2xl">
        <div>
          {/* Brand Header */}
          <div className="px-5 py-4 border-b border-[#111827] flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-sky-900 to-sky-800 border border-sky-700/50 flex items-center justify-center text-white font-bold text-sm font-display shadow-lg shrink-0">
              S
            </div>
            <div>
              <h1 className="font-bold text-[12.5px] tracking-wide font-sans text-white leading-tight">SEBI COMPLIANCE</h1>
              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Chapter IX Draft Auditor</p>
            </div>
          </div>

          {/* Sync status pill */}
          <div className="px-5 py-2 border-b border-[#111827]/60 flex items-center justify-between">
            <span className="text-[10.5px] text-slate-500 font-semibold select-none">Compliance Sync</span>
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1" title={`Synced at ${lastSavedTime}`}>
                <Check className="w-3 h-3" /> Auto-saved
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-sky-400 font-bold flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Syncing…
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" /> Sync Offline
              </span>
            )}
          </div>

          {/* Nav */}
          <nav className="p-3 space-y-0.5">
            <div className="pb-1.5 px-3 text-[9px] uppercase font-bold tracking-widest text-slate-600 select-none">
              Console
            </div>
            
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-sky-950/60 text-sky-200 border border-sky-900/60 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Prospectus Audit</span>
            </button>

            <button
              onClick={() => setActiveTab('uploads')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'uploads'
                  ? 'bg-sky-950/60 text-sky-200 border border-sky-900/60 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Verify Documents</span>
            </button>

            <div className="pt-4 pb-1.5 px-3 text-[9px] uppercase font-bold tracking-widest text-slate-600 select-none">
              Drafting Wizard
            </div>

            <div className="space-y-0.5">
              {steps.map((step) => {
                const status = getStepStatus(step.id);
                const isActive = activeTab === step.id;
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveTab(step.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-[12.5px] font-semibold rounded-md transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-[#111827] text-white border border-slate-700/70 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {/* Active left accent */}
                    {isActive && (
                      <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-sky-500 rounded-r-full" />
                    )}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getStatusDot(status)}
                      <span className="truncate">{step.label}</span>
                    </div>
                    <span className="text-[8px] uppercase bg-[#0b1120] text-slate-500 font-mono px-1.5 py-0.5 rounded border border-[#1a2535] font-bold shrink-0 ml-1">
                      {step.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#111827]">
          <button
            onClick={handleReset}
            className="w-full py-2 px-3 rounded-md text-[11px] font-semibold text-slate-500 hover:bg-slate-900/50 hover:text-rose-400 border border-transparent hover:border-rose-900/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 rotate-180" /> Reset drafting space
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow min-w-0 flex flex-col min-h-screen">
        
        {/* Top Header */}
        <header className="h-14 border-b border-[#111827] bg-[#070b12]/90 backdrop-blur-xl flex justify-between items-center px-7 sticky top-0 z-30 shadow-md select-none">
          <div className="flex items-center gap-3">
            <h2 className="text-[13px] font-bold text-slate-200 tracking-tight">
              {activeTab === 'dashboard' ? 'Filing Compliance Report' : activeTab === 'uploads' ? 'Extract Source Documents' : 'IPO Draft Wizard'}
            </h2>
            
            {!['dashboard', 'uploads'].includes(activeTab) && (
              <span className="text-[10px] bg-[#111827] text-slate-400 px-2.5 py-1 rounded-md font-mono font-bold border border-slate-800">
                {completedStepsCount}/7 Sections Verified
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-[10.5px] text-slate-400 flex items-center gap-1.5 border border-[#1a2535] px-3 py-1.5 rounded-md bg-[#0a1020] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SEBI ICDR Chapter IX Compliant</span>
            </div>

            <button
              onClick={() => setCopilotOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10.5px] font-bold border transition-all cursor-pointer shadow-sm relative ${
                copilotOpen 
                  ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-500/10' 
                  : 'bg-[#0a1020] hover:bg-[#111827] text-slate-300 border-[#1a2535] hover:border-sky-900/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>AI Copilot</span>
              {validationResults?.inconsistencies?.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border border-[#070b12] animate-pulse" />
              )}
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="flex-grow p-7 md:p-8 overflow-y-auto bg-[#070b12]">
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-sky-950/30 border border-sky-900/30 flex items-center justify-center mb-5">
                <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
              </div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wide animate-pulse">Auditing compliance workspace…</p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard 
                  validationResults={validationResults} 
                  onGenerate={handleGenerateProspectus}
                  generating={generating}
                  onNavigateTab={setActiveTab}
                  onPreFill={handlePreFill}
                />
              )}

              {activeTab === 'uploads' && (
                <Uploader 
                  sessionData={sessionData}
                  onUploadSuccess={handleUploadSuccess}
                  backendUrl={BACKEND_URL}
                />
              )}

              {['basics', 'general', 'management', 'capital', 'objects', 'business', 'disclosures'].includes(activeTab) && (
                <Wizard
                  formData={sessionData.form_data}
                  onChange={handleFormChange}
                  activeTab={activeTab}
                  onNext={() => {
                    const idx = steps.findIndex(s => s.id === activeTab);
                    if (idx < steps.length - 1) setActiveTab(steps[idx + 1].id);
                  }}
                  onPrev={() => {
                    const idx = steps.findIndex(s => s.id === activeTab);
                    if (idx > 0) setActiveTab(steps[idx - 1].id);
                  }}
                  validationResults={validationResults}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="py-3 border-t border-[#111827] bg-[#070b12] text-center text-[10.5px] text-slate-500 font-medium flex items-center justify-center gap-2 select-none">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>AI-assisted compliance draft under Chapter IX. Final regulatory submission requires validation by a SEBI registered merchant banker.</span>
        </footer>
      </main>

      <Copilot 
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onApplySuggestion={handleApplySuggestion}
        backendUrl={BACKEND_URL}
      />
    </div>
  );
}
