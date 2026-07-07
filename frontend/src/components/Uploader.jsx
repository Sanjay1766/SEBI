import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Uploader({ sessionData, onUploadSuccess, backendUrl }) {
  const [uploading, setUploading] = useState({
    financials: false,
    gst: false,
    incorporation: false,
    compliance: false
  });
  
  const [error, setError] = useState({
    financials: '',
    gst: '',
    incorporation: '',
    compliance: ''
  });

  const [expandedJson, setExpandedJson] = useState({
    financials: true, // Keep open by default for neat visual preview
    gst: true,
    incorporation: true,
    compliance: true
  });

  const fileInputs = {
    financials: useRef(null),
    gst: useRef(null),
    incorporation: useRef(null),
    compliance: useRef(null)
  };

  const handleUpload = async (docType, file) => {
    if (!file) return;
    
    setUploading(prev => ({ ...prev, [docType]: true }));
    setError(prev => ({ ...prev, [docType]: '' }));

    const formData = new FormData();
    formData.append('doc_type', docType);
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload and parse document.');
      }

      const result = await response.json();
      onUploadSuccess(docType, result.extracted, result.filename);
    } catch (err) {
      console.error(err);
      setError(prev => ({ ...prev, [docType]: err.message || 'An error occurred.' }));
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }));
    }
  };

  const triggerFileInput = (docType) => {
    fileInputs[docType].current?.click();
  };

  const docConfig = {
    financials: {
      title: 'Audited Financials',
      desc: 'Restated financial statements for the past 3 fiscal years (PDF/Image).',
      color: 'from-[#1b2a4a] to-[#2563eb]',
      textColor: 'text-[#38bdf8]',
      extractedKeys: {
        fy_years: 'Fiscal Years',
        revenue_fy_latest: 'Latest Revenue',
        pat_fy_latest: 'Latest Net Profit',
        borrowings_latest: 'Outstanding Borrowings',
        auditor_name: 'Statutory Auditor',
        auditor_membership: 'Auditor membership'
      }
    },
    gst: {
      title: 'GST Certificates',
      desc: 'GST registration certificate (REG-06) or filing records (PDF/Image).',
      color: 'from-[#1f5c3e] to-[#10b981]',
      textColor: 'text-[#34d399]',
      extractedKeys: {
        gstin: 'GSTIN Registration',
        company_name: 'Taxpayer legal name',
        gst_annual_turnover: 'GST Turnover',
        registration_date: 'Registration Date',
        filing_status: 'Filing Status'
      }
    },
    incorporation: {
      title: 'Incorporation Docs',
      desc: 'Certificate of Incorporation issued by Registrar of Companies (PDF/Image).',
      color: 'from-purple-800 to-indigo-600',
      textColor: 'text-purple-400',
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
      color: 'from-[#b8720c] to-[#f59e0b]',
      textColor: 'text-[#fbbf24]',
      extractedKeys: {
        pan: 'Company PAN No.',
        pan_name: 'Name on PAN',
        tan: 'Company TAN No.'
      }
    }
  };

  const formatValue = (key, val) => {
    if (val === null || val === undefined || val === '') {
      return (
        <span className="text-[#f87171] font-bold bg-[#3b0712] border border-[#7f1d1d] px-1.5 py-0.5 rounded text-[8px] uppercase select-none font-sans">
          Missing
        </span>
      );
    }
    if (typeof val === 'number') {
      return `₹ ${val.toFixed(2)} Cr`;
    }
    return String(val);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <div className="mb-2 border-b border-slate-800 pb-3 select-none">
        <h2 className="text-base font-bold text-white font-display">Source Document Verification</h2>
        <p className="text-[11px] text-slate-400 font-semibold mt-0.5 leading-normal">
          Upload statutory certificates and audit logs. The parser validates formats and identifies cross-document discrepancies.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(docConfig).map(([type, config]) => {
          const isUploading = uploading[type];
          const hasError = error[type];
          const extractedData = sessionData.extracted_data?.[type] || {};
          const isUploaded = Object.keys(extractedData).length > 0;
          const uploadedFileObj = sessionData.uploaded_files?.find(f => f.type === type);
          const showJson = expandedJson[type];

          return (
            <div 
              key={type}
              className="glass rounded border border-slate-800 p-5 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all duration-205"
            >
              {/* Colored Top Accent Line */}
              <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${config.color}`}></div>

              <div>
                <div className="flex justify-between items-start mb-2 select-none">
                  <h3 className="font-bold text-[11px] text-slate-200 font-sans uppercase tracking-wider">{config.title}</h3>
                  {isUploaded && (
                    <span className="flex items-center gap-1.5 text-[9px] text-[#34d399] font-bold bg-[#022c22] px-2 py-0.5 rounded border border-[#064e3b] select-none">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 leading-normal mb-4 font-semibold">{config.desc}</p>
                
                {/* Upload Zone */}
                {!isUploaded && !isUploading && (
                  <div 
                    onClick={() => triggerFileInput(type)}
                    className="border border-dashed border-slate-700 hover:border-sky-500 bg-[#0b0f19] hover:bg-[#111827]/40 rounded p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center group"
                  >
                    <UploadCloud className="w-6 h-6 text-slate-500 group-hover:text-sky-400 transition-colors mb-2" />
                    <p className="text-[11px] text-slate-300 font-bold font-sans">Click to upload document</p>
                    <p className="text-[9px] text-slate-500 mt-1 font-bold">PDF, PNG, or JPG (Max 10MB)</p>
                  </div>
                )}

                {/* Uploading State */}
                {isUploading && (
                  <div className="border border-slate-800 bg-[#0b0f19] rounded p-8 text-center flex flex-col items-center justify-center select-none">
                    <Loader2 className="w-6 h-6 text-[#38bdf8] animate-spin mb-3" />
                    <p className="text-xs font-bold text-slate-200">Extracting properties...</p>
                    <p className="text-[9px] text-slate-400 mt-1 font-semibold leading-normal">Running OCR extraction & schema parser</p>
                  </div>
                )}

                {/* Error State */}
                {hasError && (
                  <div className="mt-3 p-3 rounded bg-[#3b0712] border border-[#7f1d1d] text-[#f87171] text-[11px] flex gap-2 items-start animate-fade-in-up">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Extraction Failed</p>
                      <p className="opacity-90">{hasError}</p>
                    </div>
                  </div>
                )}

                {/* Uploaded File Info */}
                {isUploaded && !isUploading && (
                  <div className="p-2.5 bg-[#131c31] rounded border border-slate-800 flex items-center justify-between mb-3.5 shadow-inner select-none">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <FileText className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-[11px] text-slate-200 font-semibold truncate">{uploadedFileObj?.filename || 'Uploaded File'}</p>
                        <p className="text-[9px] text-slate-400 font-bold">{(uploadedFileObj?.size ? (uploadedFileObj.size / 1024).toFixed(0) : '150')} KB • Verified</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setExpandedJson(prev => ({ ...prev, [type]: !prev[type] }))}
                      className="p-1 hover:bg-[#1e293b] rounded text-slate-400 hover:text-slate-205 transition-colors shrink-0 cursor-pointer"
                      title="Inspect extracted fields"
                    >
                      {showJson ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                {/* Extracted Properties List */}
                {isUploaded && showJson && (
                  <div className="mt-2.5 p-3 rounded bg-[#0b0f19] border border-slate-850 text-xs animate-fade-in-up">
                    <h4 className="text-[9px] uppercase font-bold tracking-wider text-slate-500 mb-2 border-b border-slate-850 pb-1.5 flex justify-between select-none">
                      <span>Verified Properties</span>
                    </h4>
                    
                    <div className="space-y-1.5">
                      {Object.entries(config.extractedKeys).map(([key, label]) => {
                        const val = extractedData[key];
                        return (
                          <div key={key} className="flex justify-between items-start gap-4">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold font-sans">{label}:</span>
                            <span className="text-[10px] text-slate-200 font-semibold text-right max-w-[65%] truncate font-mono">
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
              <div className="mt-4 flex gap-3 pt-3 border-t border-slate-800 select-none">
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
                    className="text-[10px] font-bold text-slate-300 hover:text-white transition-colors w-full text-center py-1.5 hover:bg-[#131c31] border border-slate-800 rounded cursor-pointer font-sans"
                  >
                    Re-upload Document
                  </button>
                ) : (
                  <button
                    onClick={() => triggerFileInput(type)}
                    disabled={isUploading}
                    className="text-[10px] font-bold text-slate-200 hover:bg-[#1e293b] disabled:opacity-50 transition-colors w-full text-center py-1.5 bg-[#131c31] border border-slate-800 rounded cursor-pointer font-sans"
                  >
                    {isUploading ? 'Analyzing...' : 'Select File'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
