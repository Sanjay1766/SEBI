import React, { useState } from 'react';
import { 
  ShieldAlert, AlertOctagon, AlertTriangle, Info, CheckCircle2, 
  Sparkles, RefreshCw, FileText, Search, ShieldCheck, ChevronRight, HelpCircle, Cpu
} from 'lucide-react';

const CATEGORY_BADGES = {
  vague_language: { label: 'Vague Language', icon: Search, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  missing_disclosure: { label: 'Missing Disclosure', icon: FileText, bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  regulatory_risk: { label: 'Regulatory Risk', icon: AlertOctagon, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  boilerplate: { label: 'Boilerplate Risk', icon: Info, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  overstatement: { label: 'Overstated Claim', icon: AlertTriangle, bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
};

const SEVERITY_BADGES = {
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function RedFlagScanner({ onScan, scanning, scanResults }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [expandedCoT, setExpandedCoT] = useState({});
  const toggleCoT = (id) => setExpandedCoT(prev => ({ ...prev, [id]: !prev[id] }));

  const flags = scanResults?.red_flags || [];
  const score = scanResults?.investor_protection_score ?? 78;
  const isDemo = scanResults?.source === 'demo_fallback';

  const filteredFlags = selectedCategory === 'ALL'
    ? flags
    : flags.filter(f => f.category === selectedCategory || f.severity === selectedCategory);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-md shadow-red-200 shrink-0 mt-0.5">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">Investor Protection & NLP Red Flag Scan</h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 tracking-wider">
                SEBI AI Guard
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-xl leading-relaxed">
              Automated NLP audit scanning draft prospectus narrative fields for vague language, boilerplate risk factors, missing disclosures, and overstatements that breach SEBI ICDR guidelines.
            </p>
          </div>
        </div>

        <button
          onClick={onScan}
          disabled={scanning}
          className="px-4 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-black hover:to-gray-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 shrink-0 self-start md:self-auto"
        >
          {scanning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
              <span>Scanning Narratives...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{flags.length > 0 ? 'Re-scan Narratives' : 'Run Investor Protection Scan'}</span>
            </>
          )}
        </button>
      </div>

      {/* Score Summary & Badges */}
      {scanResults && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gradient-to-r from-gray-50 to-rose-50/30 p-4 rounded-xl border border-gray-100">
          <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${
              score >= 80 ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
              score >= 60 ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {score}%
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Protection Score</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">
                {score >= 80 ? 'Robust Disclosure Standard' : score >= 60 ? 'Moderate Disclosure Risks' : 'High Investor Protection Exposure'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center font-bold text-base">
              {scanResults.high_severity_count || 0}
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">High Severity Red Flags</p>
              <p className="text-xs font-bold text-gray-700 mt-0.5">Requires Immediate Revision</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Scan Engine</p>
              <p className="text-xs font-bold text-gray-700 mt-0.5">
                {isDemo ? 'Rule-Based Compliance Engine' : 'Groq Llama-3.3 NLP Auditor'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      {flags.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1 shrink-0">Filter:</span>
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'ALL' ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Flags ({flags.length})
          </button>
          <button
            onClick={() => setSelectedCategory('HIGH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'HIGH' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            High Severity ({flags.filter(f => f.severity === 'HIGH').length})
          </button>
          {Object.entries(CATEGORY_BADGES).map(([key, cat]) => {
            const count = flags.filter(f => f.category === key).length;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === key ? 'bg-gray-900 text-white shadow-sm' : `${cat.bg} ${cat.text} hover:opacity-80`
                }`}
              >
                <span>{cat.label}</span>
                <span className="opacity-75 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Flag Cards List */}
      {flags.length > 0 ? (
        <div className="space-y-3">
          {filteredFlags.map((flag) => {
            const cat = CATEGORY_BADGES[flag.category] || CATEGORY_BADGES.vague_language;
            const CatIcon = cat.icon;
            const severityClass = SEVERITY_BADGES[flag.severity] || SEVERITY_BADGES.MEDIUM;

            return (
              <div
                key={flag.id}
                className="bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4.5 transition-all shadow-card hover:shadow-card-md flex flex-col md:flex-row gap-4 relative overflow-hidden"
              >
                <div className={`w-1.5 absolute left-0 top-0 bottom-0 ${
                  flag.severity === 'HIGH' ? 'bg-red-500' : flag.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />

                <div className="flex-1 space-y-2 pl-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-gray-800 bg-gray-100 px-2.5 py-0.5 rounded-md border border-gray-200">
                      {flag.field_label}
                    </span>
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border font-mono ${severityClass}`}>
                      {flag.severity} SEVERITY
                    </span>
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${cat.bg} ${cat.text} ${cat.border}`}>
                      <CatIcon className="w-3 h-3" />
                      {cat.label}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-gray-800 leading-relaxed">
                    <span className="text-red-600 font-bold mr-1">Issue:</span>
                    {flag.issue}
                  </p>

                  <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-lg flex items-start gap-2.5 text-xs text-emerald-900">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-emerald-800">Actionable Suggestion:</span> {flag.suggestion}
                    </div>
                  </div>

                  {flag.reasoning_steps && flag.reasoning_steps.length > 0 && (
                    <div className="pt-1">
                      <button
                        onClick={() => toggleCoT(flag.id)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                          expandedCoT[flag.id]
                            ? 'bg-purple-100 text-purple-900 border-purple-300'
                            : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
                        }`}
                      >
                        <Cpu className="w-3 h-3 text-purple-600" />
                        <span>{expandedCoT[flag.id] ? 'Hide CoT Reasoning' : '🧠 Chain-of-Thought Reasoning'}</span>
                      </button>

                      {expandedCoT[flag.id] && (
                        <div className="mt-2 bg-gradient-to-br from-purple-50/90 to-indigo-50/80 border border-purple-200 rounded-lg p-3 space-y-2 animate-fade-in">
                          <p className="text-[11px] font-extrabold text-purple-900 flex items-center gap-1.5 border-b border-purple-200/60 pb-1.5">
                            <Cpu className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                            LLM Chain-of-Thought Reasoning Steps
                          </p>
                          <div className="space-y-1.5">
                            {flag.reasoning_steps.map((step, idx) => (
                              <div key={idx} className="flex items-start gap-2 bg-white/90 rounded-md p-2 border border-purple-100">
                                <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <p className="text-[11px] text-gray-800 font-medium leading-relaxed">
                                  {step.replace(/^\d+\.\s*/, '')}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : scanResults ? (
        <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-100">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-bold text-sm text-emerald-800">No Investor-Protection Red Flags Detected</p>
          <p className="text-xs text-emerald-600 mt-1">Narratives comply with SEBI transparency and disclosure standards.</p>
        </div>
      ) : (
        <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <ShieldAlert className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-bold text-xs text-gray-700">Scan Ready</p>
          <p className="text-xs text-gray-400 mt-1">Click "Run Investor Protection Scan" above to run the NLP compliance check on prospectus narratives.</p>
        </div>
      )}
    </div>
  );
}
