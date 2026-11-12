import fs from 'node:fs'
import path from 'node:path'
import { HOME_H1, PRIVATE_PAGES, PUBLIC_PAGES, canonicalUrl } from '../src/siteSeo.js'

const root = process.cwd()
const dist = path.join(root, 'dist')

function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) {
    throw new Error(`Prerender shell is missing ${pattern}`)
  }
  return html.replace(pattern, replacement)
}

function metaPattern(attr, key) {
  return new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*\\/?>`)
}

function withMeta(shell, page) {
  let html = shell
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
  html = replaceTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl(page.path)}" />`,
  )
  html = replaceTag(html, metaPattern('name', 'robots'), `<meta name="robots" content="${page.robots || 'index, follow'}" />`)
  if (page.description) {
    html = replaceTag(html, metaPattern('name', 'description'), `<meta name="description" content="${page.description}" />`)
    html = replaceTag(html, metaPattern('property', 'og:description'), `<meta property="og:description" content="${page.description}" />`)
    html = replaceTag(html, metaPattern('name', 'twitter:description'), `<meta name="twitter:description" content="${page.description}" />`)
  }
  html = replaceTag(html, metaPattern('property', 'og:url'), `<meta property="og:url" content="${canonicalUrl(page.path)}" />`)
  html = replaceTag(html, metaPattern('property', 'og:title'), `<meta property="og:title" content="${page.title}" />`)
  html = replaceTag(html, metaPattern('name', 'twitter:title'), `<meta name="twitter:title" content="${page.title}" />`)
  return html
}

function pageBody(page) {
  if (page.path === '/') {
    return `<main>
      <section id="ana-sayfa">
        <p>ALSANCAK · İZMİR</p>
        <h1>${HOME_H1}</h1>
        <p>Alsancak, İzmir’de Mat ve Reformer Pilates, Fonksiyonel antrenman ve Crossfit.</p>
        <a href="#iletisim">Rezervasyon Yap</a>
      </section>
      <section id="dersler">
        <h2>Pilatesin içinden.</h2>
        <h3>Reformer Pilates</h3>
        <h3>Fonksiyonel Pilates</h3>
      </section>
      <section id="iletisim">
        <h2>Dersini ayır.</h2>
      </section>
      <section id="egitmen">
        <h2 id="egitmen-baslik">Eğitmenler</h2>
        <ul>
          <li>Önder Güzel</li>
          <li>Emel Gamze Güzel</li>
          <li>Devran Çiçek</li>
          <li>Ecrin Aydınlı</li>
          <li>Cemal Ayhan</li>
        </ul>
      </section>
      <section id="galeri">
        <h2>Stüdyo</h2>
      </section>
      <section id="fiyatlar">
        <h2>Seçim ve yatırım</h2>
      </section>
      <address>
        Alsancak Mahallesi, Talatpaşa Bulvarı No:33/1, Kat:1 Daire:1, Harputlu Apt. Konak / İzmir
        <a href="tel:+905302071908">0530 207 19 08</a>
      </address>
    </main>`
  }
  if (page.path === '/gizlilik') {
    return `<main>
      <h1>Aydınlatma metni</h1>
      <p>Ad, soyad, telefon ve e-posta adresin ders kaydı, hatırlatma ve stüdyo iletişimi için işlenir. Verilerini Hesabım’dan indirebilir veya silinmesini isteyebilirsin.</p>
      <p>Verilerin sana aittir. Silme talebi stüdyoya gider; hesap hemen silinmez.</p>
    </main>`
  }
  const heading = page.title.split('|')[0].trim()
  return `<main><h1>${heading}</h1><p>${page.description}</p></main>`
}

function writePage(shell, page) {
  let html = withMeta(shell, page)
  const body = pageBody(page)
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  if (!html.includes(page.title) || !html.includes(canonicalUrl(page.path)) || !html.includes('<h1>')) {
    throw new Error(`Prerendered ${page.path} is missing its title, canonical, or heading`)
  }
  if (page.path === '/' && !html.includes(HOME_H1)) {
    throw new Error('Homepage prerender is missing the H1')
  }
  const file = page.path === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, page.path.slice(1), 'index.html')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
}

const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
if (!shell.includes('<div id="root"></div>')) {
  throw new Error('dist/index.html is not the Vite shell')
}

for (const page of PRIVATE_PAGES) {
  const html = withMeta(shell, { ...page, robots: 'noindex, nofollow', description: '' })
  if (!html.includes('noindex, nofollow') || !html.includes('<div id="root"></div>')) {
    throw new Error(`Private shell for ${page.path} is invalid`)
  }
  const dir = path.join(dist, page.path.slice(1))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html)
}

for (const page of PUBLIC_PAGES) writePage(shell, page)
