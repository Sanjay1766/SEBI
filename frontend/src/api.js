import { API_URL } from './config';
import { supabase } from './supabase';

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(`${API_URL}${path}`, { ...options, headers });
}
