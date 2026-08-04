import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

const CERTIFIABLE_SECTIONS = [
  { key: "cover_page", name: "Cover Page & Issue Particulars" },
  { key: "business_overview", name: "Business Overview & Operations" },
  { key: "risk_factors", name: "Risk Factors & Disclosures" },
  { key: "capital_structure", name: "Capital Structure & Promoter Shareholding" },
  { key: "objects_of_issue", name: "Objects of the Issue & GCP Allocation" },
  { key: "financial_summary", name: "Financial Statements & Restated Performance" },
  { key: "promoter_details", name: "Promoter Details & Management" },
  { key: "litigation", name: "Outstanding Litigation & Regulatory Approvals" },
  { key: "management_discussion", name: "Management Discussion & Analysis (MD&A)" },
  { key: "industry_overview", name: "Industry Overview & Sector Trends" },
  { key: "regulatory_approvals", name: "Government & Statutory Approvals" },
];

export default function BankerDashboard() {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bankerName, setBankerName] = useState('Senior Merchant Banker');
  const [actionNotes, setActionNotes] = useState({});
  const [activeModalSection, setActiveModalSection] = useState(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/certification/status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (err) {
      console.error('Failed to fetch certification status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleReview = async (secKey) => {
    const note = actionNotes[secKey] || '';
    try {
      const res = await apiFetch(`/api/certification/${secKey}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer_note: note })
      });
      if (res.ok) fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCertify = async (secKey) => {
    const note = actionNotes[secKey] || '';
    try {
      const res = await apiFetch(`/api/certification/${secKey}/certify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banker_name: bankerName, banker_notes: note })
      });
      if (res.ok) {
        setActiveModalSection(null);
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUncertify = async (secKey) => {
    try {
      const res = await apiFetch(`/api/certification/${secKey}/uncertify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Reopened for revisions' })
      });
      if (res.ok) fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadBundle = async () => {
    try {
      const res = await apiFetch('/api/export/bundle');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SEBI_SME_IPO_Efiling_Bundle.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const errData = await res.json();
        alert(`Export Blocked: ${errData.message || 'All sections must be certified.'}`);
      }
    } catch (err) {
      alert('Error initiating bundle export');
    }
  };

  if (loading && !statusData) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading Banker Dashboard...</div>;
  }

  const states = statusData?.states || {};
  const certifiedCount = statusData?.certified_count || 0;
  const totalRequired = statusData?.total_required || 11;
  const isAllowed = statusData?.export_allowed || false;
  const progressPct = Math.round((certifiedCount / totalRequired) * 100);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#38bdf8', marginBottom: '0.5rem' }}>
              🏦 Merchant Banker Certification Dashboard
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
              SEBI Chapter IX Mandate: DRHP export is strictly gated until all 11 statutory prospectus sections are certified by an authorized intermediary.
            </p>
          </div>

          <div>
            {isAllowed ? (
              <span style={{
                background: '#166534', color: '#4ade80', padding: '0.5rem 1rem', borderRadius: '20px',
                fontWeight: '600', border: '1px solid #22c55e', fontSize: '0.9rem'
              }}>
                ✓ EXPORT READY
              </span>
            ) : (
              <span style={{
                background: '#991b1b', color: '#fca5a5', padding: '0.5rem 1rem', borderRadius: '20px',
                fontWeight: '600', border: '1px solid #ef4444', fontSize: '0.9rem'
              }}>
                🔒 EXPORT BLOCKED ({certifiedCount}/{totalRequired} Certified)
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
            <span>Certification Progress</span>
            <span>{certifiedCount} of {totalRequired} Sections ({progressPct}%)</span>
          </div>
          <div style={{ background: '#334155', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`, background: isAllowed ? '#22c55e' : '#0ea5e9', height: '100%',
              transition: 'width 0.4s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Banker Particulars Input */}
      <div style={{ background: '#1e293b', padding: '1rem 1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Signing Merchant Banker Name:</span>
        <input
          type="text"
          value={bankerName}
          onChange={(e) => setBankerName(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.9rem', width: '260px' }}
        />
        <button
          onClick={handleDownloadBundle}
          disabled={!isAllowed}
          style={{
            marginLeft: 'auto', background: isAllowed ? '#22c55e' : '#475569', color: '#fff',
            border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontWeight: '600',
            cursor: isAllowed ? 'pointer' : 'not-allowed'
          }}
        >
          Download Export Bundle (.ZIP)
        </button>
      </div>

      {/* Table of Certifiable Sections */}
      <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
              <th style={{ padding: '1rem' }}>Section</th>
              <th style={{ padding: '1rem' }}>Status</th>
              <th style={{ padding: '1rem' }}>Certified By / Notes</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {CERTIFIABLE_SECTIONS.map((sec) => {
              const st = states[sec.key] || { status: 'draft' };
              const isCertified = st.status === 'certified';
              const isReviewed = st.status === 'reviewed';

              return (
                <tr key={sec.key} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '1rem', fontWeight: '600', color: '#f1f5f9' }}>
                    {sec.name}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {isCertified && (
                      <span style={{ background: '#14532d', color: '#4ade80', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600' }}>
                        CERTIFIED
                      </span>
                    )}
                    {isReviewed && (
                      <span style={{ background: '#1e3a8a', color: '#60a5fa', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600' }}>
                        REVIEWED
                      </span>
                    )}
                    {st.status === 'draft' && (
                      <span style={{ background: '#334155', color: '#cbd5e1', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600' }}>
                        DRAFT
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>
                    {isCertified ? (
                      <div>
                        <div style={{ color: '#e2e8f0', fontWeight: '500' }}>{st.certified_by}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{st.certified_at ? new Date(st.certified_at).toLocaleString() : ''}</div>
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="Add review note..."
                        value={actionNotes[sec.key] || ''}
                        onChange={(e) => setActionNotes({ ...actionNotes, [sec.key]: e.target.value })}
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', width: '90%' }}
                      />
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      {!isCertified && (
                        <>
                          <button
                            onClick={() => handleReview(sec.key)}
                            style={{ background: '#334155', color: '#e2e8f0', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            Mark Reviewed
                          </button>
                          <button
                            onClick={() => handleCertify(sec.key)}
                            style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                          >
                            Certify
                          </button>
                        </>
                      )}
                      {isCertified && (
                        <button
                          onClick={() => handleUncertify(sec.key)}
                          style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          Revoke Certification
                        </button>
                      )}
                    </div>
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
