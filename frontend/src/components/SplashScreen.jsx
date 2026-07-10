import React, { useState, useEffect } from 'react';

const SPLASH_DURATION = 2800; // ms — total splash time before fade-out begins

export default function SplashScreen({ onFinish }) {
  const [phase, setPhase] = useState('enter'); // enter → show → exit

  useEffect(() => {
    // After elements animate in, hold for a moment then fade out
    const holdTimer = setTimeout(() => setPhase('exit'), SPLASH_DURATION - 500);
    // Notify parent after full splash is done
    const doneTimer = setTimeout(onFinish, SPLASH_DURATION);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d1f2d 0%, #1a3a4a 40%, #0d2b3e 100%)',
        transition: 'opacity 0.5s ease',
        opacity: phase === 'exit' ? 0 : 1,
        pointerEvents: phase === 'exit' ? 'none' : 'all',
      }}
    >
      {/* Subtle radial glow behind logo */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,179,134,0.18) 0%, transparent 70%)',
        animation: 'splashGlow 2s ease-out forwards',
      }} />

      {/* Content container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 28,
        animation: 'splashRise 0.7s cubic-bezier(0.16,1,0.3,1) forwards',
        opacity: 0,
        transform: 'translateY(24px)',
      }}>
        {/* Logo */}
        <div style={{
          position: 'relative',
          filter: 'drop-shadow(0 8px 32px rgba(0,179,134,0.35))',
        }}>
          <img
            src="/logo.png"
            alt="IPO Sherpa"
            style={{
              width: 200,
              height: 'auto',
              borderRadius: 16,
              animation: 'splashLogoPulse 2s ease-in-out 0.5s infinite alternate',
            }}
          />
        </div>

        {/* Tagline */}
        <div style={{ textAlign: 'center' }}>
          <p style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            animation: 'splashFadeIn 0.5s ease 0.4s forwards',
            opacity: 0,
          }}>
            SEBI Chapter IX · SME IPO Workspace
          </p>
        </div>

        {/* Loading bar */}
        <div style={{
          width: 200,
          height: 3,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 999,
          overflow: 'hidden',
          animation: 'splashFadeIn 0.4s ease 0.6s forwards',
          opacity: 0,
        }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, #00b386, #4dd4aa)',
            borderRadius: 999,
            animation: 'splashBar 2s cubic-bezier(0.4,0,0.2,1) 0.7s forwards',
            width: '0%',
          }} />
        </div>

        {/* Status text */}
        <p style={{
          color: 'rgba(255,255,255,0.35)',
          fontSize: 10.5,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
          letterSpacing: '0.05em',
          animation: 'splashFadeIn 0.4s ease 0.9s forwards',
          opacity: 0,
        }}>
          Initializing compliance workspace…
        </p>
      </div>

      {/* Keyframe injector */}
      <style>{`
        @keyframes splashRise {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashFadeIn {
          to { opacity: 1; }
        }
        @keyframes splashBar {
          to { width: 100%; }
        }
        @keyframes splashGlow {
          0%   { transform: scale(0.4); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes splashLogoPulse {
          from { filter: brightness(1);    }
          to   { filter: brightness(1.08); }
        }
      `}</style>
    </div>
  );
}
