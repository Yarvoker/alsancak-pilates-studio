import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const portraitUrl =
  'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/trainer-portraits/onder-guzel.jpg'

const onderFrame =
  '<div className="instructor-frame">{name === \'Önder Güzel\' ? <img className="trainer-portrait" src="/trainers/onder-guzel.jpg" alt="Önder Güzel" width="989" height="1200" loading="lazy" decoding="async" /> : null}</div>'

async function writeOnderPortrait(root) {
  const response = await fetch(portraitUrl)
  if (!response.ok) {
    throw new Error('Önder portrait download failed')
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error('Önder portrait did not download as a JPEG')
  }
  const target = path.join(root, 'public', 'trainers')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'onder-guzel.jpg'), bytes)
}

function onderPortrait(root = process.cwd()) {
  const publish = () => writeOnderPortrait(root)
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
