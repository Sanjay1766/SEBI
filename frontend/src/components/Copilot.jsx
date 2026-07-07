import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Send, X, Clipboard, Check, Loader2, 
  MessageSquare, FileText, ArrowRight, ShieldAlert 
} from 'lucide-react';

const FIELD_LABELS = {
  promoter_experience: 'Promoter Experience Summary',
  products_services: 'Key Products & Services',
  business_model: 'Business Model Description',
  internal_risks: 'Internal Risk Factors',
  external_risks: 'External Risk Factors',
  litigations_company: 'Litigations Against Company',
  litigations_promoters: 'Litigations Against Promoters',
  rpt_declared: 'Related Party Transactions',
  material_contracts_desc: 'Material Contracts for Inspection'
};

export default function Copilot({ isOpen, onClose, onApplySuggestion, backendUrl }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am your SEBI Compliance Copilot. I can audit your current checklist data, review document conflicts, or help draft legal sections like Risk Factors or Business Overview based on your parameters. How can I help you today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appliedField, setAppliedField] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    if (!textToSend) {
      setInput('');
    }

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const historyPayload = newMessages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const res = await fetch(`${backendUrl}/api/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error connecting to the compliance service. Please check if the backend is running.' 
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error: Could not reach the compliance copilot. Ensure the backend server is operational.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const parseMessageContent = (text) => {
    const suggestionRegex = /\[SUGGESTION:([a-zA-Z_]+)\]([\s\S]*?)\[\/SUGGESTION\]/g;
    const matches = [...text.matchAll(suggestionRegex)];
    
    if (matches.length === 0) {
      return { cleanText: text, suggestion: null };
    }
    
    const fieldKey = matches[0][1];
    const suggestionContent = matches[0][2].trim();
    const cleanText = text.replace(suggestionRegex, '').trim();
    
    return {
      cleanText,
      suggestion: {
        key: fieldKey,
        content: suggestionContent
      }
    };
  };

  const handleApply = (key, content) => {
    onApplySuggestion(key, content);
    setAppliedField(key);
    setTimeout(() => setAppliedField(null), 2500);
  };

  const quickPrompts = [
    { label: '🔍 Audit Compliance Gaps', query: 'Audit my current data for SEBI gaps and errors.' },
    { label: '✍️ Draft Risk Factors', query: 'Draft a professional risk factors narrative section based on my inputs.' },
    { label: '🏢 Draft Business Overview', query: 'Help me draft a professional Business Overview narrative.' },
    { label: '⚖️ Promoter Shareholding Rule', query: 'What are the SEBI rules for promoter shareholding in an SME IPO?' }
  ];

  if (!isOpen) return null;

  return (
    <div className="w-96 border-l border-slate-900 bg-[#080b12] shrink-0 flex flex-col justify-between h-screen sticky top-0 z-40 shadow-2xl relative animate-fade-in-up">
      {/* Subtle border accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/20 to-transparent"></div>
      
      {/* Header */}
      <div className="p-4 border-b border-slate-900 flex justify-between items-center bg-[#080b12]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-950 text-sky-400 rounded border border-sky-900/50">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-white">AI Compliance Copilot</h3>
            <p className="text-[9px] font-bold text-sky-500 uppercase tracking-widest font-sans">SEBI SME Auditor</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-905 hover:bg-slate-900 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Message Feed */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 scrollbar-thin bg-[#0b0f19]/80">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const { cleanText, suggestion } = isUser ? { cleanText: msg.content, suggestion: null } : parseMessageContent(msg.content);

          return (
            <div key={index} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fade-in-up`}>
              <div 
                className={`max-w-[85%] rounded px-3.5 py-2.5 text-xs shadow-sm leading-relaxed ${
                  isUser 
                    ? 'bg-[#0284c7] text-white rounded-tr-none' 
                    : 'bg-[#131c31] border border-slate-800 text-slate-200 rounded-tl-none'
                }`}
              >
                {/* Clean formatted text */}
                <div className="whitespace-pre-line prose prose-invert max-w-none">
                  {cleanText}
                </div>

                {/* Suggestion Card */}
                {suggestion && (
                  <div className="mt-3 p-3 bg-[#1e293b] rounded border border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-sky-450 font-bold text-[10px] uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5 text-sky-400" /> Suggestion Draft
                    </div>
                    <p className="text-[10px] text-slate-300 italic line-clamp-3 bg-[#0b0f19] p-2 rounded border border-slate-850 leading-normal">
                      "{suggestion.content}"
                    </p>
                    <button
                      onClick={() => handleApply(suggestion.key, suggestion.content)}
                      className={`w-full py-1.5 px-3 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        appliedField === suggestion.key
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#0284c7]/20 hover:bg-[#0284c7] text-sky-300 hover:text-white border border-[#0284c7]/30'
                      }`}
                    >
                      {appliedField === suggestion.key ? (
                        <>
                          <Check className="w-3 h-3" />
                          Applied to Form!
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          <span>Apply Draft</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <span className="text-[8px] text-slate-500 mt-1 px-1 font-semibold">
                {isUser ? 'You' : 'Copilot'}
              </span>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
            <span>Compliance Engine Auditing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Panel */}
      {messages.length === 1 && (
        <div className="px-4 pb-3 pt-2 bg-[#080b12] border-t border-slate-900">
          <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-2 select-none">Suggested Actions</p>
          <div className="grid grid-cols-1 gap-1.5">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p.query)}
                className="w-full text-left text-[10px] py-2 px-3 rounded bg-[#131c31] hover:bg-[#1e293b] border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between shadow-sm cursor-pointer text-slate-300 hover:text-white font-semibold"
              >
                <span>{p.label}</span>
                <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="p-4 border-t border-slate-900 bg-[#080b12] flex gap-2 select-none"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about SEBI compliance or draft..."
          className="flex-1 bg-[#0b0f19] border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 transition-all shadow-sm"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2 rounded bg-sky-600 hover:bg-sky-500 text-white transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
