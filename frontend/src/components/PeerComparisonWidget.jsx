import React, { useState, useEffect } from 'react';
import { BarChart3, Calculator, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

export default function PeerComparisonWidget({ apiFetch, validationResults, sessionData, onPreFill }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lowerPrice, setLowerPrice] = useState(65);
  const [upperPrice, setUpperPrice] = useState(70);

  useEffect(() => {
    fetchPeerValuation();
  }, [validationResults, sessionData, lowerPrice, upperPrice]);

  const fetchPeerValuation = async () => {
    setLoading(true);
    try {
      const fetcher = typeof apiFetch === 'function' ? apiFetch : window.fetch;
      const res = await fetcher('/api/peer_comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposed_price_lower: parseFloat(lowerPrice) || 65.0,
          proposed_price_upper: parseFloat(upperPrice) || 70.0
        })
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load peer valuation data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!data && loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8 text-center text-gray-500 font-medium">
        Loading SEBI Schedule VI Peer Comparison & Valuation metrics…
      </div>
    );
  }

  if (!data) return null;

  const hasData = data.has_data;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-[15px] text-gray-900">SEBI Schedule VI Peer Comparison & Valuation</h3>
              <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-300 px-2 py-0.5 rounded-md">
                SCHEDULE VI DISCLOSURE
              </span>
            </div>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Listed SME peer group accounting ratio audit & IPO Valuation Price Band calculator
            </p>
          </div>
        </div>

        {/* Price Band Controls */}
        {hasData && (
          <div className="flex items-center gap-2 bg-purple-50/60 border border-purple-200/80 p-2 rounded-xl">
            <Calculator className="w-4 h-4 text-purple-700 shrink-0 ml-1" />
            <span className="text-[11px] font-bold text-purple-900 font-mono">Price Band (₹):</span>
            <input
              type="number"
              value={lowerPrice}
              onChange={(e) => setLowerPrice(e.target.value)}
              className="w-16 px-2 py-1 bg-white border border-purple-300 rounded-lg text-[12px] font-bold text-center text-purple-950 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <span className="text-[11px] font-bold text-purple-400">–</span>
            <input
              type="number"
              value={upperPrice}
              onChange={(e) => setUpperPrice(e.target.value)}
              className="w-16 px-2 py-1 bg-white border border-purple-300 rounded-lg text-[12px] font-bold text-center text-purple-950 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        )}
      </div>

      {/* Empty State Banner if workspace reset/no data */}
      {!hasData ? (
        <div className="p-8 rounded-2xl bg-purple-50/50 border border-purple-200/80 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-[14px] text-purple-950">No Financial Statements Uploaded</h4>
            <p className="text-[12px] text-purple-800/80 max-w-md mx-auto leading-relaxed">
              Upload P&L & Balance Sheet documents or fill in Revenue, PAT, and share capital figures to activate real-time peer comparison and valuation calculations.
            </p>
          </div>
          {onPreFill && (
            <button
              onClick={() => onPreFill('complete')}
              className="inline-flex items-center gap-2 text-xs font-bold text-purple-950 bg-purple-200/90 hover:bg-purple-300 px-4 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Load Sample Financial Data — Apex Technochem Ltd</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Peer Comparison Table */}
          <div className="space-y-2">
            <h4 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide font-mono">
              Mandatory Listed Accounting Ratios Comparison
            </h4>
            <div className="overflow-x-auto rounded-xl border border-gray-200/80">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-gray-50/80 text-gray-500 font-mono text-[10.5px] uppercase border-b border-gray-200/80">
                  <tr>
                    <th className="py-2.5 px-4">Company Name</th>
                    <th className="py-2.5 px-4">Face Value</th>
                    <th className="py-2.5 px-4">EPS (₹)</th>
                    <th className="py-2.5 px-4">NAV (₹)</th>
                    <th className="py-2.5 px-4">RONW (%)</th>
                    <th className="py-2.5 px-4">P/E Ratio</th>
                    <th className="py-2.5 px-4">Exchange Platform</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {/* Issuer Row */}
                  <tr className="bg-purple-50/50 font-bold text-purple-950">
                    <td className="py-3 px-4 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-600 block" />
                      {data.issuer_metrics.name}
                    </td>
                    <td className="py-3 px-4 font-mono">₹{data.issuer_metrics.face_value}</td>
                    <td className="py-3 px-4 font-mono">{data.issuer_metrics.eps}</td>
                    <td className="py-3 px-4 font-mono">{data.issuer_metrics.nav}</td>
                    <td className="py-3 px-4 font-mono text-emerald-700">{data.issuer_metrics.ronw}%</td>
                    <td className="py-3 px-4 font-mono">{data.issuer_metrics.pe_ratio}</td>
                    <td className="py-3 px-4 font-mono text-purple-800 text-[11px]">{data.issuer_metrics.listed_exchange}</td>
                  </tr>

                  {/* Peer Rows */}
                  {data.peer_group.map((peer, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/60 text-gray-700">
                      <td className="py-2.5 px-4 font-semibold text-gray-900">{peer.name}</td>
                      <td className="py-2.5 px-4 font-mono">₹{peer.face_value}</td>
                      <td className="py-2.5 px-4 font-mono">₹{peer.eps}</td>
                      <td className="py-2.5 px-4 font-mono">₹{peer.nav}</td>
                      <td className="py-2.5 px-4 font-mono">{peer.ronw}%</td>
                      <td className="py-2.5 px-4 font-mono">{peer.pe_ratio}x</td>
                      <td className="py-2.5 px-4 font-mono text-gray-500 text-[11px]">{peer.listed_exchange}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Valuation & Capital Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-purple-50/40 border border-purple-200/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 font-mono">
                Issue Size Range
              </span>
              <p className="text-[16px] font-extrabold text-purple-950 font-mono">
                {data.valuation_calculator.issue_size_range_cr}
              </p>
              <p className="text-[11px] text-purple-800/80 font-medium">
                Based on {data.valuation_calculator.fresh_issue_shares_cr} Cr Fresh Issue shares
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 font-mono">
                Post-Issue Paid-up Capital
              </span>
              <p className="text-[16px] font-extrabold text-emerald-950 font-mono">
                ₹{data.valuation_calculator.post_issue_paid_up_capital_cr} Crores
              </p>
              <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Compliant with ₹25 Cr Ceiling (Reg 229)</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-200/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 font-mono">
                Peer Group Avg P/E
              </span>
              <p className="text-[16px] font-extrabold text-blue-950 font-mono">
                {data.industry_averages.avg_pe_ratio}x P/E
              </p>
              <p className="text-[11px] text-blue-800/80 font-medium">
                Industry Avg RONW: {data.industry_averages.avg_ronw_pct}%
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
