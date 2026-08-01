import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, RefreshCw, FolderOpen,
  Check, Sparkles, LogOut, Loader2, ShieldCheck,
  ChevronRight, LayoutDashboard, AlertTriangle
} from 'lucide-react';
import Wizard from './components/Wizard';
import Uploader from './components/Uploader';
import Dashboard from './components/Dashboard';
import Copilot from './components/Copilot';
import CollaboratorBar from './components/CollaboratorBar';
import { apiFetch } from './api';
import { supabase } from './supabase';

export default function App({ user, onSignOut }) {
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [pullingDigiLocker, setPullingDigiLocker] = useState(false);
  const [isDigiLockerConnected, setIsDigiLockerConnected] = useState(false);
  const [scanningRedFlags, setScanningRedFlags] = useState(false);
  const [redFlagResults, setRedFlagResults] = useState(null);

  // Real-time Collaboration States
  const [collaborators, setCollaborators] = useState([]);
  const [userRole, setUserRole] = useState('founder');
  const [realtimeConnected, setRealtimeConnected] = useState(true);

  const sessionDataRef = useRef(sessionData);
  const saveTimerRef = useRef(null);
  const realtimeChannelRef = useRef(null);

  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  // ── Supabase Realtime Collaboration Setup ─────────────────────────────
  useEffect(() => {
    if (!user) return;

    const channelId = `ipo_workspace_${user.id || 'shared'}`;
    const channel = supabase.channel(channelId, {
      config: {
        presence: { key: user.email || 'user' }
      }
    });

    realtimeChannelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeUsers = [];
        Object.keys(state).forEach(key => {
          const presences = state[key];
          if (presences && presences.length > 0) {
            const p = presences[0];
            activeUsers.push({
              email: p.email || key,
              role: p.role || 'founder',
              active_tab: p.active_tab || 'dashboard',
              is_self: (p.email === user?.email)
            });
          }
        });
        setCollaborators(activeUsers);
      })
      .on('broadcast', { event: 'session_update' }, ({ payload }) => {
        if (payload && payload.form_data) {
          sessionDataRef.current = {
            ...sessionDataRef.current,
            form_data: { ...sessionDataRef.current.form_data, ...payload.form_data }
          };
          setSessionData({ ...sessionDataRef.current });
          validateSession();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
          channel.track({
            email: user.email || 'founder@apex.com',
            role: userRole,
            active_tab: activeTab,
            online_at: new Date().toISOString()
          });
        } else {
          setRealtimeConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userRole, activeTab]);

  const handleApplySuggestion = (key, value) => {
    handleFormChange(key, value);
  };

  const authFetch = (path, options) => apiFetch(path, options);

  // Fetch initial session state
  useEffect(() => {
    fetchSession();
  }, []);

  // Update auto-saved timestamp when saved status turns to 'saved'
  useEffect(() => {
    if (saveStatus === 'saved') {
      setLastSavedTime(new Date().toLocaleTimeString());
    }
  }, [saveStatus]);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/session');
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
      const res = await authFetch('/api/validate');
      if (res.ok) {
        const data = await res.json();
        setValidationResults(data);
      }
    } catch (err) {
      console.error('Validation engine failed:', err);
    }
  };

  const persistFormData = async (formData) => {
    try {
      const res = await authFetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: formData })
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveStatus('saved');
      await validateSession();
    } catch (err) {
      console.error('Failed to save session state:', err);
      setSaveStatus('error');
    }
  };

  const handleSimulateDigiLocker = async () => {
    setPullingDigiLocker(true);
    try {
      const res = await authFetch('/api/dpi/digilocker/simulate', { method: 'POST' });
      if (!res.ok) throw new Error('DigiLocker simulation failed');
      const data = await res.json();
      if (data.session) {
        sessionDataRef.current = data.session;
        setSessionData(data.session);
      } else {
        await fetchSession();
      }
      setIsDigiLockerConnected(true);
      await validateSession();
    } catch (err) {
      console.error('DigiLocker simulation failed:', err);
    } finally {
      setPullingDigiLocker(false);
    }
  };

  const handleScanRedFlags = async () => {
    setScanningRedFlags(true);
    try {
      const res = await authFetch('/api/nlp/redflag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: sessionDataRef.current.form_data }),
      });
      if (!res.ok) throw new Error('Red-flag scan failed');
      setRedFlagResults(await res.json());
    } catch (err) {
      console.error('Red Flag scan failed:', err);
    } finally {
      setScanningRedFlags(false);
    }
  };

  const handleReset = async () => {
    try {
      setLoading(true);
      await authFetch('/api/session/reset', { method: 'POST' });
      const emptySession = {
        form_data: {},
        extracted_data: {
          financials: {},
          gst: {},
          incorporation: {},
          compliance: {}
        },
        uploaded_files: []
      };
      sessionDataRef.current = emptySession;
      setSessionData(emptySession);
      setValidationResults(null);
      setRedFlagResults(null);
      setIsDigiLockerConnected(false);
      setConfirmReset(false);
      await validateSession();
    } catch (err) {
      console.error('Failed to reset workspace:', err);
    } finally {
      setLoading(false);
    }
  };


  const handleFormChange = (key, value) => {
    setSaveStatus('saving');
    const updatedFormData = { ...sessionDataRef.current.form_data, [key]: value };
    const updatedSession = { ...sessionDataRef.current, form_data: updatedFormData };
    sessionDataRef.current = updatedSession;
    setSessionData(updatedSession);

    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'session_update',
        payload: { form_data: { [key]: value }, updated_by: user?.email }
      });
    }

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persistFormData(updatedFormData), 500);
  };

  const handleUploadSuccess = (docType, extractedFields, upload) => {
    setSessionData(prev => {
      const updatedFiles = prev.uploaded_files.filter(f => f.type !== docType);
      updatedFiles.push({ ...upload, type: docType });

      // Auto-fill only blank fields. A manually entered value always takes priority.
      const updatedFormData = { ...prev.form_data };
      for (const [key, value] of Object.entries(extractedFields || {})) {
        const isMetadata = key === 'missing_fields';
        const isMeaningfulValue = value !== undefined && value !== null && value !== '';
        const isBlankFormField = updatedFormData[key] === undefined || updatedFormData[key] === null || updatedFormData[key] === '';
        if (!isMetadata && isMeaningfulValue && isBlankFormField) {
          updatedFormData[key] = value;
        }
      }

      const updatedSession = {
        ...prev,
        form_data: updatedFormData,
        extracted_data: { ...prev.extracted_data, [docType]: extractedFields },
        uploaded_files: updatedFiles,
      };
      sessionDataRef.current = updatedSession;
      return updatedSession;
    });

    setTimeout(() => {
      validateSession();
    }, 200);
  };

  const handlePreFill = async (type) => {
    setSaveStatus('saving');
    setLoading(true);

    const sampleForm = {
      company_name: 'Apex Technochem Limited',
      company_acronym: 'APEX',
      authorized_capital: 25.0,
      paid_up_capital_pre: 8.0,
      promoter_shareholding_pre_pct: 78.5,
      promoters_names: 'Rajesh Kumar, Sunita Kumar',
      directors_names: 'Rajesh Kumar, Sunita Kumar, Anil Sharma (Independent), Dr. Priya Vyas (Non-Executive)',
      promoter_experience: 'Mr. Rajesh Kumar has over 22 years of experience in the industrial solvents and speciality chemicals manufacturing industry. Mrs. Sunita Kumar manages quality assurance operations at our Vapi plant.',
      auditor_name: 'M/s R.K. Associates & Co.',
      auditor_membership: '084532N',
      issue_size: 12.0,
      price_band: '110 - 115',
      lead_manager: 'BlueSky Capital Advisors Limited',
      registrar: 'Link Intime India Private Limited',
      expansion_amount: 4.5,
      working_capital_amount: 4.5,
      debt_repayment_amount: 1.5,
      general_corp_amount: 1.0,
      issue_expenses: 0.5,
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
          company_name: 'Apex Technochem Limited',
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
      await authFetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: updatedSession.form_data })
      });
    } catch (err) {
      console.error(err);
    }

    // Always sync full session (including extracted_data) to backend
    try {
      await authFetch('/api/session_sync', {
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

  // ── Wizard step navigation ──────────────────────────────────────────────
  const tabOrder = ['basics', 'general', 'management', 'capital', 'objects', 'business', 'disclosures'];

  const handleNextTab = () => {
    const idx = tabOrder.indexOf(activeTab);
    if (idx >= 0 && idx < tabOrder.length - 1) {
      setActiveTab(tabOrder[idx + 1]);
    }
  };

  const handlePrevTab = () => {
    const idx = tabOrder.indexOf(activeTab);
    if (idx > 0) {
      setActiveTab(tabOrder[idx - 1]);
    }
  };

  // Sync session on upload changes - always persist extracted_data
  useEffect(() => {
    if (!loading) {
      authFetch('/api/session_sync', {
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
      const res = await authFetch('/api/generate', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        alert(`Generation failed: ${err.detail || res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const docxBlob = new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(docxBlob);
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
        return <span className="w-2 h-2 rounded-full bg-emerald-500 block shrink-0" title="Section Complete" />;
      case 'in_progress':
        return <span className="w-2 h-2 rounded-full bg-amber-400 block shrink-0 animate-pulse" title="In Progress" />;
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-red-500 block shrink-0 animate-pulse" title="Flagged Issues" />;
      case 'empty':
      default:
        return <span className="w-2 h-2 rounded-full bg-gray-200 block shrink-0" title="Not Started" />;
    }
  };

  const isWizardTab = ['basics', 'general', 'management', 'capital', 'objects', 'business', 'disclosures'].includes(activeTab);
  const wizardStepIndex = isWizardTab ? tabOrder.indexOf(activeTab) : -1;

  const pageTitle = activeTab === 'dashboard'
    ? 'Filing Dashboard'
    : activeTab === 'uploads'
      ? 'Document Vault'
      : steps.find(s => s.id === activeTab)?.label || 'Drafting Wizard';

  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-900 relative font-sans">

      {/* Pinned Top Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-50">
        <div
          className="h-full bg-accent-500 transition-all duration-700 ease-out rounded-r-full"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── Sidebar Navigation ── */}
      <aside className="w-64 border-r border-gray-100 bg-white shrink-0 flex flex-col hidden md:flex sticky top-0 h-screen z-40 shadow-sm overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand / Logo */}
          <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3 bg-gradient-to-r from-[#0d1f2d] via-[#1a3a4a] to-[#0d2b3e] text-white">
            <img
              src="/logo.png"
              alt="IPO Sherpa"
              className="h-9 w-auto shrink-0 rounded-lg drop-shadow-[0_4px_16px_rgba(0,179,134,0.45)]"
            />
            <div>
              <h1 className="font-display font-bold text-[14.5px] text-white leading-tight tracking-tight flex items-center gap-1">
                IPO <span className="text-[#00b386]">Sherpa</span>
              </h1>
              <p className="text-[9px] uppercase font-bold tracking-widest text-emerald-400/80 mt-0.5">SEBI IPO Workspace</p>
            </div>
          </div>


          {/* Sync status pill */}
          <div className="px-5 py-2.5 border-b border-gray-50 flex items-center justify-between">
            <span className="text-[10.5px] text-gray-400 font-semibold select-none">Auto-sync</span>
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1" title={`Synced at ${lastSavedTime}`}>
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-blue-500 font-bold flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Syncing…
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /> Offline
              </span>
            )}
          </div>

          {/* Nav */}
          <nav className="p-3 space-y-0.5 overflow-y-auto flex-1 min-h-0">
            <div className="pb-2 px-3 pt-2 text-[10px] uppercase font-bold tracking-widest text-gray-400 select-none">
              Overview
            </div>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-semibold rounded-xl transition-all cursor-pointer ${activeTab === 'dashboard'
                  ? 'bg-accent-50 text-accent-700 border-l-[3px] border-accent-500'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 border-l-[3px] border-transparent'
                }`}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${activeTab === 'dashboard' ? 'text-accent-500' : 'text-gray-400'}`} />
              <span>Filing Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('uploads')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-semibold rounded-xl transition-all cursor-pointer ${activeTab === 'uploads'
                  ? 'bg-accent-50 text-accent-700 border-l-[3px] border-accent-500'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 border-l-[3px] border-transparent'
                }`}
            >
              <FolderOpen className={`w-4 h-4 shrink-0 ${activeTab === 'uploads' ? 'text-accent-500' : 'text-gray-400'}`} />
              <span>Document Vault</span>
            </button>

            <div className="pt-4 pb-2 px-3 text-[10px] uppercase font-bold tracking-widest text-gray-400 select-none">
              Drafting Wizard
            </div>

            <div className="space-y-0.5">
              {steps.map((step, idx) => {
                const status = getStepStatus(step.id);
                const isActive = activeTab === step.id;
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveTab(step.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-[12.5px] font-semibold rounded-xl transition-all cursor-pointer border-l-[3px] ${isActive
                        ? 'bg-gray-50 text-gray-900 border-accent-500 shadow-sm'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 border-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getStatusDot(status)}
                      <span className="truncate">{step.label}</span>
                    </div>
                    <span className={`text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0 ml-1 ${isActive
                        ? 'bg-accent-50 text-accent-600 border border-accent-100'
                        : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }`}>
                      {step.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-100">
          {/* Progress summary */}
          <div className="px-3 py-2.5 mb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-bold text-gray-500">Wizard progress</span>
              <span className="text-[10.5px] font-bold text-accent-600">{completedStepsCount}/7</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          {confirmReset ? (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2 animate-fade-in-up">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Reset all data?
              </div>
              <p className="text-[10px] text-red-500 leading-relaxed">This will clear all form fields and uploaded documents.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 transition-all cursor-pointer"
                >
                  Yes, reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-[11px] font-bold hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="w-full py-2 px-3 rounded-xl text-[11.5px] font-semibold text-gray-400 hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Reset workspace
            </button>
          )}
          <button
            onClick={onSignOut}
            className="w-full mt-2 py-2 px-3 rounded-xl text-[11.5px] font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out {user?.email ? `(${user.email})` : ''}
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-grow min-w-0 flex flex-col min-h-screen">

        {/* Top Header */}
        <header className="h-14 border-b border-gray-100 bg-white flex justify-between items-center px-7 sticky top-0 z-30 shadow-sm select-none">
          <div className="flex items-center gap-3">
            {/* Breadcrumb style */}
            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-[12px] font-semibold">IPO Sherpa</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-[14px] font-bold text-gray-900 tracking-tight">
              {pageTitle}
            </h2>

            {isWizardTab && (
              <span className="text-[10.5px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg font-semibold border border-gray-200">
                Step {wizardStepIndex + 1} / 7
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* SEBI compliance badge */}
            <div className="text-[10.5px] text-emerald-700 flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SEBI ICDR Chapter IX</span>
            </div>

            {/* Copilot toggle */}
            <button
              onClick={() => setCopilotOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer shadow-sm relative ${copilotOpen
                  ? 'bg-accent-500 text-white border-accent-500 shadow-accent'
                  : 'bg-white hover:bg-accent-50 text-gray-600 hover:text-accent-700 border-gray-200 hover:border-accent-200'
                }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${copilotOpen ? 'text-white' : 'text-accent-500'}`} />
              <span>AI Copilot</span>
              {validationResults?.inconsistencies?.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="flex-grow p-6 md:p-8 overflow-y-auto bg-gray-50">
          {loading ? (
            <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
              <div className="flex flex-col items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-xl">
                  <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-[14px] font-bold text-white/80 tracking-wide">Preparing your workspace…</p>
                  <p className="text-[11px] text-white/35 font-medium">Fetching session · Running compliance checks</p>
                </div>
                <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard
                  validationResults={validationResults}
                  sessionData={sessionData}
                  onGenerate={handleGenerateProspectus}
                  generating={generating}
                  onNavigateTab={setActiveTab}
                  onPreFill={handlePreFill}
                  lastSavedTime={lastSavedTime}
                  onScanRedFlags={handleScanRedFlags}
                  scanningRedFlags={scanningRedFlags}
                  redFlagResults={redFlagResults}
                  apiFetch={authFetch}
                />
              )}

              {activeTab === 'uploads' && (
                <Uploader
                  sessionData={sessionData}
                  onUploadSuccess={handleUploadSuccess}
                  apiFetch={authFetch}
                  onSimulateDigiLocker={handleSimulateDigiLocker}
                  pullingDigiLocker={pullingDigiLocker}
                  isDigiLockerConnected={isDigiLockerConnected}
                />
              )}

              {['basics', 'general', 'management', 'capital', 'objects', 'business', 'disclosures'].includes(activeTab) && (
                <Wizard
                  formData={sessionData.form_data}
                  extractedData={sessionData.extracted_data}
                  uploadedFiles={sessionData.uploaded_files}
                  onChange={handleFormChange}
                  activeTab={activeTab}
                  onNext={handleNextTab}
                  onPrev={handlePrevTab}
                  validationResults={validationResults}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="py-3 border-t border-gray-100 bg-white text-center text-[10.5px] text-gray-400 font-medium flex items-center justify-center gap-2 select-none">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>AI-assisted draft under SEBI ICDR Chapter IX (Reg 229–259). Not a substitute for review by a SEBI-registered Category I Merchant Banker.</span>
        </footer>
      </main>

      <Copilot
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onApplySuggestion={handleApplySuggestion}
        apiFetch={authFetch}
      />
    </div>
  );
}
