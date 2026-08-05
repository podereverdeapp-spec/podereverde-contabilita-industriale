import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pyjymnpnxatqwfhguaus.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PiDVF4DUuzCbrh9bSxTnyw_Bat6NLEm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
