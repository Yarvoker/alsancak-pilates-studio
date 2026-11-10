import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const photos = [
  {
    name: 'studio-empty-1.jpg',
    bytes: 248471,
    url: 'https://tmpfiles.org/dl/1794309291.b513454fd6960fac/w1AFW4YRp5Kb/studio-empty-1.jpg',
  },
  {
    name: 'studio-empty-2.jpg',
    bytes: 250562,
    url: 'https://tmpfiles.org/dl/1794309291.6fdf2dfc8ba2e72e/wKAbWwYapPZd/studio-empty-2.jpg',
  },
  {
    name: 'studio-class-1.jpg',
    bytes: 268364,
    url: 'https://tmpfiles.org/dl/1794309291.2ff35d8ca9aec379/w0AjWtYaplnl/studio-class-1.jpg',
  },
  {
    name: 'studio-class-2.jpg',
    bytes: 233792,
    url: 'https://tmpfiles.org/dl/1794309292.a6078c00be216f6e/wIACW3YppWMU/studio-class-2.jpg',
  },
  {
    name: 'studio-class-3.jpg',
    bytes: 252483,
    url: 'https://tmpfiles.org/dl/1794309292.df252ccef3cca0fb/wiAKWnYLpaV1/studio-class-3.jpg',
  },
]

function fromParts(name, expected) {
  const dir = path.join(root, 'src', 'gallery')
  if (!fs.existsSync(dir)) return null
  const parts = fs.readdirSync(dir).filter((file) => file.startsWith(`${name}.b64.part`)).sort()
  if (parts.length === 0) return null
  const encoded = parts.map((file) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/\s+/g, '')).join('')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === expected && bytes[0] === 0xff && bytes[1] === 0xd8) return bytes
  return null
}

async function download(url, expected) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Gallery download failed ${response.status} ${url}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length !== expected || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`Gallery download for ${url} is not the expected JPEG`)
  }
  return bytes
}

const outDir = path.join(root, 'public', 'gallery')
fs.mkdirSync(outDir, { recursive: true })

for (const photo of photos) {
  const bytes = fromParts(photo.name, photo.bytes) ?? await download(photo.url, photo.bytes)
  fs.writeFileSync(path.join(outDir, photo.name), bytes)
}
