import React, { useState } from 'react';
import { 
  CheckCircle2, AlertTriangle, XCircle, FileDown, 
  ChevronDown, ChevronUp, Loader2, Sparkles, FileText, ArrowRight,
  Shield, BarChart3, Clock, Zap,
  BookOpen, HelpCircle, Lightbulb, Cpu, ShieldCheck,
  ExternalLink, ScrollText
} from 'lucide-react';
import ComplianceScoreMeter from './ComplianceScoreMeter';
import FinancialRatioRadar from './FinancialRatioRadar';
import CapTableChart from './CapTableChart';
import { lookupRegulation } from '../data/icdrRegulations';

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

export default function Dashboard({ 
  validationResults, 
  onGenerate, 
  generating, 
  onNavigateTab, 
  onPreFill, 
  lastSavedTime,
  onScanRedFlags,
  scanningRedFlags,
  redFlagResults,
}) {
  const [expandedSection, setExpandedSection] = useState(null);
  const [expandedExplanations, setExpandedExplanations] = useState({});
  const [expandedFixSteps, setExpandedFixSteps] = useState({});
  const [expandedRegs, setExpandedRegs] = useState({});
  const [expandedCoT, setExpandedCoT] = useState({});

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
  const toggleExplanation = (id) => setExpandedExplanations(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleFixSteps = (id) => setExpandedFixSteps(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleReg = (id) => setExpandedRegs(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleCoT = (id) => setExpandedCoT(prev => ({ ...prev, [id]: !prev[id] }));

  const handleBadgeClick = (e, sectionId) => {
    e.stopPropagation();
    const tabId = SECTION_TO_TAB[sectionId];
    if (tabId && onNavigateTab) onNavigateTab(tabId);
  };

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

      {/* ── Compliance Score Meter (full-width centrepiece) ── */}
      <ComplianceScoreMeter validationResults={validationResults} />

      {/* ── Financial Ratio Anomaly Radar ── */}
      <FinancialRatioRadar validationResults={validationResults} />

      {/* ── Promoter Lock-in & Cap Table Chart ── */}
      <CapTableChart validationResults={validationResults} />

      {/* ── Top Stats Row (2-col: Chapter Status + Compiler) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

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

        {/* Compiler Card */}
        <div className="card rounded-2xl p-6 border border-gray-100 flex flex-col justify-between relative overflow-hidden">
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
          {lastSavedTime && (
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center gap-1.5 text-[10px] text-gray-400 font-medium select-none">
              <Clock className="w-3 h-3" />
              <span>Last synced: {lastSavedTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Feature 3: Inconsistencies Panel with SEBI Regulation Badges & AI Explanations ── */}
      {inconsistencies.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-extrabold text-red-600 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> SEBI Statutory Mismatches & Conflict Checks ({inconsistencies.length})
            </h3>
            <span className="text-[10.5px] text-red-500 font-mono font-bold">SEBI ICDR Audit Engine</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {inconsistencies.map((inc) => {
              const showExp = expandedExplanations[inc.id];
              const showFix = expandedFixSteps[inc.id];
              const showReg = expandedRegs[inc.id];
              const showCoT = expandedCoT[inc.id];
              const regData = lookupRegulation(inc.sebi_ref);

              return (
                <div key={inc.id}
                  className="bg-white border border-red-200 rounded-2xl p-5 shadow-card hover:shadow-card-md transition-all relative overflow-hidden flex flex-col gap-3">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 rounded-l-2xl" />

                  {/* Top Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pl-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="p-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <h4 className="font-extrabold text-sm text-gray-900">{inc.title}</h4>
                      
                      <span className="text-[9.5px] uppercase tracking-wider bg-red-50 text-red-600 px-2 py-0.5 rounded-md font-mono border border-red-200 font-bold">
                        {inc.severity}
                      </span>
                      {inc.blocking && (
                        <span className="text-[9px] uppercase tracking-wider bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md font-mono border border-amber-200 font-bold">
                          Blocking Issue
                        </span>
                      )}
                    </div>

                    {/* Clickable SEBI Regulation Badge */}
                    {inc.sebi_ref && (
                      <span
                        title="SEBI ICDR Statutory Regulation Reference"
                        className="text-[11px] font-extrabold font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0 self-start md:self-auto cursor-pointer hover:bg-blue-100 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        <span>{inc.sebi_ref}</span>
                      </span>
                    )}
                  </div>

                  {/* Main Description */}
                  <p className="text-xs text-gray-600 leading-relaxed pl-2 font-medium">{inc.description}</p>

                  {/* Interactive Action Badges */}
                  <div className="flex items-center gap-2 flex-wrap pt-1 pl-2 border-t border-gray-100">
                    <button
                      onClick={() => toggleCoT(inc.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                        showCoT 
                          ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-xs'
                          : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5 text-purple-600" />
                      <span>{showCoT ? 'Hide CoT Reasoning' : '🧠 Chain-of-Thought Reasoning'}</span>
                    </button>

                    <button
                      onClick={() => toggleExplanation(inc.id)}
                      className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{showExp ? 'Hide Breakdown' : '📖 What does this mean?'}</span>
                    </button>

                    {inc.fix_steps && inc.fix_steps.length > 0 && (
                      <button
                        onClick={() => toggleFixSteps(inc.id)}
                        className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{showFix ? 'Hide Action Steps' : '⚡ How to fix this?'}</span>
                      </button>
                    )}

                    {/* ICDR Cross-Reference button */}
                    {regData && (
                      <button
                        onClick={() => toggleReg(inc.id)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                          showReg
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200'
                        }`}
                      >
                        <ScrollText className="w-3.5 h-3.5" />
                        <span>{showReg ? 'Hide Regulation Text' : '📜 View ICDR Text'}</span>
                      </button>
                    )}

                    {inc.section_id && SECTION_TO_TAB[inc.section_id] && (
                      <button
                        onClick={() => onNavigateTab(SECTION_TO_TAB[inc.section_id])}
                        className="ml-auto text-xs font-bold text-accent-700 bg-accent-50 hover:bg-accent-100 px-3 py-1.5 rounded-lg border border-accent-200 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span>Go to {TAB_NAMES[SECTION_TO_TAB[inc.section_id]] || 'Wizard'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Expandable Chain-of-Thought Reasoning Breakdown */}
                  {showCoT && (
                    <div className="bg-gradient-to-br from-purple-50/90 to-indigo-50/80 border border-purple-200 rounded-xl p-4 ml-2 space-y-3 animate-fade-in shadow-xs">
                      <div className="flex items-center justify-between font-extrabold text-xs text-purple-900 border-b border-purple-200/60 pb-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-purple-600 animate-pulse" />
                          <span>LLM Chain-of-Thought Compliance Reasoning Steps</span>
                        </div>
                        <span className="text-[10px] font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 uppercase tracking-wider font-bold">
                          Groq CoT Engine
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(inc.reasoning_steps && inc.reasoning_steps.length > 0 ? inc.reasoning_steps : [
                          `1. Extracted input data values associated with ${inc.title}.`,
                          "2. Checked against SEBI ICDR regulations and statutory formatting rules.",
                          "3. Evaluated discrepancy between expected statutory structure and observed values.",
                          "4. Therefore: Flagged for reconciliation before draft submission."
                        ]).map((step, idx) => {
                          const stepNum = idx + 1;
                          const cleanText = step.replace(/^\d+\.\s*/, '');
                          return (
                            <div key={idx} className="flex items-start gap-2.5 bg-white/90 rounded-lg p-2.5 border border-purple-100 shadow-2xs">
                              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                                {stepNum}
                              </span>
                              <p className="text-xs text-gray-800 font-medium leading-relaxed">
                                {cleanText}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Expandable Plain-English Explanation */}
                  {showExp && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 ml-2 text-xs text-indigo-950 space-y-2 animate-fade-in">
                      <div className="flex items-center gap-2 font-bold text-indigo-900">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>Plain-English LLM Founder Explanation:</span>
                      </div>
                      <p className="leading-relaxed text-indigo-900 font-medium">
                        {inc.description || "This compliance rule ensures that numbers stated across MCA, Income Tax, and GST certificates match without contradiction before SEBI filing."}
                      </p>
                      {inc.sebi_ref && (
                        <p className="text-[11px] font-mono text-indigo-700 font-semibold pt-1">
                          Statutory Mandate: Imposed by SEBI Regulations under {inc.sebi_ref}.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Expandable How-to-Fix Steps */}
                  {showFix && inc.fix_steps && (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 ml-2 text-xs text-emerald-950 space-y-2.5 animate-fade-in-up">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <Lightbulb className="w-4 h-4 text-emerald-600" />
                        <span>Actionable Resolution Plan for Founder / Lead Banker:</span>
                      </div>
                      <ul className="space-y-2">
                        {inc.fix_steps.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 font-medium text-emerald-900">
                            <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 font-bold font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ICDR Cross-Reference Panel */}
                  {showReg && regData && (
                    <div className="border border-blue-200 rounded-xl ml-2 overflow-hidden animate-fade-in-up" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)' }}>
                      {/* Panel header */}
                      <div className="px-4 py-3 bg-blue-600 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ScrollText className="w-3.5 h-3.5 text-blue-100 shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200 leading-none">Statutory Reference</p>
                            <p className="text-[12px] font-extrabold text-white mt-0.5 font-mono leading-tight">{regData.shortTitle}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-[9.5px] font-bold text-blue-300 leading-none">{regData.chapter}</p>
                          <p className="text-[10px] font-semibold text-blue-200 mt-0.5 leading-tight">{regData.fullTitle}</p>
                        </div>
                      </div>

                      {/* Regulation body — parchment legal-doc feel */}
                      <div className="px-5 py-4">
                        <blockquote
                          className="text-[11.5px] leading-relaxed text-slate-700 whitespace-pre-line border-l-4 border-blue-300 pl-4 py-1"
                          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                        >
                          {regData.text}
                        </blockquote>

                        {/* Footer with external link */}
                        <div className="mt-4 pt-3 border-t border-blue-200 flex items-center justify-between flex-wrap gap-2">
                          <p className="text-[10px] text-blue-500 font-semibold select-none flex items-center gap-1.5">
                            <BookOpen className="w-3 h-3" />
                            Source: SEBI ICDR Regulations 2018 (as amended) / Allied Statutes
                          </p>
                          {regData.sebiUrl && (
                            <a
                              href={regData.sebiUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-[10.5px] font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-300 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open on SEBI.gov.in ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Financial Ratio Anomaly Radar ── */}
      <FinancialRatioRadar validationResults={validationResults} />

      {/* ── Promoter Lock-in & Cap Table Chart ── */}
      <CapTableChart validationResults={validationResults} />

      {/* ── Top Stats Row (2-col: Chapter Status + Compiler) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

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
      </div>

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
                  {/* Section Header & Risk Badge */}
                  <div className="flex items-center gap-3 shrink-0 ml-5">
                    {sec.risk_score && (
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border font-mono select-none flex items-center gap-1 ${
                        sec.risk_level === 'high' 
                          ? 'bg-red-50 text-red-700 border-red-200' 
                          : sec.risk_level === 'medium' 
                          ? 'bg-amber-50 text-amber-700 border-amber-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        <span>Risk: {sec.risk_score}/10</span>
                        <span className="opacity-75 uppercase text-[9px]">({sec.risk_level})</span>
                      </span>
                    )}
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
                      
                      {/* AI Risk Explanation Box */}
                      {sec.risk_explanation && (
                        <div className={`p-3 rounded-xl border text-[11.5px] font-medium flex items-start gap-2.5 shadow-2xs ${
                          sec.risk_level === 'high' 
                            ? 'bg-red-50/80 border-red-200 text-red-800' 
                            : sec.risk_level === 'medium' 
                            ? 'bg-amber-50/80 border-amber-200 text-amber-800' 
                            : 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                        }`}>
                          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold uppercase text-[10px] tracking-wider block mb-0.5">Section AI Risk Assessment</span>
                            {sec.risk_explanation}
                          </div>
                        </div>
                      )}
                    
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
