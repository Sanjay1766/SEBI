import React, { useState } from 'react';
import { 
  BarChart2, TrendingUp, AlertTriangle, ShieldCheck, Cpu, 
  HelpCircle, ChevronDown, ChevronUp, Scale, Percent, DollarSign, Activity, Sparkles
} from 'lucide-react';

const SECTOR_LABELS = {
  manufacturing: 'SME Manufacturing & Engineering',
  trading: 'SME Wholesale & Trading',
  services: 'SME IT & Business Services',
};

export default function FinancialRatioRadar({ validationResults, onPreFill }) {
  const [expandedCoT, setExpandedCoT] = useState({});

  if (!validationResults) return null;

  // Extract inconsistencies and check for ratio anomaly flags
  const inconsistencies = validationResults.inconsistencies || validationResults.consistency_flags || [];
  const ratioFlags = inconsistencies.filter(inc => inc.id && inc.id.startsWith('ratio_'));
  const calcRatios = validationResults.calculated_ratios || {};
  const hasCalculatedRatios = Object.keys(calcRatios).length > 0;

  const hasRatioAnomalies = ratioFlags.length > 0;
  const toggleCoT = (id) => setExpandedCoT(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="card rounded-2xl p-6 border border-gray-200 shadow-card space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-100 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base text-gray-900">Financial Ratio Anomaly Radar</h3>
              <span className="text-[10px] font-extrabold uppercase bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full border border-purple-200 tracking-wider">
                SEBI Earnings Audit Engine
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Automated ratio auditor detecting abnormal PAT margins, excessive leverage, or inflated valuations compared to SME sector benchmarks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {!hasCalculatedRatios ? (
            <span className="text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-gray-400" />
              <span>Awaiting Financial Inputs</span>
            </span>
          ) : hasRatioAnomalies ? (
            <span className="text-xs font-extrabold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>{ratioFlags.length} Ratio Anomalies Detected</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Ratios Within Sector Norms</span>
            </span>
          )}
        </div>
      </div>

      {/* Empty State Banner when workspace reset / no data uploaded */}
      {!hasCalculatedRatios && ratioFlags.length === 0 ? (
        <div className="bg-gradient-to-r from-purple-50/70 to-indigo-50/70 border border-purple-200/70 rounded-2xl p-6 text-center space-y-3">
          <Activity className="w-8 h-8 text-purple-500 mx-auto opacity-80" />
          <h4 className="font-extrabold text-sm text-gray-800">No Financial Statements Uploaded</h4>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
            Upload your P&L & Balance Sheet documents or fill in Revenue, PAT, and Debt figures to activate real-time ratio anomaly detection.
          </p>
          {onPreFill && (
            <button
              onClick={() => onPreFill('complete')}
              className="inline-flex items-center gap-2 text-xs font-extrabold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer mt-1"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Load sample financial data — Apex Technochem Ltd</span>
            </button>
          )}
        </div>
      ) : (
        /* Ratios Cards Summary Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-gray-50/80 border border-gray-200/70 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold">
              <span>PAT Margin</span>
              <Percent className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="my-2">
              <span className="text-xl font-display font-extrabold text-gray-900">
                {calcRatios.pat_margin ? `${calcRatios.pat_margin.value}%` : 'N/A'}
              </span>
              <span className="text-[10px] font-medium text-gray-400 block">Sector Cap: 35.0%</span>
            </div>
            <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px] font-bold">
              <span className="text-gray-400">Benchmark: 5-18%</span>
              {calcRatios.pat_margin?.status === 'ANOMALY_HIGH' ? (
                <span className="text-red-600 font-extrabold bg-red-50 px-1.5 py-0.5 rounded border border-red-200">ANOMALY HIGH</span>
              ) : (
                <span className="text-emerald-600 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">NORMAL</span>
              )}
            </div>
          </div>

          <div className="bg-gray-50/80 border border-gray-200/70 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold">
              <span>EBITDA Margin</span>
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="my-2">
              <span className="text-xl font-display font-extrabold text-gray-900">
                {calcRatios.ebitda_margin ? `${calcRatios.ebitda_margin.value}%` : 'N/A'}
              </span>
              <span className="text-[10px] font-medium text-gray-400 block">Sector Cap: 45.0%</span>
            </div>
            <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px] font-bold">
              <span className="text-gray-400">Benchmark: 10-22%</span>
              {calcRatios.ebitda_margin?.status === 'ANOMALY' ? (
                <span className="text-amber-600 font-extrabold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">ELEVATED</span>
              ) : (
                <span className="text-emerald-600 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">NORMAL</span>
              )}
            </div>
          </div>

          <div className="bg-gray-50/80 border border-gray-200/70 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold">
              <span>Debt-to-Equity</span>
              <Scale className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="my-2">
              <span className="text-xl font-display font-extrabold text-gray-900">
                {calcRatios.de_ratio ? `${calcRatios.de_ratio.value}x` : 'N/A'}
              </span>
              <span className="text-[10px] font-medium text-gray-400 block">Cap Limit: 3.0x</span>
            </div>
            <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px] font-bold">
              <span className="text-gray-400">Benchmark: 0.2-2.0x</span>
              {calcRatios.de_ratio?.status === 'HIGH_LEVERAGE' ? (
                <span className="text-red-600 font-extrabold bg-red-50 px-1.5 py-0.5 rounded border border-red-200">HIGH LEVERAGE</span>
              ) : (
                <span className="text-emerald-600 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">NORMAL</span>
              )}
            </div>
          </div>

          <div className="bg-gray-50/80 border border-gray-200/70 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold">
              <span>P/E Multiple</span>
              <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="my-2">
              <span className="text-xl font-display font-extrabold text-gray-900">
                {calcRatios.pe_ratio ? `${calcRatios.pe_ratio.value}x` : 'N/A'}
              </span>
              <span className="text-[10px] font-medium text-gray-400 block">Sector Cap: 50.0x</span>
            </div>
            <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px] font-bold">
              <span className="text-gray-400">Benchmark: 12-30x</span>
              {calcRatios.pe_ratio?.status === 'OVERVALUED' ? (
                <span className="text-amber-600 font-extrabold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">HIGH P/E</span>
              ) : (
                <span className="text-emerald-600 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">NORMAL</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flagged Ratio Detail Items with Chain-of-Thought Reasoning */}
      {ratioFlags.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Ratio Anomaly Audit Findings ({ratioFlags.length})</span>
          </h4>

          <div className="space-y-3">
            {ratioFlags.map((flag) => {
              const showCoT = expandedCoT[flag.id];
              return (
                <div key={flag.id} className="bg-red-50/40 border border-red-200/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs text-red-900">{flag.title}</span>
                      <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 bg-red-100 text-red-700 rounded border border-red-200">
                        {flag.severity} SEVERITY
                      </span>
                    </div>
                    {flag.sebi_ref && (
                      <span className="text-[10.5px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        {flag.sebi_ref}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-700 leading-relaxed font-medium">
                    {flag.description}
                  </p>

                  <div className="flex items-center gap-2 pt-1 border-t border-red-100">
                    <button
                      onClick={() => toggleCoT(flag.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                        showCoT 
                          ? 'bg-purple-100 text-purple-900 border-purple-300'
                          : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5 text-purple-600" />
                      <span>{showCoT ? 'Hide CoT Breakdown' : '🧠 View CoT Audit Reasoning'}</span>
                    </button>
                  </div>

                  {showCoT && (
                    <div className="bg-white/95 border border-purple-200 rounded-xl p-3.5 space-y-2 animate-fade-in shadow-xs">
                      <div className="flex items-center gap-2 font-extrabold text-xs text-purple-900 border-b border-purple-100 pb-1.5">
                        <Cpu className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                        <span>LLM Financial Ratio Audit Reasoning</span>
                      </div>
                      <div className="space-y-1.5">
                        {(flag.reasoning_steps || []).map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-purple-50/40 rounded-lg p-2 border border-purple-100/60">
                            <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9.5px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <p className="text-xs text-gray-800 font-medium leading-relaxed">
                              {step.replace(/^\d+\.\s*/, '')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
