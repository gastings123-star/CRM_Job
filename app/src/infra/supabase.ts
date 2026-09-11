import { createClient } from '@supabase/supabase-js';
import { LOCAL_MODE } from './local-mode';
import { localClient } from './local-client';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!LOCAL_MODE && (!url || !anonKey)) {
  throw new Error('VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY должны быть заданы в .env');
}

export const supabase = LOCAL_MODE
  ? localClient
  : createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
