// ==========================================
// SUPABASE CONFIG - Optimized for GitHub Pages
// ==========================================

const SUPABASE_URL = "https://dssljeucfyxurxtlvyvv.supabase.co";
const SUPABASE_KEY = "sb_publishable_B798Y2wl4MRTN7_szgLbkQ_ZVLj3AZF";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
    }
});

console.log("✅ Supabase client initialized for production");
