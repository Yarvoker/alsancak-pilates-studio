import fs from 'node:fs'
import path from 'node:path'

const PATHS = {
  '/paket-kosullari': 'package_terms',
  '/iptal-iade': 'iptal_iade',
  '/mesafeli-satis': 'mesafeli_satis',
  '/cerez': 'cerez',
}

const TITLES = {
  '/paket-kosullari': 'Paket Koşulları',
  '/iptal-iade': 'İptal ve İade',
  '/mesafeli-satis': 'Mesafeli Satış Sözleşmesi',
  '/cerez': 'Çerez Politikası',
}

const snapshot = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/legalSnapshot.json'), 'utf8'))

export function legalRecord(pagePath) {
  const key = PATHS[pagePath]
  if (!key) return null
  const row = snapshot[key] || { title: '', body: '' }
  const body = String(row.body || '')
  return {
    key,
    title: String(row.title || '').trim() || TITLES[pagePath],
    body,
    missing: body.trim().length < 80,
  }
}

export function legalBody(pagePath) {
  const row = legalRecord(pagePath)
  if (!row) return null
  return { text: row.missing ? 'İçerik hazırlanıyor.' : row.body }
}

export function legalTitle(pagePath) {
  return legalRecord(pagePath)?.title || ''
}
