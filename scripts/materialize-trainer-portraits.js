// Portrait bytes are assembled from sorted base64 parts at build time.
import fs from 'node:fs'
import path from 'node:path'

const portraitNames = [
  'onder-guzel',
  'emel-gamze-guzel',
  'devran-cicek',
  'ecrin-aydinli',
  'cemal-ayhan',
]

function portraitBytes(root, name) {
  const dir = path.join(root, 'src', 'trainers', 'portrait-parts')
  const prefix = `${name}.jpg.b64.part`
  const parts = fs.readdirSync(dir).filter((file) => file.startsWith(prefix)).sort()
  const encoded = parts.map((file) => fs.readFileSync(path.join(dir, file), 'utf8').trim()).join('')
  return Buffer.from(encoded, 'base64')
}

function writePortraits(root, outDir) {
  const target = path.join(outDir, 'trainers')
  fs.mkdirSync(target, { recursive: true })
  for (const name of portraitNames) {
    fs.writeFileSync(path.join(target, `${name}.jpg`), portraitBytes(root, name))
  }
}

export function materializeTrainerPortraits(root = process.cwd()) {
  return {
    name: 'materialize-trainer-portraits',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        const match = pathname.match(/^\/trainers\/([a-z0-9-]+)\.jpg$/)
        if (!match || !portraitNames.includes(match[1])) {
          next()
          return
        }
        const bytes = portraitBytes(root, match[1])
        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Content-Length', String(bytes.length))
        res.end(bytes)
      })
    },
    closeBundle() {
      writePortraits(root, path.resolve(root, 'dist'))
    },
  }
}
