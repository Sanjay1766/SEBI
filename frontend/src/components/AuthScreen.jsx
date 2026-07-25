import { useState } from 'react';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { supabase } from '../supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setMessage('');
    const result = mode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    setMessage(mode === 'signin' ? 'Signed in.' : 'Check your email to confirm your account, then sign in.');
  };
  return <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl space-y-5"><div><p className="text-xs font-bold tracking-widest text-blue-600 uppercase">IPO Sherpa</p><h1 className="mt-2 text-2xl font-bold text-slate-900">Your secure IPO workspace</h1><p className="mt-2 text-sm text-slate-500">Each account has its own saved application and documents.</p></div><label className="block text-sm font-medium text-slate-700">Email<input className="form-input-base mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label><label className="block text-sm font-medium text-slate-700">Password<input className="form-input-base mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="8" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></label>{message && <p className="text-sm text-slate-600">{message}</p>}<button className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{mode === 'signin' ? 'Sign in' : 'Create account'}</button><button type="button" className="w-full text-sm font-medium text-blue-600" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button></form></main>;
}
