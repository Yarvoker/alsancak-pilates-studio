import fs from 'node:fs'
import path from 'node:path'

const url = process.env.VITE_SUPABASE_URL || 'https://tkzbfgkeridpaqmylunn.supabase.co'
const key = process.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremJmZ2tlcmlkcGFxbXlsdW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTcyMTEsImV4cCI6MjEwODU5MzIxMX0.Ept3JVu098SmCCgNqSJv128yn9t_rjGNhFq8be9k60Q'

const keys = ['package_terms', 'iptal_iade', 'mesafeli_satis', 'cerez']

const response = await fetch(`${url}/rest/v1/site_content?select=key,title,body`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
})
if (!response.ok) {
  throw new Error(`site_content request failed: ${response.status}`)
}
const rows = await response.json()
if (!Array.isArray(rows)) {
  throw new Error('site_content response was not a list')
}

const snapshot = {}
for (const contentKey of keys) {
  const row = rows.find((item) => item.key === contentKey)
  const body = String(row?.body || '')
  const title = String(row?.title || '')
  if (!row || body.trim().length < 80) {
    console.error(`LEGAL CONTENT MISSING: ${contentKey} body is ${body.trim().length} characters in Supabase. The build will not invent this text.`)
  }
  snapshot[contentKey] = { title, body }
}

const target = path.join(process.cwd(), 'src/legalSnapshot.json')
fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`)
