import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export default function ComplianceMap() {
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);

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
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading Compliance Map...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1280px', margin: '0 auto', color: '#f8fafc' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: '1.75rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        marginBottom: '2rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#38bdf8', marginBottom: '0.5rem' }}>
              📋 SEBI TechSprint Problem Statement Compliance Matrix
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
              Clause-by-clause mapping demonstrating how IPO Sherpa discharges every SEBI TechSprint mandate (PS-1 to PS-13).
            </p>
          </div>
          <button
            onClick={() => window.print()}
            style={{
              background: '#0284c7', color: '#fff', border: 'none', padding: '0.6rem 1.2rem',
              borderRadius: '6px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            🖨️ Print Compliance Report
          </button>
        </div>
      </div>

      {/* Matrix Table */}
      <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8' }}>
              <th style={{ padding: '1rem', width: '70px' }}>Clause</th>
              <th style={{ padding: '1rem', width: '220px' }}>SEBI Mandate Rationale</th>
              <th style={{ padding: '1rem', width: '260px' }}>Technical Discharge Mechanism</th>
              <th style={{ padding: '1rem' }}>Empirical Evidence & Implementation Proof</th>
              <th style={{ padding: '1rem', width: '100px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {clauses.map((item) => {
              const isComplete = item.status === 'complete';
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '1rem', fontWeight: '700', color: '#38bdf8' }}>
                    {item.id}
                  </td>
                  <td style={{ padding: '1rem', color: '#e2e8f0', fontStyle: 'italic' }}>
                    "{item.sebi_words}"
                  </td>
                  <td style={{ padding: '1rem', color: '#f1f5f9', fontWeight: '500' }}>
                    {item.discharged_by}
                  </td>
                  <td style={{ padding: '1rem', color: '#cbd5e1' }}>
                    <div>{item.proof}</div>
                    {item.caveat && (
                      <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '0.3rem' }}>
                        ⚠️ Caveat: {item.caveat}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {isComplete ? (
                      <span style={{
                        background: '#14532d', color: '#4ade80', padding: '0.25rem 0.6rem',
                        borderRadius: '4px', fontSize: '0.8rem', fontWeight: '700'
                      }}>
                        COMPLETE
                      </span>
                    ) : (
                      <span style={{
                        background: '#78350f', color: '#fde047', padding: '0.25rem 0.6rem',
                        borderRadius: '4px', fontSize: '0.8rem', fontWeight: '700'
                      }}>
                        PARTIAL
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
