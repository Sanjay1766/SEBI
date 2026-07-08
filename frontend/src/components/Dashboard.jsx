import React, { useState } from 'react';
import { 
  CheckCircle2, AlertTriangle, XCircle, FileDown, 
  ChevronDown, ChevronUp, Loader2, Sparkles, FileText, ArrowRight,
  TrendingUp, Shield, AlertOctagon, BarChart3, Clock
} from 'lucide-react';

const SECTION_TO_TAB = {
  'cover_page': 'basics',
  'definitions': 'basics',
  'risk_factors': 'disclosures',
  'summary_offer': 'business',
  'general_info': 'general',
  'capital_structure': 'capital',
  'objects_issue': 'objects',
  'business_overview': 'business',
  'industry_overview': 'business',
  'management': 'management',
  'rpt': 'management',
  'financials': 'general',
  'legal_disclosures': 'disclosures',
  'compliance_certs': 'general',
  'material_contracts': 'disclosures',
  'declaration': 'disclosures'
};

const TAB_NAMES = {
  'basics': 'Cover Page Details',
  'general': 'General Information',
  'management': 'Board & Promoters',
  'capital': 'Capital Structure',
  'objects': 'Objects of the Issue',
  'business': 'Business Operations',
  'disclosures': 'Risk Disclosures'
};

export default function Dashboard({ validationResults, onGenerate, generating, onNavigateTab, onPreFill, lastSavedTime }) {
  const [expandedSection, setExpandedSection] = useState(null);
  
  if (!validationResults) {
    return (
      <div className="glass rounded-lg p-16 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-xl border border-slate-800 animate-fade-in-up">
        <div className="w-14 h-14 rounded-full bg-sky-950/40 border border-sky-900/50 flex items-center justify-center mb-5">
          <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
        </div>
        <p className="text-slate-200 font-bold text-sm uppercase tracking-wider">Analyzing Workspace</p>
        <p className="text-[12px] text-slate-500 mt-2 leading-relaxed max-w-xs">Running SEBI Chapter IX rules engine on form fields and document extracts…</p>
      </div>
    );
  }

  const {
    filing_readiness = 0,
    overall_completeness = 0,
    readiness_score = 0,
    sections = [],
    inconsistencies = [],
    status_counts = { complete: 0, incomplete: 0, inconsistent: 0 },
    completed_fields = 0,
    total_fields = 0,
    completed_blocking_fields = 0,
    total_blocking_fields = 0,
    has_blocking_flags = false,
  } = validationResults;

  const toggleSection = (id) => setExpandedSection(expandedSection === id ? null : id);

  const handleBadgeClick = (e, sectionId) => {
    e.stopPropagation();
    const tabId = SECTION_TO_TAB[sectionId];
    if (tabId && onNavigateTab) onNavigateTab(tabId);
  };

  const getStatusBadge = (status, sectionId) => {
    const base = 'flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md shrink-0 select-none cursor-pointer transition-all';
    switch (status) {
      case 'complete':
        return (
          <span onClick={(e) => handleBadgeClick(e, sectionId)}
            className={`${base} text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 hover:bg-emerald-950/80`}
            title="Verified. Click to view in wizard.">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Verified
          </span>
        );
      case 'inconsistent':
        return (
          <span onClick={(e) => handleBadgeClick(e, sectionId)}
            className={`${base} text-rose-400 bg-rose-950/50 border border-rose-900/60 hover:bg-rose-950/80 animate-soft-pulse`}
            title="Data conflict found. Click to review.">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" /> Data Conflict
          </span>
        );
      default:
        return (
          <span onClick={(e) => handleBadgeClick(e, sectionId)}
            className={`${base} text-amber-400 bg-amber-950/50 border border-amber-900/60 hover:bg-amber-950/80 animate-soft-pulse`}
            title="Draft pending. Click to complete.">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> Draft Pending
          </span>
        );
    }
  };

  // Primary metric: filing readiness
  const primaryScore = filing_readiness;
  const scoreColor = primaryScore >= 80 ? '#10b981' : primaryScore >= 50 ? '#f59e0b' : '#ef4444';
  const scoreTextColor = primaryScore >= 80 ? 'text-emerald-400' : primaryScore >= 50 ? 'text-amber-400' : 'text-rose-400';
  const scoreBorderColor = primaryScore >= 80 ? 'border-emerald-900/30' : primaryScore >= 50 ? 'border-amber-900/30' : 'border-rose-900/30';
  const circumference = 2 * Math.PI * 30;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      
      {/* ── Top Stats Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Filing Readiness (primary score — blocking fields only) */}
        <div className={`glass rounded-lg p-6 border ${scoreBorderColor} flex items-center justify-between`}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Filing Readiness</p>
            <p className={`text-4xl font-bold tracking-tight ${scoreTextColor}`}>{primaryScore}%</p>
            <p className="text-[11.5px] text-slate-500 font-medium mt-1.5">
              {completed_blocking_fields} <span className="text-slate-600">/</span> {total_blocking_fields} blocking fields
            </p>
            {/* Secondary metric: overall completeness */}
            <p className="text-[10px] text-slate-600 font-semibold mt-1">
              Overall completeness: {overall_completeness}% ({completed_fields}/{total_fields})
            </p>
            {has_blocking_flags && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-950/50 border border-amber-900/50 px-2 py-0.5 rounded mt-2 animate-soft-pulse">
                <AlertTriangle className="w-3 h-3" /> Capped at 80% — resolve data conflicts
              </span>
            )}
            {primaryScore === 100 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 px-2 py-0.5 rounded mt-2">
                <CheckCircle2 className="w-3 h-3" /> IPO-Ready
              </span>
            )}
          </div>
          {/* SVG ring */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="#1e293b" strokeWidth="5" />
              <circle cx="36" cy="36" r="30" fill="none"
                stroke={scoreColor} strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (circumference * primaryScore) / 100}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-[13px] font-bold font-mono ${scoreTextColor}`}>{primaryScore}%</span>
            </div>
          </div>
        </div>

        {/* Chapter Status */}
        <div className="glass rounded-lg p-6 border border-slate-800/60 flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Prospectus Chapters</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg py-3 px-2 bg-emerald-950/30 border border-emerald-900/40">
              <span className="text-2xl font-bold text-emerald-400 block">{status_counts.complete}</span>
              <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">Verified</span>
            </div>
            <div className="rounded-lg py-3 px-2 bg-amber-950/30 border border-amber-900/40">
              <span className="text-2xl font-bold text-amber-400 block">{status_counts.incomplete}</span>
              <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">Pending</span>
            </div>
            <div className="rounded-lg py-3 px-2 bg-rose-950/30 border border-rose-900/40">
              <span className="text-2xl font-bold text-rose-400 block">{status_counts.inconsistent}</span>
              <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">Conflicts</span>
            </div>
          </div>
        </div>

        {/* Compiler Card */}
        <div className="glass rounded-lg p-6 border border-slate-800/60 bg-gradient-to-br from-[#0f1729] to-[#111827] flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Compiler Active
            </p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              Compile narrative drafts into a SEBI-formatted <code className="text-slate-300 bg-slate-800 px-1 rounded text-[10px]">.docx</code> file.
            </p>
          </div>
          <div className="space-y-2 mt-5">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="w-full bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white rounded-md py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-sky-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Compiling Draft…</span></>
              ) : (
                <><FileDown className="w-3.5 h-3.5" /><span>Download Draft Prospectus</span></>
              )}
            </button>
            {onPreFill && (
              <button
                onClick={() => onPreFill('complete')}
                className="w-full bg-[#0f172a] hover:bg-[#131c2e] text-slate-400 hover:text-slate-200 rounded-md py-2 px-4 text-[10.5px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-700/50 hover:border-slate-600"
                title="Load all form fields with sample data for Apex Technochem Limited"
              >
                <Sparkles className="w-3 h-3 text-sky-500/60" />
                <span>Load sample filing — Apex Technochem Ltd</span>
              </button>
            )}
          </div>
          {/* Last synced timestamp */}
          {lastSavedTime && (
            <div className="mt-3 pt-2.5 border-t border-slate-800/40 flex items-center gap-1.5 text-[9.5px] text-slate-600 font-semibold select-none">
              <Clock className="w-3 h-3" />
              <span>Last synced: {lastSavedTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Inconsistencies Panel ── */}
      {inconsistencies.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-[11px] font-bold text-rose-400 flex items-center gap-2 px-1 uppercase tracking-wide">
            <XCircle className="w-4 h-4" /> Data Mismatches Detected ({inconsistencies.length})
          </h3>
          <div className="grid grid-cols-1 gap-2.5">
            {inconsistencies.map((inc) => (
              <div key={inc.id}
                className="bg-[#1a0408] border border-rose-900/50 rounded-lg p-4 flex gap-4 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-500 rounded-l-lg" />
                <div className="p-2 bg-rose-950/50 text-rose-400 rounded-md h-fit shrink-0 border border-rose-900/40">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-bold text-[12.5px] text-rose-400">{inc.title}</h4>
                    <span className="text-[9px] uppercase tracking-wider bg-rose-950 text-rose-400 px-1.5 py-0.5 rounded font-mono border border-rose-900/50">
                      {inc.severity}
                    </span>
                    {inc.blocking && (
                      <span className="text-[8px] uppercase tracking-wider bg-amber-950/60 text-amber-400 px-1.5 py-0.5 rounded font-mono border border-amber-900/50">
                        Blocking
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-300 leading-relaxed">{inc.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prospectus Chapters Accordion ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" /> Prospectus Chapters Check
          </h3>
          <span className="text-[10px] text-slate-600 font-semibold">{sections.length} sections</span>
        </div>
        
        <div className="space-y-2">
          {sections.map((sec, idx) => {
            const isExpanded = expandedSection === sec.section_id;
            const hasMissing = sec.missing_fields?.length > 0;
            const hasPresent = sec.present_fields?.length > 0;
            
            return (
              <div key={sec.section_id}
                className={`glass border rounded-lg overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'border-slate-700/80 shadow-lg bg-slate-900/20' : 'border-slate-800/60 hover:border-slate-700/60'
                }`}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleSection(sec.section_id)}
                  className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-900/20 transition-all select-none"
                >
                  <div className="flex items-center gap-4 overflow-hidden min-w-0">
                    <span className="font-mono text-[10px] text-slate-600 font-bold w-5 shrink-0 text-right">
                      {(idx + 1).toString().padStart(2, '0')}
                    </span>
                    <div className="overflow-hidden min-w-0">
                      <h4 className="font-bold text-[13px] text-slate-200 truncate">{sec.section_name}</h4>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium leading-relaxed">{sec.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-5">
                    {getStatusBadge(sec.status, sec.section_id)}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-slate-500" />
                      : <ChevronDown className="w-4 h-4 text-slate-500" />
                    }
                  </div>
                </div>

                {/* Accordion Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 bg-[#0a1020]/60 border-t border-slate-800/60 space-y-4">
                    
                    {/* Conflicts */}
                    {sec.inconsistencies?.length > 0 && (
                      <div className="p-4 bg-rose-950/30 border border-rose-900/40 rounded-lg">
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5" /> Conflict Details
                        </h5>
                        <ul className="space-y-1.5">
                          {sec.inconsistencies.map((inc) => (
                            <li key={inc.id} className="text-[12px] text-rose-300 leading-relaxed">
                              <span className="font-bold">{inc.title}:</span> {inc.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Fields grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Verified fields */}
                      <div>
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Verified Fields</h5>
                        {hasPresent ? (
                          <div className="flex flex-wrap gap-1.5">
                            {sec.present_fields.map((f) => (
                              <span key={f}
                                onClick={() => onNavigateTab && onNavigateTab(SECTION_TO_TAB[sec.section_id])}
                                className="text-[10.5px] bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-md px-2.5 py-1 font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-950/70 transition-colors leading-none"
                                title="Click to view in wizard."
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> {f}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-600 italic">No fields verified yet.</p>
                        )}
                      </div>

                      {/* Missing fields */}
                      <div>
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Missing Required Fields</h5>
                        {hasMissing ? (
                          <div className="flex flex-wrap gap-1.5">
                            {sec.missing_fields.map((f) => (
                              <span key={f}
                                onClick={() => onNavigateTab && onNavigateTab(SECTION_TO_TAB[sec.section_id])}
                                className="text-[10.5px] bg-amber-950/40 text-amber-400 border border-amber-900/50 rounded-md px-2.5 py-1 font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-amber-950/70 transition-colors leading-none"
                                title="Click to fill in wizard."
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> {f}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> All required fields complete!
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Go to wizard button */}
                    <button
                      onClick={() => onNavigateTab && onNavigateTab(SECTION_TO_TAB[sec.section_id])}
                      className="w-full text-[11px] font-bold text-sky-400 hover:text-sky-300 bg-sky-950/20 hover:bg-sky-950/40 border border-sky-900/30 hover:border-sky-700/50 rounded-md py-2 px-4 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
                    >
                      <span>Go to {TAB_NAMES[SECTION_TO_TAB[sec.section_id]]} Step</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
