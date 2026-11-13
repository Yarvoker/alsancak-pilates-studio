import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { compressPublishedHero, writeHeroPoster, writeTrainerFile } from './scripts/mediaWeight.mjs'
import { writeIcons } from './scripts/write-icons.mjs'
import { TRAINERS } from './src/studioCopy.js'

let prerenderStarted = false

function seoBuild() {
  return {
    name: 'seo-build',
    buildStart() {
      writeHeroPoster(process.cwd())
      return writeIcons(process.cwd())
    },
    closeBundle() {
      if (process.env.PRERENDER === '1' || prerenderStarted) return
      prerenderStarted = true
      compressPublishedHero(path.join(process.cwd(), 'dist'))
      const result = spawnSync(process.execPath, ['scripts/prerender.mjs'], {
        cwd: process.cwd(),
        env: { ...process.env, PRERENDER: '1' },
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      })
      if (result.status !== 0) {
        const detail = [result.stdout, result.stderr, result.error && result.error.message]
          .filter(Boolean)
          .join('\n')
          .slice(-6000)
        fs.mkdirSync('dist', { recursive: true })
        fs.writeFileSync('dist/prerender-error.txt', detail || `prerender status ${result.status}`)
        throw new Error(detail || `prerender status ${result.status}`)
      }
    },
  }
}

const portraits = [
  {
    url: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/trainer-portraits/onder-guzel.jpg',
    file: 'onder-guzel.jpg',
    label: 'Önder',
  },
  {
    url: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/trainer-portraits/emel-gamze-guzel.jpg',
    file: 'emel-gamze-guzel.jpg',
    label: 'Emel',
  },
  {
    url: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/trainer-portraits/devran-cicek.jpg',
    file: 'devran-cicek.jpg',
    label: 'Devran',
  },
  {
    url: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/trainer-portraits/ecrin-aydinli.jpg',
    file: 'ecrin-aydinli.jpg',
    label: 'Ecrin',
  },
  {
    url: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/trainer-portraits/cemal-ayhan.jpg',
    file: 'cemal-ayhan.jpg',
    label: 'Cemal',
  },
]

function portraitFrame() {
  const branches = TRAINERS.map((trainer) => {
    const className = trainer.className ? `trainer-portrait ${trainer.className}` : 'trainer-portrait'
    const srcSet = trainer.srcSet ? ` srcSet="${trainer.srcSet}" sizes="${trainer.sizes}"` : ''
    const img = `<img className="${className}" src="${trainer.image}" alt="${trainer.name}" width="${trainer.width}" height="${trainer.height}"${srcSet} loading="lazy" decoding="async" />`
    return `name === ${JSON.stringify(trainer.name)} ? ${img}`
  })
  return `<div className="instructor-frame">{${branches.join(' : ')} : null}</div>`
}

async function writePortrait(root, portrait) {
  const response = await fetch(portrait.url)
  if (!response.ok) {
    throw new Error(`${portrait.label} portrait download failed`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error(`${portrait.label} portrait did not download as a JPEG`)
  }
  writeTrainerFile(root, portrait.file, bytes)
}

function onderPortrait(root = process.cwd()) {
  const publish = () => {
    if (process.env.PRERENDER === '1') return Promise.resolve()
    return Promise.all(portraits.map((portrait) => writePortrait(root, portrait)))
  }
  return {
    name: 'onder-portrait',
    enforce: 'pre',
    buildStart: publish,
    configureServer: publish,
    transform(code, id) {
      const file = id.split('?')[0]
      if (file.endsWith('/PilatesApp.jsx') || file.endsWith('\\PilatesApp.jsx')) {
        const needle = '<div className="instructor-frame" />'
        if (!code.includes(needle) || code.includes('/trainers/onder-guzel.jpg')) return null
        let next = code.replaceAll(needle, portraitFrame())
        if (!next.includes('trainers/TrainerRoster.css')) {
          next = `import './trainers/TrainerRoster.css'\n${next}`
        }
        return next
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [react(), onderPortrait(), seoBuild()],
})
