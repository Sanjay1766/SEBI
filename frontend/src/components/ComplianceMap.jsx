import React, { useState, useEffect } from 'react';
import { AlertTriangle, ClipboardList, Printer, Search, Loader2 } from 'lucide-react';
import { apiFetch } from '../api';
import Badge from './ui/Badge';

export default function ComplianceMap() {
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    async function loadMapping() {
      try {
        const res = await apiFetch('/api/ps-mapping');
        if (res.ok) {
          const data = await res.json();
          setClauses(data.clauses || []);
        }
      } catch (err) {
        console.error('Failed to load PS mapping:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMapping();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-24 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading Compliance Map…
      </div>
    );
  }

  const filtered = query.trim()
    ? clauses.filter(c =>
        c.id?.toLowerCase().includes(query.toLowerCase()) ||
        c.sebi_words?.toLowerCase().includes(query.toLowerCase()) ||
        c.discharged_by?.toLowerCase().includes(query.toLowerCase())
      )
    : clauses;

  const completeCount = clauses.filter(c => c.status === 'complete').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-page-title flex items-center gap-2.5">
            <ClipboardList className="w-7 h-7 text-accent-500" /> Compliance Matrix
          </h1>
          <p className="text-body mt-1">
            Clause-by-clause mapping demonstrating how IPO Sherpa discharges every SEBI TechSprint mandate (PS-1 to PS-13).
          </p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary shrink-0">
          <Printer className="w-3.5 h-3.5" /> Print Report
        </button>
      </div>

      {/* Summary + search */}
      <div className="card rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="success">{completeCount} / {clauses.length} Complete</Badge>
          <span className="text-caption">Problem statements PS-1 through PS-13</span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clauses…"
            className="form-input-base !pl-8 !py-2 !text-[12.5px]"
          />
        </div>
      </div>

      {/* Matrix Table */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-caption uppercase tracking-wide">
                <th className="px-5 py-3.5 font-bold w-20">Clause</th>
                <th className="px-5 py-3.5 font-bold w-56">SEBI Mandate Rationale</th>
                <th className="px-5 py-3.5 font-bold w-64">Technical Discharge Mechanism</th>
                <th className="px-5 py-3.5 font-bold">Empirical Evidence &amp; Implementation Proof</th>
                <th className="px-5 py-3.5 font-bold w-28 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const isComplete = item.status === 'complete';
                return (
                  <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4 font-bold text-accent-600">{item.id}</td>
                    <td className="px-5 py-4 text-gray-500 italic leading-relaxed">"{item.sebi_words}"</td>
                    <td className="px-5 py-4 text-gray-800 font-medium leading-relaxed">{item.discharged_by}</td>
                    <td className="px-5 py-4 text-gray-600 leading-relaxed">
                      <div>{item.proof}</div>
                      {item.caveat && (
                        <div className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" /> Caveat: {item.caveat}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Badge variant={isComplete ? 'success' : 'warning'} size="xs">
                        {isComplete ? 'COMPLETE' : 'PARTIAL'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                    No clauses match "{query}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
