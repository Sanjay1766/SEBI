import React, { useState } from 'react';
import { 
  Users, Radio, Shield, UserCheck, Copy, Check, 
  Sparkles, Globe, User, Circle
} from 'lucide-react';

const ROLE_PRESETS = [
  { id: 'founder', label: 'Company Founder / Promoter', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  { id: 'merchant_banker', label: 'Merchant Banker (Lead Manager)', badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-300', dot: 'bg-indigo-500' },
  { id: 'ca_auditor', label: 'Statutory Auditor (CA)', badgeBg: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500' },
  { id: 'legal_counsel', label: 'Legal Counsel', badgeBg: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' }
];

export default function CollaboratorBar({ 
  user, 
  collaborators = [], 
  currentRole = 'founder', 
  onRoleChange, 
  activeTab,
  isConnected = true 
}) {
  const [copied, setCopied] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeRolePreset = ROLE_PRESETS.find(r => r.id === currentRole) || ROLE_PRESETS[0];

  // Default mock active team members if presence list is empty during demo
  const displayCollaborators = collaborators.length > 0 ? collaborators : [
    { email: user?.email || 'founder@apex.com', role: currentRole, active_tab: activeTab, is_self: true },
    { email: 'ca.finance@apexaudit.in', role: 'ca_auditor', active_tab: 'general', is_self: false },
    { email: 'banker@capitalmerchant.com', role: 'merchant_banker', active_tab: 'capital', is_self: false }
  ];

  return (
    <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-indigo-950 text-white px-4 py-2 rounded-xl border border-gray-800 shadow-md flex items-center justify-between gap-3 text-xs">
      {/* Left: Real-time Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </span>
          <span className="font-extrabold tracking-wide uppercase text-[10px] text-emerald-400 font-mono">
            {isConnected ? 'Realtime Live Sync' : 'Reconnecting...'}
          </span>
        </div>

        <div className="hidden sm:block h-3.5 w-px bg-gray-700/80" />

        {/* User Role Selector Pill */}
        <div className="relative">
          <button
            onClick={() => setShowRoleSelector(!showRoleSelector)}
            className="flex items-center gap-1.5 bg-gray-800/90 hover:bg-gray-700/90 text-gray-200 px-2.5 py-1 rounded-lg border border-gray-700 transition-all cursor-pointer font-medium text-[11px]"
          >
            <span className={`w-2 h-2 rounded-full ${activeRolePreset.dot}`} />
            <span>{activeRolePreset.label}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {showRoleSelector && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-slate-900 border border-gray-700 rounded-xl shadow-xl p-1.5 z-50 animate-fade-in space-y-1">
              <p className="text-[10px] uppercase font-bold text-gray-400 px-2 py-1 tracking-wider">Switch Your Team Role</p>
              {ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    if (onRoleChange) onRoleChange(preset.id);
                    setShowRoleSelector(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    currentRole === preset.id ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${preset.dot}`} />
                    <span>{preset.label}</span>
                  </div>
                  {currentRole === preset.id && <UserCheck className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Active Collaborator Avatars & Share Workspace */}
      <div className="flex items-center gap-3">
        <div className="flex items-center -space-x-2 overflow-hidden">
          {displayCollaborators.slice(0, 4).map((col, idx) => {
            const rolePreset = ROLE_PRESETS.find(r => r.id === col.role) || ROLE_PRESETS[0];
            const initial = col.email.charAt(0).toUpperCase();
            return (
              <div
                key={idx}
                title={`${col.email} (${rolePreset.label}) — Active on ${col.active_tab || 'dashboard'}`}
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white border-2 border-slate-900 shadow-sm cursor-pointer transition-transform hover:scale-110 ${
                  col.role === 'founder' ? 'bg-emerald-600' : col.role === 'ca_auditor' ? 'bg-purple-600' : 'bg-indigo-600'
                }`}
              >
                {initial}
              </div>
            );
          })}
          {displayCollaborators.length > 4 && (
            <div className="w-7 h-7 rounded-full bg-gray-700 text-gray-300 border-2 border-slate-900 flex items-center justify-center font-bold text-[10px]">
              +{displayCollaborators.length - 4}
            </div>
          )}
        </div>

        <span className="hidden lg:inline text-[11px] font-bold text-gray-300">
          {displayCollaborators.length} Team Members Online
        </span>

        <button
          onClick={handleCopyLink}
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-500 shadow-xs"
          title="Share collaboration invite link with CAs & Lead Bankers"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Link Copied!' : 'Invite Team'}</span>
        </button>
      </div>
    </div>
  );
}

function ChevronDown(props) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
