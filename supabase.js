// ==========================================
// SUPABASE CONFIG - Optimized for GitHub Pages
// ==========================================

const SUPABASE_URL = "https://bstlapezdavbjctkfdb.supabase.co";
const SUPABASE_KEY = "sb_publishable_8YXdiu6iLWFcM2t-5Yz9Pg_o6XkRpwr";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
    }
});

console.log("✅ Supabase client initialized for production");
