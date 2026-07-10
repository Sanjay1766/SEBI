import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, X } from 'lucide-react';

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

  const [dragging, setDragging] = useState({
    financials: false,
    gst: false,
    incorporation: false,
    compliance: false
  });

  const [expandedJson, setExpandedJson] = useState({
    financials: true,
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
      title: 'Audited Financials',
      desc: 'Restated financial statements for the past 3 fiscal years (PDF/Image).',
      accentColor: 'text-blue-600',
      accentBg: 'bg-blue-50',
      accentBorder: 'border-blue-200',
      iconBg: 'bg-blue-100',
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
      title: 'GST Certificates',
      desc: 'GST registration certificate (REG-06) or filing records (PDF/Image).',
      accentColor: 'text-emerald-600',
      accentBg: 'bg-emerald-50',
      accentBorder: 'border-emerald-200',
      iconBg: 'bg-emerald-100',
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
      desc: 'Certificate of Incorporation issued by Registrar of Companies (PDF/Image).',
      accentColor: 'text-indigo-600',
      accentBg: 'bg-indigo-50',
      accentBorder: 'border-indigo-200',
      iconBg: 'bg-indigo-100',
      icon: '🏢',
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
      accentBg: 'bg-amber-50',
      accentBorder: 'border-amber-200',
      iconBg: 'bg-amber-100',
      icon: '📋',
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
        <span className="text-red-500 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md text-[9px] uppercase select-none">
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
      {/* Page header */}
      <div className="mb-2">
        <h2 className="text-xl font-display font-700 text-gray-900">Document Vault</h2>
        <p className="text-[12.5px] text-gray-400 font-medium mt-1 leading-normal">
          Upload statutory certificates and financial documents. The parser validates formats and identifies cross-document discrepancies.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(docConfig).map(([type, config]) => {
          const isUploading = uploading[type];
          const hasError = error[type];
          const isDragging = dragging[type];
          const extractedData = sessionData.extracted_data?.[type] || {};
          const isUploaded = Object.keys(extractedData).length > 0;
          const uploadedFileObj = sessionData.uploaded_files?.find(f => f.type === type);
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
                        <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 mt-0.5 select-none w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Verified
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

                {/* Uploading State */}
                {isUploading && (
                  <div className="border border-gray-100 bg-gray-50 rounded-xl p-8 text-center flex flex-col items-center justify-center select-none">
                    <div className="relative mb-3">
                      <div className="w-10 h-10 rounded-full border-2 border-accent-100 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-accent-500 animate-spin" />
                      </div>
                    </div>
                    <p className="text-[12.5px] font-bold text-gray-700">Extracting data…</p>
                    <p className="text-[10.5px] text-gray-400 mt-1 font-medium">Running OCR & schema parser</p>
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
                  <div className="bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between mb-3 p-3 shadow-inner select-none">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                        <FileText className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-[12px] text-gray-700 font-semibold truncate">{uploadedFileObj?.filename || 'Uploaded File'}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{(uploadedFileObj?.size ? (uploadedFileObj.size / 1024).toFixed(0) : '150')} KB · Verified</p>
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
                )}

                {/* Extracted Properties */}
                {isUploaded && showJson && (
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
    </div>
  );
}
