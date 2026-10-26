import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://tkzbfgkeridpaqmylunn.supabase.co'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremJmZ2tlcmlkcGFxbXlsdW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTcyMTEsImV4cCI6MjEwODU5MzIxMX0.Ept3JVu098SmCCgNqSJv128yn9t_rjGNhFq8be9k60Q'

// Auth rate limit noted for the dashboard (Authentication → Rate Limits):
// rate_limit_otp = 4 codes per hour. Same address waits 60 seconds before another code.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})