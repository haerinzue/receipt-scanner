import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

if (!window.supabase?.createClient) {
  throw new Error("Hindi na-load ang Supabase library. Suriin ang internet connection.");
}
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
