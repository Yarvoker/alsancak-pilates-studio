import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://tkzbfgkeridpaqmylunn.supabase.co'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremJmZ2tlcmlkcGFxbXlsdW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTcyMTEsImV4cCI6MjEwODU5MzIxMX0.Ept3JVu098SmCCgNqSJv128yn9t_rjGNhFq8be9k60Q'

export const supabase = createClient(url, anonKey)