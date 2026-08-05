import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, X, ShieldCheck } from 'lucide-react';

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
  const initTrue = () => Object.fromEntries(DOC_TYPES.map(t => [t, true]));
  const initNull = () => Object.fromEntries(DOC_TYPES.map(t => [t, null]));

  const [uploading, setUploading] = useState(initFalse());

  const [error, setError] = useState(initEmptyStr());

  const [dragging, setDragging] = useState(initFalse());

  const [expandedJson, setExpandedJson] = useState(initTrue());

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
      icon: '📊',
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
      icon: '🧾',
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
      icon: '📜',
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
      icon: '🪪',
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
      icon: '📘',
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
      icon: '🧮',
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
      icon: '🧑‍💼',
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
      icon: '⚖️',
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
      icon: '📈',
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
      icon: '🧾',
      extractedKeys: {
        top5_customer_revenue_table: 'Top-5 Customer Rows',
        key_geographies_served: 'Geographies',
        gst_annual_turnover: 'GST Turnover'
      }
    }
  };

  const formatValue = (key, val) => {
    if (val === null || val === undefined || val === '') {
      return (
        <span className="text-red-500 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md text-[9px] uppercase select-none">
          Missing
        </span>
      );
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
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      {/* Page header */}
      <div className="mb-2">
        <h2 className="text-xl font-display font-700 text-gray-900">Document Vault</h2>
        <p className="text-[12.5px] text-gray-400 font-medium mt-1 leading-normal">
          Upload statutory certificates and financial documents for OCR extraction and compliance auditing.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {Object.entries(docConfig).map(([type, config]) => {
          const isUploading = uploading[type];
          const hasError = error[type];
          const isDragging = dragging[type];
          const extractedData = sessionData.extracted_data?.[type] || {};
          const uploadedFileObj = sessionData.uploaded_files?.find(f => f.type === type);
          const extractionCompleted = uploadedFileObj?.extraction_status === 'completed';
          const isUploaded = Object.keys(extractedData).length > 0 || !!uploadedFileObj;
          const showJson = expandedJson[type];

          return (
            <div 
              key={type}
              className={`bg-white border rounded-2xl p-5 flex flex-col justify-between shadow-card transition-all duration-200 ${
                isUploaded 
                  ? 'border-gray-200 shadow-card' 
                  : 'border-gray-100 hover:border-gray-200 hover:shadow-card-md'
              }`}
            >
              {/* Card header */}
              <div>
                <div className="flex justify-between items-start mb-3 select-none">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center text-lg`}>
                      {config.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-[14px] text-gray-800">{config.title}</h3>
                      {isUploaded && (
                        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border mt-0.5 select-none w-fit ${extractionCompleted ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                          {extractionCompleted ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {extractionCompleted ? 'Extracted — review required' : 'Manual review required'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[12px] text-gray-400 leading-relaxed mb-4 font-medium">{config.desc}</p>
                
                {/* Upload Zone */}
                {!isUploaded && !isUploading && (
                  <div 
                    onClick={() => triggerFileInput(type)}
                    onDragOver={(e) => handleDragOver(e, type)}
                    onDragLeave={() => handleDragLeave(type)}
                    onDrop={(e) => handleDrop(e, type)}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center group ${
                      isDragging 
                        ? `${config.accentBorder} ${config.accentBg}`
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <UploadCloud className={`w-7 h-7 mb-2 transition-colors ${
                      isDragging ? config.accentColor : 'text-gray-300 group-hover:text-gray-400'
                    }`} />
                    <p className="text-[12.5px] text-gray-600 font-semibold">
                      {isDragging ? 'Drop to upload' : 'Click or drag & drop'}
                    </p>
                    <p className="text-[10.5px] text-gray-400 mt-1 font-medium">PDF, PNG, or JPG · Max 10 MB</p>
                  </div>
                )}

                {/* Uploading State with Animated Progress Bar */}
                {isUploading && (
                  <div className="border border-accent-200 bg-gradient-to-b from-accent-50/40 to-white rounded-xl p-4 select-none space-y-2.5 animate-fade-in-up shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-accent-600 animate-spin" />
                        <span className="text-[12.5px] font-bold text-gray-800 truncate max-w-[200px]">
                          {jobState[type]?.filename || 'Processing Document'}
                        </span>
                      </div>
                      <span className="text-[11px] font-extrabold text-accent-700 bg-accent-100/80 border border-accent-200 px-2 py-0.5 rounded-md font-mono">
                        {jobState[type]?.progress || 15}%
                      </span>
                    </div>

                    {/* Smooth Progress Bar */}
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden p-0.5 border border-gray-200">
                      <div 
                        className="bg-gradient-to-r from-accent-500 via-blue-500 to-emerald-500 h-full rounded-full transition-all duration-300 shadow-sm"
                        style={{ width: `${jobState[type]?.progress || 15}%` }}
                      />
                    </div>

                    {/* Stage Label & Steps Indicator */}
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
                      <p className="truncate max-w-[260px] text-accent-800 font-semibold text-[11px]">
                        {jobState[type]?.stage || 'Scanning document text...'}
                      </p>
                      <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-2">
                        Stage {(jobState[type]?.progress || 15) >= 100 ? '4/4' : (jobState[type]?.progress || 15) >= 75 ? '3/4' : (jobState[type]?.progress || 15) >= 45 ? '2/4' : '1/4'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {hasError && (
                  <div className="mt-3 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11.5px] flex gap-2.5 items-start animate-fade-in-up">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[12px]">Extraction Failed</p>
                      <p className="text-red-500 mt-0.5">{hasError}</p>
                    </div>
                    <button
                      onClick={() => setError(prev => ({ ...prev, [type]: '' }))}
                      className="ml-auto p-0.5 hover:bg-red-100 rounded shrink-0 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Uploaded File Info */}
                {isUploaded && !isUploading && (
                  <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 shadow-inner select-none mb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                          <FileText className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[12px] text-gray-700 font-semibold truncate">{uploadedFileObj?.filename || 'Uploaded File'}</p>
                          <p className="text-[10px] text-gray-400 font-medium">{(uploadedFileObj?.size ? (uploadedFileObj.size / 1024).toFixed(0) : '0')} KB · {extractionCompleted ? 'Extracted — confirm fields' : 'Manual entry needed'}</p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setExpandedJson(prev => ({ ...prev, [type]: !prev[type] }))}
                        className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-colors shrink-0 cursor-pointer"
                        title="Inspect extracted fields"
                      >
                        {showJson ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* W3C VC Badge & Inspection Link */}
                    <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-mono">
                        <ShieldCheck className="w-3 h-3 text-indigo-600" />
                        W3C VC: did:polygon:amoy:...
                      </span>
                      <button
                        onClick={() => fetchAndShowVC(type)}
                        className="text-[9.5px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                      >
                        Inspect W3C VC JSON-LD ↗
                      </button>
                    </div>
                  </div>
                )}

                {/* Extracted Properties */}
                {isUploaded && (
                  <div className={`mt-2 p-3.5 rounded-xl ${config.accentBg} border ${config.accentBorder} animate-fade-in-up`}>
                    <h4 className={`text-[9.5px] uppercase font-bold tracking-wider ${config.accentColor} mb-3 flex items-center gap-1.5`}>
                      <CheckCircle2 className="w-3 h-3" /> Extracted Properties
                    </h4>
                    
                    <div className="space-y-2">
                      {Object.entries(config.extractedKeys).map(([key, label]) => {
                        const val = extractedData[key];
                        return (
                          <div key={key} className="flex justify-between items-start gap-4">
                            <span className="text-[10px] text-gray-500 font-semibold">{label}</span>
                            <span className="text-[10.5px] text-gray-800 font-bold text-right max-w-[60%] truncate font-mono">
                              {formatValue(key, val)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-gray-100 select-none">
                <input
                  type="file"
                  ref={fileInputs[type]}
                  onChange={(e) => handleUpload(type, e.target.files[0])}
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg"
                />
                
                {isUploaded ? (
                  <button
                    onClick={() => triggerFileInput(type)}
                    className="text-[11.5px] font-semibold text-gray-500 hover:text-gray-700 transition-colors w-full text-center py-2 hover:bg-gray-50 border border-gray-200 rounded-xl cursor-pointer"
                  >
                    Re-upload Document
                  </button>
                ) : (
                  <button
                    onClick={() => triggerFileInput(type)}
                    disabled={isUploading}
                    className={`text-[12px] font-bold transition-all w-full text-center py-2.5 rounded-xl cursor-pointer border ${
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
