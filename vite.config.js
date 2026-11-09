import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const portraitBytes = {
  'onder-guzel': 115667,
  'emel-gamze-guzel': 112699,
  'devran-cicek': 144367,
  'ecrin-aydinli': 140954,
  'cemal-ayhan': 98199,
}

function b64Length(byteLength) {
  return Math.ceil(byteLength / 3) * 4
}

function encodedParts(root, name) {
  const dir = path.join(root, 'src', 'trainers', 'portrait-parts')
  if (!fs.existsSync(dir)) return ''
  const prefix = `${name}.jpg.b64.part`
  const files = fs.readdirSync(dir).filter((file) => file.startsWith(prefix)).sort()
  const want = b64Length(portraitBytes[name])
  const textOf = (file) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/\s+/g, '')
  const joined = files.map(textOf).join('')
  if (joined.length === want) return joined
  const sequential = files.filter((file) => /\.part\d{2}[ab]\d?$/.test(file))
  const sequentialText = sequential.map(textOf).join('')
  return sequentialText.length === want ? sequentialText : ''
}

function portraitBuffer(root, name) {
  const encoded = encodedParts(root, name)
  if (!encoded) return null
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length !== portraitBytes[name]) return null
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null
  return bytes
}

function writeCompletePortraits(root) {
  const target = path.join(root, 'public', 'trainers')
  fs.mkdirSync(target, { recursive: true })
  for (const name of Object.keys(portraitBytes)) {
    const bytes = portraitBuffer(root, name)
    if (!bytes) continue
    fs.writeFileSync(path.join(target, `${name}.jpg`), bytes)
    console.log(`trainer portrait ${name}.jpg ${bytes.length}`)
  }
}

const portraitMap = `const trainerPortraits = {
  '\u00d6nder G\u00fczel': '/trainers/onder-guzel.jpg',
  'Emel Gamze G\u00fczel': '/trainers/emel-gamze-guzel.jpg',
  'Devran \u00c7i\u00e7ek': '/trainers/devran-cicek.jpg',
  'Ecrin Ayd\u0131nl\u0131': '/trainers/ecrin-aydinli.jpg',
  'Cemal Ayhan': '/trainers/cemal-ayhan.jpg',
}

`

function materializeTrainerPortraits(root = process.cwd()) {
  return {
    name: 'materialize-trainer-portraits',
    buildStart() {
      writeCompletePortraits(root)
    },
    transform(code, id) {
      const file = id.split('?')[0]
      if (file.endsWith('/PilatesApp.jsx') || file.endsWith('\\PilatesApp.jsx')) {
        if (code.includes('trainerPortraits') || !code.includes('<div className="instructor-frame" />')) return null
        return code
          .replace('const instructors = [', `${portraitMap}const instructors = [`)
          .replace(
            '<div className="instructor-frame" />',
            '<div className="instructor-frame"><img className="trainer-portrait" src={trainerPortraits[name]} alt={name} width="1200" height="1600" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.remove() }} /></div>',
          )
      }
      if ((file.endsWith('/PilatesApp.css') || file.endsWith('\\PilatesApp.css')) && !code.includes('.trainer-portrait')) {
        return code.replace(
          '.instructor-name {',
          '.trainer-portrait { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }\n.instructor-name {',
        )
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [react(), materializeTrainerPortraits()],
})
