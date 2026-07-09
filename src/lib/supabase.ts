import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error(
    "חסרים משתני סביבה: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY",
  );
}

export const supabase = createClient(url, anonKey);
