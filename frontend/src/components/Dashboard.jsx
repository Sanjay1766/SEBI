import React, { useState } from 'react';
import { 
  CheckCircle2, AlertTriangle, XCircle, FileDown, 
  ChevronDown, ChevronUp, Loader2, Sparkles, FileText, ArrowRight,
  TrendingUp, Shield, AlertOctagon, BarChart3, Clock, Zap
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
      <div className="card rounded-2xl p-16 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-card-md animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-accent-50 border border-accent-100 flex items-center justify-center mb-5">
          <Loader2 className="w-7 h-7 text-accent-500 animate-spin" />
        </div>
        <p className="text-gray-800 font-bold text-sm">Analyzing Workspace</p>
        <p className="text-[12px] text-gray-400 mt-2 leading-relaxed max-w-xs">
          Running SEBI Chapter IX rules engine on form fields and document extracts…
        </p>
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

  // Primary metric: filing readiness
  const primaryScore = filing_readiness;
  const scoreColor = primaryScore >= 80 ? '#10b981' : primaryScore >= 50 ? '#f59e0b' : '#ef4444';
  const scoreTextColor = primaryScore >= 80 ? 'text-emerald-600' : primaryScore >= 50 ? 'text-amber-500' : 'text-red-500';
  const scoreBgColor = primaryScore >= 80 ? 'bg-emerald-50 border-emerald-100' : primaryScore >= 50 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100';
  const circumference = 2 * Math.PI * 30;

  const getStatusBadge = (status, sectionId) => {
    const base = 'flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 rounded-lg shrink-0 select-none cursor-pointer transition-all';
    switch (status) {
      case 'complete':
        return (
          <span onClick={(e) => handleBadgeClick(e, sectionId)}
            className={`${base} text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100`}
            title="Verified. Click to view in wizard.">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        );
      case 'inconsistent':
        return (
          <span onClick={(e) => handleBadgeClick(e, sectionId)}
            className={`${base} text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 animate-soft-pulse`}
            title="Data conflict found. Click to review.">
            <AlertTriangle className="w-3 h-3" /> Conflict
          </span>
        );
      default:
        return (
          <span onClick={(e) => handleBadgeClick(e, sectionId)}
            className={`${base} text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100`}
            title="Draft pending. Click to complete.">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      
      {/* ── Top Stats Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Filing Readiness (primary score) */}
        <div className={`card rounded-2xl p-6 border ${scoreBgColor} flex items-center justify-between`}>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-1">Filing Readiness</p>
            <p className={`text-4xl font-display font-800 tracking-tight ${scoreTextColor}`}>{primaryScore}%</p>
            <p className="text-[11.5px] text-gray-400 font-medium mt-1.5">
              {completed_blocking_fields} <span className="text-gray-300">/</span> {total_blocking_fields} blocking fields
            </p>
            {/* Secondary metric */}
            <p className="text-[10.5px] text-gray-400 font-semibold mt-1">
              Completeness: {overall_completeness}% ({completed_fields}/{total_fields})
            </p>
            {has_blocking_flags && (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg mt-2 animate-soft-pulse">
                <AlertTriangle className="w-3 h-3" /> Capped at 80% — resolve conflicts
              </span>
            )}
            {primaryScore === 100 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg mt-2">
                <CheckCircle2 className="w-3 h-3" /> IPO-Ready
              </span>
            )}
          </div>
          {/* SVG ring */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="#f1f5f9" strokeWidth="6" />
              <circle cx="36" cy="36" r="30" fill="none"
                stroke={scoreColor} strokeWidth="6"
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
        <div className="card rounded-2xl p-6 border border-gray-100 flex flex-col justify-between">
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-4">Prospectus Chapters</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl py-3 px-2 bg-emerald-50 border border-emerald-100">
              <span className="text-2xl font-display font-700 text-emerald-600 block">{status_counts.complete}</span>
              <span className="text-[9.5px] font-bold text-emerald-600/70 uppercase tracking-wide">Verified</span>
            </div>
            <div className="rounded-xl py-3 px-2 bg-amber-50 border border-amber-100">
              <span className="text-2xl font-display font-700 text-amber-500 block">{status_counts.incomplete}</span>
              <span className="text-[9.5px] font-bold text-amber-500/70 uppercase tracking-wide">Pending</span>
            </div>
            <div className="rounded-xl py-3 px-2 bg-red-50 border border-red-100">
              <span className="text-2xl font-display font-700 text-red-500 block">{status_counts.inconsistent}</span>
              <span className="text-[9.5px] font-bold text-red-500/70 uppercase tracking-wide">Conflicts</span>
            </div>
          </div>
          <p className="text-[10.5px] text-gray-400 font-medium mt-4 leading-relaxed">
            {sections.length} chapters tracked · Click any chapter below to expand
          </p>
        </div>

        {/* Compiler Card (Download + Load Sample) */}
        <div className="card rounded-2xl p-6 border border-gray-100 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle teal glow in corner */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-accent-500/8 rounded-full blur-2xl pointer-events-none" />
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-accent-600 flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5" /> Prospectus Compiler
            </p>
            <p className="text-[12.5px] text-gray-500 leading-relaxed">
              Compile form data into a SEBI-formatted <code className="text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-md text-[10.5px] font-mono">.docx</code> draft.
            </p>
          </div>
          <div className="space-y-2 mt-5">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="w-full bg-accent-500 hover:bg-accent-600 active:bg-accent-700 text-white rounded-xl py-2.5 px-4 text-[12.5px] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Compiling…</span></>
              ) : (
                <><FileDown className="w-4 h-4" /><span>Download Draft Prospectus</span></>
              )}
            </button>
            {onPreFill && (
              <button
                onClick={() => onPreFill('complete')}
                className="w-full bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 rounded-xl py-2 px-4 text-[11px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border border-gray-200 hover:border-gray-300"
                title="Load all form fields with sample data for Apex Technochem Limited"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-400" />
                <span>Load sample — Apex Technochem Ltd</span>
              </button>
            )}
          </div>
          {/* Last synced timestamp */}
          {lastSavedTime && (
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center gap-1.5 text-[10px] text-gray-400 font-medium select-none">
              <Clock className="w-3 h-3" />
              <span>Last synced: {lastSavedTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Inconsistencies Panel ── */}
      {inconsistencies.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-[11.5px] font-bold text-red-600 flex items-center gap-2 px-1">
            <XCircle className="w-4 h-4" /> Data Mismatches Detected ({inconsistencies.length})
          </h3>
          <div className="grid grid-cols-1 gap-2.5">
            {inconsistencies.map((inc) => (
              <div key={inc.id}
                className="bg-white border border-red-200 rounded-xl p-4 flex gap-4 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-xl" />
                <div className="p-2 bg-red-50 text-red-500 rounded-lg h-fit shrink-0 border border-red-100">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-bold text-[13px] text-gray-800">{inc.title}</h4>
                    <span className="text-[9.5px] uppercase tracking-wider bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-mono border border-red-200 font-bold">
                      {inc.severity}
                    </span>
                    {inc.blocking && (
                      <span className="text-[9px] uppercase tracking-wider bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md font-mono border border-amber-200 font-bold">
                        Blocking
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-gray-500 leading-relaxed">{inc.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prospectus Chapters Accordion ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[12px] font-bold text-gray-600 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-400" /> Prospectus Chapter Check
          </h3>
          <span className="text-[10.5px] text-gray-400 font-semibold">{sections.length} sections</span>
        </div>
        
        <div className="space-y-2">
          {sections.map((sec, idx) => {
            const isExpanded = expandedSection === sec.section_id;
            const hasMissing = sec.missing_fields?.length > 0;
            const hasPresent = sec.present_fields?.length > 0;
            
            return (
              <div key={sec.section_id}
                className={`bg-white border rounded-xl overflow-hidden transition-all duration-200 ${
                  isExpanded 
                    ? 'border-gray-200 shadow-card-md' 
                    : 'border-gray-100 shadow-card hover:border-gray-200 hover:shadow-card-md'
                }`}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleSection(sec.section_id)}
                  className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors select-none"
                >
                  <div className="flex items-center gap-4 overflow-hidden min-w-0">
                    <span className="font-mono text-[10.5px] text-gray-300 font-bold w-5 shrink-0 text-right">
                      {(idx + 1).toString().padStart(2, '0')}
                    </span>
                    <div className="overflow-hidden min-w-0">
                      <h4 className="font-bold text-[13.5px] text-gray-800 truncate">{sec.section_name}</h4>
                      <p className="text-[11.5px] text-gray-400 truncate mt-0.5 font-medium leading-relaxed">{sec.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-5">
                    {getStatusBadge(sec.status, sec.section_id)}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-300" />
                    }
                  </div>
                </div>

                {/* Accordion Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-3 bg-gray-50 border-t border-gray-100 space-y-4">
                    
                    {/* Conflicts */}
                    {sec.inconsistencies?.length > 0 && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                        <h5 className="text-[10.5px] font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5" /> Conflict Details
                        </h5>
                        <ul className="space-y-1.5">
                          {sec.inconsistencies.map((inc) => (
                            <li key={inc.id} className="text-[12px] text-red-600 leading-relaxed">
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
                        <h5 className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">Verified Fields</h5>
                        {hasPresent ? (
                          <div className="flex flex-wrap gap-1.5">
                            {sec.present_fields.map((f) => (
                              <span key={f}
                                onClick={() => onNavigateTab && onNavigateTab(SECTION_TO_TAB[sec.section_id])}
                                className="text-[10.5px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100 transition-colors leading-none"
                                title="Click to view in wizard."
                              >
                                <CheckCircle2 className="w-3 h-3 shrink-0" /> {f}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">No fields verified yet.</p>
                        )}
                      </div>

                      {/* Missing fields */}
                      <div>
                        <h5 className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">Missing Required Fields</h5>
                        {hasMissing ? (
                          <div className="flex flex-wrap gap-1.5">
                            {sec.missing_fields.map((f) => (
                              <span key={f}
                                onClick={() => onNavigateTab && onNavigateTab(SECTION_TO_TAB[sec.section_id])}
                                className="text-[10.5px] bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1 font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-amber-100 transition-colors leading-none"
                                title="Click to fill in wizard."
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> {f}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> All required fields complete!
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Navigate button */}
                    <button
                      onClick={() => onNavigateTab && onNavigateTab(SECTION_TO_TAB[sec.section_id])}
                      className="w-full text-[11.5px] font-bold text-accent-600 hover:text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-200 hover:border-accent-300 rounded-xl py-2.5 px-4 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
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
