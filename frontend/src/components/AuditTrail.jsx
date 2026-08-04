import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export default function AuditTrail() {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState('');

  const fetchAuditLog = async () => {
    try {
      setLoading(true);
      const query = selectedAction ? `?action=${encodeURIComponent(selectedAction)}` : '';
      const res = await apiFetch(`/api/audit${query}`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      }
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLog();
  }, [selectedAction]);

  const entries = auditData?.entries || [];
  const summary = auditData?.summary || {};

  const getActionIcon = (action) => {
    if (action.startsWith('section.certify')) return '📜';
    if (action.startswith && action.startsWith('export')) return '📦';
    if (action.startsWith('validation')) return '🔍';
    if (action.startsWith('blockchain')) return '🔗';
    if (action.startsWith('contradiction')) return '⚠️';
    return '📝';
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: '#f8fafc' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        padding: '1.75rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        marginBottom: '2rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#38bdf8', marginBottom: '0.5rem' }}>
              🛡️ Statutory Audit & Compliance Event Log
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
              Immutable append-only JSONL log recording every user action, validation check, certification event, and export attempt.
            </p>
          </div>
          <button
            onClick={fetchAuditLog}
            style={{
              background: '#334155', color: '#38bdf8', border: '1px solid #0284c7',
              padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
            }}
          >
            🔄 Refresh Log
          </button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#1e293b', padding: '1.2rem', borderRadius: '8px', border: '1px solid #334155' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Audit Events</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#38bdf8' }}>{summary.total_events || 0}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '1.2rem', borderRadius: '8px', border: '1px solid #334155' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Contradictions Flagged</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#fbbf24' }}>{summary.total_contradictions_found || 0}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '1.2rem', borderRadius: '8px', border: '1px solid #334155' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Banker Certifications</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#4ade80' }}>{summary.total_sections_certified || 0}</div>
        </div>
      </div>

      {/* Filter Control */}
      <div style={{ background: '#1e293b', padding: '1rem 1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Filter by Event Type:</span>
        <select
          value={selectedAction}
          onChange={(e) => setSelectedAction(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.9rem' }}
        >
          <option value="">All Action Types</option>
          <option value="section.certify">section.certify</option>
          <option value="section.review">section.review</option>
          <option value="export.docx">export.docx</option>
          <option value="export.blocked">export.blocked</option>
          <option value="validation.run">validation.run</option>
          <option value="contradiction.found">contradiction.found</option>
          <option value="blockchain.anchor">blockchain.anchor</option>
        </select>
      </div>

      {/* Event Timeline List */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', border: '1px solid #334155' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8' }}>Loading log entries...</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No audit events found for selected criteria.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {entries.map((entry, idx) => {
              const isSuccess = entry.outcome === 'success';
              const isDenied = entry.outcome === 'denied';
              return (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '1rem',
                  padding: '1rem', background: '#0f172a', borderRadius: '8px',
                  borderLeft: isSuccess ? '4px solid #22c55e' : isDenied ? '4px solid #ef4444' : '4px solid #f59e0b'
                }}>
                  <div style={{ fontSize: '1.4rem' }}>{getActionIcon(entry.action)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: '700', color: '#f1f5f9' }}>{entry.action}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                      Resource: <code style={{ color: '#38bdf8' }}>{entry.resource}</code>
                    </div>
                    {entry.detail && Object.keys(entry.detail).length > 0 && (
                      <pre style={{
                        background: '#1e293b', padding: '0.4rem 0.8rem', borderRadius: '4px',
                        color: '#cbd5e1', fontSize: '0.75rem', marginTop: '0.4rem', overflowX: 'auto'
                      }}>
                        {JSON.stringify(entry.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
