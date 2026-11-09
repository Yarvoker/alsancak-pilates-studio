import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
]

const onderFrame =
  "<div className=\"instructor-frame\">{name === '\u00d6nder G\u00fczel' ? <img className=\"trainer-portrait\" src=\"/trainers/onder-guzel.jpg\" alt=\"\u00d6nder G\u00fczel\" width=\"989\" height=\"1200\" loading=\"lazy\" decoding=\"async\" /> : name === 'Emel Gamze G\u00fczel' ? <img className=\"trainer-portrait emel-portrait\" src=\"/trainers/emel-gamze-guzel.jpg\" alt=\"Emel Gamze G\u00fczel\" width=\"1086\" height=\"1356\" loading=\"lazy\" decoding=\"async\" /> : name === 'Devran \u00c7i\u00e7ek' ? <img className=\"trainer-portrait devran-portrait\" src=\"/trainers/devran-cicek.jpg\" alt=\"Devran \u00c7i\u00e7ek\" width=\"2048\" height=\"1984\" loading=\"lazy\" decoding=\"async\" /> : null}</div>"

async function writePortrait(root, portrait) {
  const response = await fetch(portrait.url)
  if (!response.ok) {
    throw new Error(`${portrait.label} portrait download failed`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error(`${portrait.label} portrait did not download as a JPEG`)
  }
  const target = path.join(root, 'public', 'trainers')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, portrait.file), bytes)
}

function onderPortrait(root = process.cwd()) {
  const publish = () => Promise.all(portraits.map((portrait) => writePortrait(root, portrait)))
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
        let next = code.replaceAll(needle, onderFrame)
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
  plugins: [react(), onderPortrait()],
})
