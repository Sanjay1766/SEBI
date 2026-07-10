import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Send, X, Check, Loader2, 
  MessageSquare, FileText, ArrowRight, Bot
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
    <div className="w-96 border-l border-gray-100 bg-white shrink-0 flex flex-col justify-between h-screen sticky top-0 z-40 shadow-card-lg relative animate-fade-in-up">
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent-400 via-accent-500 to-indigo-500" />
      
      {/* Header */}
      <div className="pt-1 px-4 py-3.5 border-b border-gray-100 flex justify-between items-center bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-accent-500 text-white rounded-xl flex items-center justify-center shadow-sm">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-[13px] text-gray-900">AI Compliance Copilot</h3>
            <p className="text-[9.5px] font-bold text-accent-600 uppercase tracking-widest">SEBI SME Auditor</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Message Feed */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50/60">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const { cleanText, suggestion } = isUser ? { cleanText: msg.content, suggestion: null } : parseMessageContent(msg.content);

          return (
            <div key={index} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fade-in-up`}>
              {/* Avatar */}
              {!isUser && (
                <div className="w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center mb-1.5 shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div 
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12.5px] shadow-sm leading-relaxed ${
                  isUser 
                    ? 'bg-accent-500 text-white rounded-tr-none shadow-accent/20' 
                    : 'bg-white border border-gray-100 text-gray-700 rounded-tl-none shadow-card'
                }`}
              >
                {/* Clean formatted text */}
                <div className="whitespace-pre-line">
                  {cleanText}
                </div>

                {/* Suggestion Card */}
                {suggestion && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-accent-600 font-bold text-[10px] uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5" /> Suggestion Draft
                      {FIELD_LABELS[suggestion.key] && (
                        <span className="text-gray-400 font-normal normal-case">· {FIELD_LABELS[suggestion.key]}</span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-gray-500 italic line-clamp-3 bg-white p-2.5 rounded-lg border border-gray-200 leading-relaxed">
                      "{suggestion.content}"
                    </p>
                    <button
                      onClick={() => handleApply(suggestion.key, suggestion.content)}
                      className={`w-full py-2 px-3 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        appliedField === suggestion.key
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-accent-500 hover:bg-accent-600 text-white shadow-accent'
                      }`}
                    >
                      {appliedField === suggestion.key ? (
                        <><Check className="w-3.5 h-3.5" /> Applied to Form!</>
                      ) : (
                        <><ArrowRight className="w-3.5 h-3.5" /><span>Apply to Form</span></>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <span className="text-[9px] text-gray-400 mt-1 px-1 font-medium">
                {isUser ? 'You' : 'Copilot'}
              </span>
            </div>
          );
        })}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-start gap-2 animate-fade-in-up">
            <div className="w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-card flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[11px] text-gray-400 font-medium">Analyzing compliance…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Panel */}
      {messages.length === 1 && (
        <div className="px-4 pb-3 pt-2 bg-white border-t border-gray-100">
          <p className="text-[9.5px] uppercase font-bold tracking-widest text-gray-400 mb-2 select-none">Quick Actions</p>
          <div className="grid grid-cols-1 gap-1.5">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p.query)}
                className="w-full text-left text-[11px] py-2.5 px-3.5 rounded-xl bg-white hover:bg-accent-50 border border-gray-200 hover:border-accent-200 transition-all flex items-center justify-between shadow-card cursor-pointer text-gray-600 hover:text-accent-700 font-semibold"
              >
                <span>{p.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="p-4 border-t border-gray-100 bg-white flex gap-2 select-none"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about SEBI compliance or draft…"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] text-gray-700 placeholder-gray-400 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/10 focus:bg-white transition-all shadow-sm"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 rounded-xl bg-accent-500 hover:bg-accent-600 text-white transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-accent"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
