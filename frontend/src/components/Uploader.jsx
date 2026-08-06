import React, { useRef, useState } from 'react';
import {
  UploadCloud, FileText, AlertCircle, Eye, EyeOff, Loader2, X, ShieldCheck,
  BarChart3, Receipt, ScrollText, IdCard, BookOpen, Calculator, UserCog, Scale, LineChart,
} from 'lucide-react';
import Badge from './ui/Badge';

export default function Uploader({
  sessionData,
  onUploadSuccess,
  apiFetch,
}) {

  const DOC_TYPES = [
    'financials', 'gst', 'incorporation', 'compliance',
    'moa_aoa', 'cap_table', 'dir12', 'litigation_schedule', 'industry_report', 'sales_register',
  ];
  const initFalse = () => Object.fromEntries(DOC_TYPES.map(t => [t, false]));
  const initEmptyStr = () => Object.fromEntries(DOC_TYPES.map(t => [t, '']));
  const initNull = () => Object.fromEntries(DOC_TYPES.map(t => [t, null]));

  const [uploading, setUploading] = useState(initFalse());

  const [error, setError] = useState(initEmptyStr());

  const [dragging, setDragging] = useState(initFalse());

  // Collapsed by default — cards stay compact; clicking the eye icon expands
  // the extracted-fields panel in place (with its own internal scroll) so
  // opening one card's detail never grows the grid or forces the page to scroll.
  const [expandedJson, setExpandedJson] = useState(initFalse());

  const [vcModal, setVcModal] = useState(null);

  const fetchAndShowVC = async (docType) => {
    try {
      const res = await apiFetch(`/api/credentials/${docType}`);
      if (res.ok) {
        const data = await res.json();
        setVcModal(data);
      }
    } catch (err) {
      console.error("Failed to fetch W3C VC:", err);
    }
  };

  const fileInputs = {
    financials: useRef(null),
    gst: useRef(null),
    incorporation: useRef(null),
    compliance: useRef(null),
    moa_aoa: useRef(null),
    cap_table: useRef(null),
    dir12: useRef(null),
    litigation_schedule: useRef(null),
    industry_report: useRef(null),
    sales_register: useRef(null),
  };

  const [jobState, setJobState] = useState(initNull());

  const handleUpload = async (docType, file) => {
    if (!file) return;
    
    setUploading(prev => ({ ...prev, [docType]: true }));
    setError(prev => ({ ...prev, [docType]: '' }));
    setJobState(prev => ({
      ...prev,
      [docType]: { progress: 15, stage: 'Validating document integrity & hash...', status: 'processing', filename: file.name }
    }));

    const formData = new FormData();
    formData.append('doc_type', docType);
    formData.append('file', file);

    try {
      const response = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload and parse document.');
      }

      const result = await response.json();
      const jobId = result.job_id;

      if (!jobId) {
        onUploadSuccess(docType, result.extracted, { filename: result.filename, size: file.size, extraction_status: result.extraction_status, extraction_error: result.extraction_error });
        setUploading(prev => ({ ...prev, [docType]: false }));
        setJobState(prev => ({ ...prev, [docType]: null }));
        return;
      }

      // Poll background job status endpoint (/api/jobs/{id}/status)
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await apiFetch(`/api/jobs/${jobId}/status`);
          if (statusRes.ok) {
            const jobData = await statusRes.json();
            setJobState(prev => ({
              ...prev,
              [docType]: {
                progress: jobData.progress || 15,
                stage: jobData.stage || 'Processing document...',
                status: jobData.status,
                filename: file.name
              }
            }));

            if (jobData.status === 'completed') {
              clearInterval(pollInterval);
              onUploadSuccess(
                docType,
                jobData.extracted_data || {},
                {
                  filename: file.name,
                  size: file.size,
                  extraction_status: 'completed',
                  extraction_error: null
                }
              );
              setTimeout(() => {
                setUploading(prev => ({ ...prev, [docType]: false }));
                setJobState(prev => ({ ...prev, [docType]: null }));
              }, 1200);
            } else if (jobData.status === 'failed') {
              clearInterval(pollInterval);
              setError(prev => ({ ...prev, [docType]: jobData.error || 'Extraction failed.' }));
              setUploading(prev => ({ ...prev, [docType]: false }));
              setJobState(prev => ({ ...prev, [docType]: null }));
            }
          }
        } catch (pollErr) {
          console.error("Polling job status error:", pollErr);
        }
      }, 750);

    } catch (err) {
      console.error(err);
      setError(prev => ({ ...prev, [docType]: err.message || 'An error occurred.' }));
      setUploading(prev => ({ ...prev, [docType]: false }));
      setJobState(prev => ({ ...prev, [docType]: null }));
    }
  };

  const triggerFileInput = (docType) => {
    fileInputs[docType].current?.click();
  };

  const handleDragOver = (e, docType) => {
    e.preventDefault();
    setDragging(prev => ({ ...prev, [docType]: true }));
  };

  const handleDragLeave = (docType) => {
    setDragging(prev => ({ ...prev, [docType]: false }));
  };

  const handleDrop = (e, docType) => {
    e.preventDefault();
    setDragging(prev => ({ ...prev, [docType]: false }));
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(docType, file);
  };

  const docConfig = {
    financials: {
      title: 'Financial Statements',
      desc: 'Restated financial statements for the past 3 fiscal years (PDF/Image).',
      accentColor: 'text-blue-600',
      accentBg: 'bg-blue-50/60',
      accentBorder: 'border-blue-200/80',
      iconBg: 'bg-blue-100/80',
      icon: BarChart3,
      extractedKeys: {
        fy_years: 'Fiscal Years',
        revenue_fy_latest: 'Latest Revenue',
        pat_fy_latest: 'Latest Net Profit',
        borrowings_latest: 'Outstanding Borrowings',
        auditor_name: 'Statutory Auditor',
        auditor_membership: 'Auditor Membership'
      }
    },
    gst: {
      title: 'GST Registration & Returns',
      desc: 'GSTR-3B summary or GSTIN Certificate.',
      accentColor: 'text-emerald-600',
      accentBg: 'bg-emerald-50/60',
      accentBorder: 'border-emerald-200/80',
      iconBg: 'bg-emerald-100/80',
      icon: Receipt,
      extractedKeys: {
        gstin: 'GSTIN Registration',
        company_name: 'Taxpayer Legal Name',
        gst_annual_turnover: 'GST Turnover',
        registration_date: 'Registration Date',
        filing_status: 'Filing Status'
      }
    },
    incorporation: {
      title: 'Incorporation Docs',
      desc: 'Certificate of Incorporation Issued by Registrar of Companies (PDF/Image).',
      accentColor: 'text-blue-600',
      accentBg: 'bg-blue-50/60',
      accentBorder: 'border-blue-200/80',
      iconBg: 'bg-blue-100/80',
      icon: ScrollText,
      extractedKeys: {
        cin: 'RoC Corporate ID (CIN)',
        company_name: 'RoC Registered Name',
        incorporation_date: 'Incorporation Date',
        registered_office: 'Registered Office Address',
        company_type: 'Company Category'
      }
    },
    compliance: {
      title: 'PAN & TAN Licenses',
      desc: 'Statutory company PAN, TAN or local operating licenses (PDF/Image).',
      accentColor: 'text-amber-600',
      accentBg: 'bg-amber-50/60',
      accentBorder: 'border-amber-200/80',
      iconBg: 'bg-amber-100/80',
      icon: IdCard,
      extractedKeys: {
        pan: 'Company PAN No.',
        pan_name: 'Name on PAN',
        tan: 'Company TAN No.'
      }
    },
    moa_aoa: {
      title: 'MOA / AOA',
      desc: 'Memorandum and Articles of Association (PDF).',
      accentColor: 'text-indigo-600',
      accentBg: 'bg-indigo-50/60',
      accentBorder: 'border-indigo-200/80',
      iconBg: 'bg-indigo-100/80',
      icon: BookOpen,
      extractedKeys: {
        authorized_capital: 'Authorized Capital',
        face_value_per_share: 'Face Value / Share',
        objects_clause: 'Objects Clause'
      }
    },
    cap_table: {
      title: 'Register of Members / Cap Table',
      desc: 'Shareholder register for pre-offer shareholding and promoter group (PDF).',
      accentColor: 'text-violet-600',
      accentBg: 'bg-violet-50/60',
      accentBorder: 'border-violet-200/80',
      iconBg: 'bg-violet-100/80',
      icon: Calculator,
      extractedKeys: {
        promoter_shareholding_pre_pct: 'Promoter Shareholding %',
        pre_offer_shareholding: 'Pre-Offer Shareholding Rows',
        promoter_group_members: 'Promoter Group Members'
      }
    },
    dir12: {
      title: 'DIR-12 / Board Resolutions',
      desc: 'Director/KMP appointment filings (PDF).',
      accentColor: 'text-cyan-600',
      accentBg: 'bg-cyan-50/60',
      accentBorder: 'border-cyan-200/80',
      iconBg: 'bg-cyan-100/80',
      icon: UserCog,
      extractedKeys: {
        directors: 'Directors Found',
        kmp: 'KMP Found'
      }
    },
    litigation_schedule: {
      title: 'Litigation Schedule',
      desc: 'Structured litigation schedule from legal counsel (PDF) — not free-text scraped.',
      accentColor: 'text-rose-600',
      accentBg: 'bg-rose-50/60',
      accentBorder: 'border-rose-200/80',
      iconBg: 'bg-rose-100/80',
      icon: Scale,
      extractedKeys: {
        litigation_summary: 'Litigation Summary Rows'
      }
    },
    industry_report: {
      title: 'Industry Report',
      desc: 'CRISIL / CARE / ICRA industry report (PDF) — best-effort, low-confidence extraction.',
      accentColor: 'text-teal-600',
      accentBg: 'bg-teal-50/60',
      accentBorder: 'border-teal-200/80',
      iconBg: 'bg-teal-100/80',
      icon: LineChart,
      extractedKeys: {
        industry_market_size: 'Market Size',
        industry_cagr: 'CAGR',
        industry_report_source: 'Report Source'
      }
    },
    sales_register: {
      title: 'Sales Register / GST Sales',
      desc: 'Sales ledger or GST sales register for customer concentration (PDF).',
      accentColor: 'text-orange-600',
      accentBg: 'bg-orange-50/60',
      accentBorder: 'border-orange-200/80',
      iconBg: 'bg-orange-100/80',
      icon: Receipt,
      extractedKeys: {
        top5_customer_revenue_table: 'Top-5 Customer Rows',
        key_geographies_served: 'Geographies',
        gst_annual_turnover: 'GST Turnover'
      }
    }
  };

  const formatValue = (key, val) => {
    if (val === null || val === undefined || val === '') {
      return <Badge variant="danger" size="xs" className="uppercase">Missing</Badge>;
    }
    if (typeof val === 'number') {
      return `₹ ${val.toFixed(2)} Cr`;
    }
    if (Array.isArray(val)) {
      return val.length === 0 ? (
        <span className="text-red-500 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md text-[9px] uppercase select-none">
          Missing
        </span>
      ) : `${val.length} row${val.length === 1 ? '' : 's'} found`;
    }
    return String(val);
  };

  return (
    <div className="w-full space-y-3 animate-fade-in-up">
      {/* Page header — compact single line, no wasted vertical space */}
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-page-title">Document Vault</h1>
        <p className="text-[11.5px] text-gray-400 font-medium">10 statutory documents · click a card to upload</p>
      </div>

      {/* 5×2 on desktop — each card is deliberately compact (no long description,
          extracted fields collapsed by default) so the whole vault fits in one
          viewport with zero page scrolling. Degrades to fewer columns on
          narrower screens rather than forcing 5 cramped columns everywhere. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        {Object.entries(docConfig).map(([type, config]) => {
          const isUploading = uploading[type];
          const hasError = error[type];
          const isDragging = dragging[type];
          const extractedData = sessionData.extracted_data?.[type] || {};
          const uploadedFileObj = sessionData.uploaded_files?.find(f => f.type === type);
          const extractionCompleted = uploadedFileObj?.extraction_status === 'completed';
          const isUploaded = Object.keys(extractedData).length > 0 || !!uploadedFileObj;
          const showJson = expandedJson[type];
          const extractedCount = Object.keys(config.extractedKeys).filter(k => {
            const v = extractedData[k];
            return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
          }).length;

          return (
            <div
              key={type}
              title={config.desc}
              className={`bg-white border rounded-xl p-3 flex flex-col shadow-card transition-all duration-200 ${
                isUploaded
                  ? 'border-gray-200 shadow-card'
                  : 'border-gray-100 hover:border-gray-200 hover:shadow-card-md'
              }`}
            >
              {/* Compact header: icon + title + status dot, one line */}
              <div className="flex items-center gap-2 mb-2 select-none min-w-0">
                <div className={`w-7 h-7 ${config.iconBg} rounded-lg flex items-center justify-center shrink-0`}>
                  <config.icon className={`w-3.5 h-3.5 ${config.accentColor}`} />
                </div>
                <h3 className="text-[11.5px] font-bold text-gray-800 leading-tight truncate flex-1 min-w-0">{config.title}</h3>
                {isUploaded && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${extractionCompleted ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    title={extractionCompleted ? 'Extracted — review required' : 'Manual review required'}
                  />
                )}
              </div>

              {/* Short blurb — reserves a fixed 2-line height (line-clamp) so every
                  card stays the same height regardless of description length. */}
              <p className="text-[9px] text-gray-400 leading-snug line-clamp-2 mb-2 min-h-[22px]">
                {config.desc}
              </p>

              {/* Upload Zone */}
              {!isUploaded && !isUploading && (
                <div
                  onClick={() => triggerFileInput(type)}
                  onDragOver={(e) => handleDragOver(e, type)}
                  onDragLeave={() => handleDragLeave(type)}
                  onDrop={(e) => handleDrop(e, type)}
                  className={`flex-1 border-2 border-dashed rounded-lg p-2.5 text-center cursor-pointer transition-all flex flex-col items-center justify-center group min-h-[68px] ${
                    isDragging
                      ? `${config.accentBorder} ${config.accentBg}`
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <UploadCloud className={`w-4 h-4 mb-1 transition-colors ${
                    isDragging ? config.accentColor : 'text-gray-300 group-hover:text-gray-400'
                  }`} />
                  <p className="text-[10px] text-gray-500 font-semibold leading-tight">
                    {isDragging ? 'Drop to upload' : 'Click or drop file'}
                  </p>
                </div>
              )}

              {/* Uploading State — slim progress bar */}
              {isUploading && (
                <div className="flex-1 border border-accent-200 bg-accent-50/40 rounded-lg p-2 select-none space-y-1.5 animate-fade-in-up min-h-[68px] flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Loader2 className="w-3 h-3 text-accent-600 animate-spin shrink-0" />
                      <span className="text-[9.5px] font-bold text-gray-700 truncate">
                        {jobState[type]?.stage || 'Analyzing…'}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-accent-700 shrink-0">{jobState[type]?.progress || 15}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden border border-gray-200">
                    <div
                      className="bg-gradient-to-r from-accent-500 via-blue-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${jobState[type]?.progress || 15}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error State */}
              {hasError && (
                <div className="mt-1.5 p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[9.5px] flex gap-1.5 items-start animate-fade-in-up">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <p className="text-red-500 leading-tight flex-1">{hasError}</p>
                  <button
                    onClick={() => setError(prev => ({ ...prev, [type]: '' }))}
                    className="p-0.5 hover:bg-red-100 rounded shrink-0 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Uploaded File Info — one compact row */}
              {isUploaded && !isUploading && (
                <div className="flex-1 bg-gray-50 rounded-lg border border-gray-100 p-1.5 select-none min-h-[68px] flex flex-col justify-between gap-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                      <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                      <p className="text-[10px] text-gray-700 font-semibold truncate">{uploadedFileObj?.filename || 'Uploaded'}</p>
                    </div>
                    <button
                      onClick={() => setExpandedJson(prev => ({ ...prev, [type]: !prev[type] }))}
                      className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition-colors shrink-0 cursor-pointer"
                      title="Inspect extracted fields"
                    >
                      {showJson ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] text-gray-400 font-medium truncate">
                      {extractionCompleted ? `${extractedCount} field${extractedCount === 1 ? '' : 's'} extracted` : 'Manual entry needed'}
                    </span>
                    <button
                      onClick={() => fetchAndShowVC(type)}
                      className="text-[8.5px] font-bold text-indigo-500 hover:text-indigo-700 shrink-0 cursor-pointer"
                      title="Inspect W3C Verifiable Credential"
                    >
                      VC ↗
                    </button>
                  </div>

                  {/* Extracted Properties — expands in place with its own scroll,
                      so opening it never grows the grid or forces page scroll. */}
                  {showJson && (
                    <div className={`mt-0.5 p-1.5 rounded-lg ${config.accentBg} border ${config.accentBorder} max-h-24 overflow-y-auto space-y-1 animate-fade-in-up`}>
                      {Object.entries(config.extractedKeys).map(([key, label]) => {
                        const val = extractedData[key];
                        return (
                          <div key={key} className="flex justify-between items-start gap-2">
                            <span className="text-[8.5px] text-gray-500 font-semibold shrink-0">{label}</span>
                            <span className="text-[8.5px] text-gray-800 font-bold text-right truncate font-mono">
                              {formatValue(key, val)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="mt-1.5 select-none">
                <input
                  type="file"
                  ref={fileInputs[type]}
                  onChange={(e) => handleUpload(type, e.target.files[0])}
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg"
                />

                {isUploaded ? (
                  <button onClick={() => triggerFileInput(type)} className="btn-secondary w-full !text-[10px] !py-1.5">
                    Re-upload
                  </button>
                ) : (
                  <button
                    onClick={() => triggerFileInput(type)}
                    disabled={isUploading}
                    className={`text-[10px] font-bold transition-all w-full text-center py-1.5 rounded-lg cursor-pointer border ${
                      isUploading
                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                        : `${config.accentBg} ${config.accentColor} ${config.accentBorder} hover:opacity-80`
                    }`}
                  >
                    {isUploading ? 'Analyzing…' : 'Select File'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* W3C Verifiable Credential Inspection Modal */}
      {vcModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900">W3C Verifiable Credential (VC) v1.1</h3>
                  <p className="text-[10.5px] text-gray-400 font-medium">Interoperable National Digital Infrastructure Record</p>
                </div>
              </div>
              <button onClick={() => setVcModal(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-80 shadow-inner">
              <pre>{JSON.stringify(vcModal.verifiable_credential || vcModal, null, 2)}</pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px] text-gray-500">
              <span className="font-mono text-indigo-600 font-bold truncate max-w-[320px]">
                Issuer DID: {vcModal.verifiable_credential?.issuer?.id || 'did:polygon:amoy:0x71C7...'}
              </span>
              <button
                onClick={() => setVcModal(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
