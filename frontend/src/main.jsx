import { StrictMode, useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import { isSupabaseConfigured, supabase } from './supabase.js'

function Root() {
  const [splashDone, setSplashDone] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 text-center">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable secure user workspaces.</div>;
  if (authLoading) return null;
  if (!session) return <AuthScreen />;

  return (
    <>
      {!splashDone && <SplashScreen onFinish={handleSplashFinish} />}
      {/* Render App beneath splash so it's loaded and ready when splash exits */}
      <App user={session.user} onSignOut={() => supabase.auth.signOut()} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
