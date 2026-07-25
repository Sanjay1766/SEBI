import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Loader2, FileCheck, ArrowRight, ExternalLink, Lock, Building2, Landmark, Award } from 'lucide-react';

export default function DigiLockerPanel({ onSimulatePull, pulling, isConnected, connectedDocs }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1); // 1: Authorization, 2: Fetching, 3: Completed

  const handleStartConnect = () => {
    setModalOpen(true);
    setStep(1);
    setTimeout(() => {
      setStep(2);
      setTimeout(async () => {
        setStep(3);
        if (onSimulatePull) {
          await onSimulatePull();
        }
      }, 1400);
    }, 1200);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  return (
    <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-60 h-60 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <Landmark className="w-3 h-3 text-amber-400" />
              India Digital Public Infrastructure (DPI)
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
              Feasibility Score +10
            </span>
          </div>

          <h3 className="text-lg font-extrabold text-white flex items-center gap-2.5">
            <span>DigiLocker Enterprise Instant Fetch</span>
            <span className="text-xs bg-amber-400 text-gray-900 px-2 py-0.5 rounded-md font-bold">Gov. Verified</span>
          </h3>

          <p className="text-xs text-blue-100/80 leading-relaxed">
            Direct integration with India's national DigiLocker registry. Automatically pull MCA Certificate of Incorporation, GSTIN registration, PAN card, and audited IT returns directly from official government servers.
          </p>

          {/* Document Pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { label: 'MCA Incorporation Cert', icon: Building2 },
              { label: 'CBDT Corporate PAN', icon: Lock },
              { label: 'GSTIN Portal Cert', icon: FileCheck },
              { label: 'Audited Financial Statements', icon: Award },
            ].map((doc, idx) => {
              const Icon = doc.icon;
              return (
                <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 text-blue-100">
                  <Icon className="w-3.5 h-3.5 text-blue-300" />
                  <span>{doc.label}</span>
                  {isConnected && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 flex flex-col items-center md:items-end gap-2 w-full md:w-auto">
          <button
            onClick={handleStartConnect}
            disabled={pulling}
            className="w-full md:w-auto px-5 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-gray-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50"
          >
            <ShieldCheck className="w-4.5 h-4.5 text-gray-950" />
            <span>{isConnected ? 'Re-Sync DigiLocker Vault' : 'Pull from DigiLocker'}</span>
            <ArrowRight className="w-4 h-4 text-gray-950" />
          </button>

          <span className="text-[10px] text-blue-200/60 font-mono">
            {isConnected ? '✓ 4 statutory documents verified via DigiLocker API' : 'OAuth 2.0 MeitY Sandbox Gateway'}
          </span>
        </div>
      </div>

      {/* Interactive OAuth Simulation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white text-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 relative border border-gray-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold text-lg">
                  🇮🇳
                </div>
                <div>
                  <h4 className="font-bold text-sm text-gray-900">DigiLocker Auth Gateway</h4>
                  <p className="text-[11px] text-gray-400 font-mono">gov.in/oauth2/authorize</p>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                SSL 256-Bit Encrypted
              </span>
            </div>

            {/* Step Content */}
            {step === 1 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto animate-bounce">
                  <Lock className="w-7 h-7" />
                </div>
                <div>
                  <h5 className="font-bold text-sm text-gray-800">Authenticating Company Credentials...</h5>
                  <p className="text-xs text-gray-500 mt-1">Verifying CIN & Aadhaar e-KYC consent with DigiLocker DPI endpoint.</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" />
              </div>
            )}

            {step === 2 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                  <Landmark className="w-7 h-7 animate-pulse" />
                </div>
                <div>
                  <h5 className="font-bold text-sm text-gray-800">Pulling Statutory Records from Government Servers</h5>
                  <p className="text-xs text-gray-500 mt-1">Fetching MCA, Income Tax, and GSTIN verified certificates...</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden max-w-xs mx-auto">
                  <div className="bg-gradient-to-r from-blue-600 to-amber-500 h-full w-3/4 animate-pulse rounded-full" />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h5 className="font-bold text-base text-gray-900">4 Government-Verified Documents Imported!</h5>
                  <p className="text-xs text-gray-500 mt-1">All extracted statutory data auto-synchronized into your SEBI IPO workspace.</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 text-left space-y-2 border border-gray-200/80">
                  {[
                    'Certificate of Incorporation (MCA) — Verified ✓',
                    'Corporate PAN Card (Income Tax) — Verified ✓',
                    'GSTIN Registration (GST Portal) — Verified ✓',
                    'Audited Financial Statements (MCA) — Verified ✓',
                  ].map((item, i) => (
                    <div key={i} className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCloseModal}
                  className="w-full py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Return to IPO Sherpa Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
