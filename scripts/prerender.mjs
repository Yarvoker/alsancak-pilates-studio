import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { preview } from 'vite'
import { HOME_H1, PRIVATE_PAGES, PUBLIC_PAGES, canonicalUrl } from '../src/siteSeo.js'

async function loadChromium() {
  const toolRoot = path.join(root, '.prerender-tools')
  const entry = path.join(toolRoot, 'node_modules/playwright/index.mjs')
  if (!fs.existsSync(entry)) {
    fs.mkdirSync(toolRoot, { recursive: true })
    fs.writeFileSync(path.join(toolRoot, 'package.json'), '{"private":true}\n')
    const install = spawnSync('npm', ['install', '--no-package-lock', 'playwright@1.65.0'], {
      cwd: toolRoot,
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
      encoding: 'utf8',
    })
    if (install.status !== 0) {
      throw new Error(`Could not install Playwright for prerender\n${install.stdout || ''}\n${install.stderr || ''}`)
    }
  }
  const playwright = await import(pathToFileURL(entry).href)
  if (!playwright.chromium) throw new Error('Playwright did not export chromium')
  return playwright.chromium
}

const root = process.cwd()
const dist = path.join(root, 'dist')

function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) {
    throw new Error(`Prerender shell is missing ${pattern}`)
  }
  return html.replace(pattern, replacement)
}

function privateShell(shell, page) {
  let html = shell
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
  html = replaceTag(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl(page.path)}" />`,
  )
  html = replaceTag(
    html,
    /<meta name="robots" content="[^"]*"\s*\/?>/,
    '<meta name="robots" content="noindex, nofollow" />',
  )
  html = replaceTag(
    html,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonicalUrl(page.path)}" />`,
  )
  html = replaceTag(
    html,
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${page.title}" />`,
  )
  return html
}

function writePrivateShells(shell) {
  for (const page of PRIVATE_PAGES) {
    const dir = path.join(dist, page.path.slice(1))
    fs.mkdirSync(dir, { recursive: true })
    const html = privateShell(shell, page)
    if (!html.includes('noindex, nofollow') || !html.includes('<div id="root"></div>')) {
      throw new Error(`Private shell for ${page.path} is invalid`)
    }
    fs.writeFileSync(path.join(dir, 'index.html'), html)
  }
}

async function launchBrowser() {
  const chromium = await loadChromium()
  const options = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  try {
    return await chromium.launch(options)
  } catch (error) {
    const install = spawnSync('npx', ['playwright', 'install', 'chromium'], {
      cwd: path.join(root, '.prerender-tools'),
      encoding: 'utf8',
    })
    if (install.status !== 0) {
      throw new Error(`playwright install chromium failed\n${install.stderr || ''}\n${error}`)
    }
    try {
      return await chromium.launch(options)
    } catch (launchError) {
      throw new Error(`Chromium did not start\n${launchError}`)
    }
  }
}

async function renderPages(origin) {
  const browser = await launchBrowser()
  try {
    for (const pageInfo of PUBLIC_PAGES) {
      const page = await browser.newPage()
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
        const type = route.request().resourceType()
        if (type === 'document' || type === 'script' || type === 'stylesheet' || type === 'font' || type === 'image' || type === 'media') {
          return route.abort()
        }
        return new Promise(() => {})
      })
      const target = new URL(pageInfo.path, origin).toString()
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction((title) => document.title === title, pageInfo.title, { timeout: 20000 })
      if (pageInfo.path === '/') {
        await page.waitForSelector('#ana-sayfa h1')
      } else {
        await page.waitForSelector('h1')
      }
      const html = await page.content()
      if (!html.includes(pageInfo.title) || !html.includes(canonicalUrl(pageInfo.path))) {
        throw new Error(`Prerendered ${pageInfo.path} is missing its title or canonical`)
      }
      if (pageInfo.path === '/' && !html.includes(HOME_H1)) {
        throw new Error('Homepage prerender is missing the H1')
      }
      const file = pageInfo.path === '/'
        ? path.join(dist, 'index.html')
        : path.join(dist, pageInfo.path.slice(1), 'index.html')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, html)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
if (!shell.includes('<div id="root"></div>')) {
  throw new Error('dist/index.html is not the Vite shell')
}
writePrivateShells(shell)

const port = await freePort()
const server = await preview({
  root,
  preview: { host: '127.0.0.1', port, strictPort: true },
})
try {
  const origin = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${port}/`
  await renderPages(origin)
} finally {
  await server.close()
}
