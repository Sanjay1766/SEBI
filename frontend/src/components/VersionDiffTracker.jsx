import React, { useState, useEffect } from 'react';
import { GitBranch, Plus, History, AlertCircle } from 'lucide-react';

export default function VersionDiffTracker({ apiFetch, validationResults, sessionData }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('versions');
  const [newTag, setNewTag] = useState('');
  const [newComment, setNewComment] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [validationResults, sessionData]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const fetcher = typeof apiFetch === 'function' ? apiFetch : window.fetch;
      const res = await fetcher('/api/version_tracker');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch version tracker history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (!newTag.trim() || !newComment.trim()) return;
    setCreating(true);
    try {
      const fetcher = typeof apiFetch === 'function' ? apiFetch : window.fetch;
      const res = await fetcher('/api/version_tracker/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_tag: newTag, comment: newComment })
      });
      if (res.ok) {
        setNewTag('');
        setNewComment('');
        await fetchHistory();
      }
    } catch (err) {
      console.error('Failed to create version snapshot:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8 text-center text-gray-500 font-medium">
        Loading DRHP Version History & SEBI Observation Tracker…
      </div>
    );
  }

  if (!data) return null;

  const hasVersions = data.versions && data.versions.length > 0;
  const hasObservations = data.sebi_observations && data.sebi_observations.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-[15px] text-gray-900">DRHP Revisions & SEBI Query Tracker</h3>
              <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-md">
                VERSION DIFF & AUDIT
              </span>
            </div>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Track prospectus draft snapshots & SEBI/Exchange observation letter query resolutions
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('versions')}
            className={`px-3.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
              activeTab === 'versions'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Draft Revision History ({data.total_versions})
          </button>
          <button
            onClick={() => setActiveTab('observations')}
            className={`px-3.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
              activeTab === 'observations'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            SEBI Observation Queries ({data.sebi_observations?.length || 0})
          </button>
        </div>
      </div>

      {/* Tab 1: Version Snapshots & Save Form */}
      {activeTab === 'versions' && (
        <div className="space-y-5">
          {/* Create Snapshot Form */}
          <form onSubmit={handleCreateSnapshot} className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/70 flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10.5px] font-mono font-bold uppercase text-blue-900">Version Tag</label>
              <input
                type="text"
                placeholder="e.g. DRHP Draft v1.0"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-[12px] font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-[2] space-y-1">
              <label className="text-[10.5px] font-mono font-bold uppercase text-blue-900">Revision Description / SEBI Note</label>
              <input
                type="text"
                placeholder="e.g. Initial draft milestone or SEBI query response update"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-[12px] font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newTag.trim()}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Saving…' : 'Save Version Snapshot'}</span>
            </button>
          </form>

          {/* Timeline list or Empty state */}
          {!hasVersions ? (
            <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl space-y-1 text-gray-400">
              <AlertCircle className="w-5 h-5 mx-auto text-gray-300" />
              <p className="text-[12.5px] font-bold text-gray-600">No Draft Versions Saved Yet</p>
              <p className="text-[11px]">Save your first DRHP snapshot above to begin tracking version history.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.versions.map((ver) => (
                <div key={ver.snapshot_id} className="p-4 rounded-xl border border-gray-200/80 hover:border-blue-300 transition-all flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                      <History className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-gray-900">{ver.version_tag}</span>
                        <span className="text-[10px] font-mono text-gray-400">{ver.timestamp}</span>
                      </div>
                      <p className="text-[11.5px] text-gray-600 font-medium mt-0.5">{ver.comment}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md border border-gray-200">
                      Snapshot Saved
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: SEBI Observation Letters */}
      {activeTab === 'observations' && (
        <div className="space-y-3 animate-fade-in">
          {!hasObservations ? (
            <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl space-y-1 text-gray-400">
              <AlertCircle className="w-5 h-5 mx-auto text-gray-300" />
              <p className="text-[12.5px] font-bold text-gray-600">No SEBI Observation Queries Logged</p>
              <p className="text-[11px]">Observation letters from SEBI or stock exchanges will appear here once filed.</p>
            </div>
          ) : (
            data.sebi_observations.map((obs) => (
              <div
                key={obs.id}
                className={`p-4 rounded-xl border transition-all ${
                  obs.status === 'resolved'
                    ? 'bg-emerald-50/30 border-emerald-200'
                    : 'bg-amber-50/40 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10.5px] font-bold text-gray-900 bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                      {obs.query_no}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 font-mono">
                      Authority: {obs.issuing_authority}
                    </span>
                  </div>
                  <span
                    className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-md ${
                      obs.status === 'resolved'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {obs.status === 'resolved' ? 'RESOLVED' : 'IN REVIEW'}
                  </span>
                </div>

                <h5 className="font-bold text-[12.5px] text-gray-900 mb-1">Query: {obs.query_text}</h5>
                <div className="mt-2.5 p-3 rounded-lg bg-white/80 border border-gray-200 text-[11.5px] text-gray-700 font-medium">
                  <span className="font-bold text-gray-900 text-[11px] uppercase tracking-wide block mb-0.5">
                    Prospectus Resolution Note ({obs.resolved_in_version}):
                  </span>
                  {obs.response_summary}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
