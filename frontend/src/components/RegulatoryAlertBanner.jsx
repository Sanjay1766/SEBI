import React, { useState, useEffect } from 'react';
import { Bell, ShieldAlert, ExternalLink, ChevronDown, ChevronUp, AlertCircle, FileText, ArrowRight } from 'lucide-react';

export default function RegulatoryAlertBanner({ apiFetch, onNavigateTab }) {
  const [alertsData, setAlertsData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAlerts = async () => {
      try {
        const res = await apiFetch('/api/regulatory_alerts');
        if (res.ok && isMounted) {
          const data = await res.json();
          setAlertsData(data);
        }
      } catch (err) {
        console.error("Failed to fetch regulatory alerts:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAlerts();
    return () => { isMounted = false; };
  }, [apiFetch]);

  if (loading || !alertsData || !alertsData.alerts || alertsData.alerts.length === 0) {
    return null;
  }

  const impactedAlerts = alertsData.alerts.filter(a => a.is_session_impacted);
  const primaryAlert = impactedAlerts.length > 0 ? impactedAlerts[0] : alertsData.alerts[0];

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-slate-900/5 border border-amber-200/80 rounded-2xl p-4 shadow-sm animate-fade-in select-none">
      {/* Top Banner Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-amber-500/15 border border-amber-300 rounded-xl flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-amber-600 animate-bounce" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-800 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md font-mono">
                SEBI Circular Update
              </span>
              <span className="text-[10px] font-bold text-gray-400 font-mono">
                {alertsData.alerts.length} Active Circulars
              </span>
            </div>
            <h4 className="font-bold text-[13px] text-gray-800 truncate mt-0.5">
              {primaryAlert.title}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <a
            href={primaryAlert.sebi_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-amber-800 bg-amber-100/80 hover:bg-amber-200/80 border border-amber-300 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            <span>Open SEBI Circular</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <span>{expanded ? 'Hide Details' : 'View All Circulars'}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Circular Details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-amber-200/60 space-y-3.5 animate-fade-in">
          {alertsData.alerts.map((circ) => (
            <div
              key={circ.id}
              className={`p-4 rounded-xl border transition-all ${
                circ.is_session_impacted
                  ? 'bg-amber-500/10 border-amber-300 shadow-xs'
                  : 'bg-white/80 border-gray-200/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10.5px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md">
                    {circ.circular_no}
                  </span>
                  <span className="text-[10px] text-gray-500 font-semibold font-mono">
                    Dated: {circ.date}
                  </span>
                  {circ.is_session_impacted && (
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-md animate-pulse">
                      Action Needed on DRHP
                    </span>
                  )}
                </div>
                
                <a
                  href={circ.sebi_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10.5px] font-bold text-amber-700 hover:text-amber-900 underline flex items-center gap-1 shrink-0"
                >
                  Official PDF <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <h5 className="font-bold text-[13px] text-gray-900 mb-1">{circ.title}</h5>
              <p className="text-[11.5px] text-gray-600 leading-relaxed font-medium mb-2">{circ.summary}</p>

              {circ.is_session_impacted && (
                <div className="mt-2.5 p-3 rounded-lg bg-red-50/90 border border-red-200 text-[11.5px] text-red-900 font-medium space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-red-800 text-[11px] uppercase tracking-wide">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                    <span>Statutory Impact Analysis</span>
                  </div>
                  <p className="leading-snug">{circ.impact_analysis}</p>
                  <p className="text-red-700 font-bold mt-1">Required Fix: {circ.action_required}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
