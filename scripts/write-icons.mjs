import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

async function loadPng() {
  try {
    return await import('pngjs')
  } catch {
    const install = spawnSync(
      'npm',
      ['install', '--no-save', '--no-package-lock', 'pngjs@7.0.0'],
      { stdio: 'inherit', cwd: process.cwd() },
    )
    if (install.status !== 0) throw new Error('Could not install pngjs for icons')
    return import('pngjs')
  }
}

function boxResize(src, sw, sh, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4)
  for (let y = 0; y < dh; y += 1) {
    const y0 = Math.floor((y * sh) / dh)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh))
    for (let x = 0; x < dw; x += 1) {
      const x0 = Math.floor((x * sw) / dw)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * sw + xx) * 4
          const alpha = src[i + 3]
          r += src[i] * alpha
          g += src[i + 1] * alpha
          b += src[i + 2] * alpha
          a += alpha
          n += 1
        }
      }
      const o = (y * dw + x) * 4
      const alpha = Math.round(a / n)
      dst[o] = alpha ? Math.round(r / a) : 0
      dst[o + 1] = alpha ? Math.round(g / a) : 0
      dst[o + 2] = alpha ? Math.round(b / a) : 0
      dst[o + 3] = alpha
    }
  }
  return dst
}

function writeIco(file, png) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header[6] = 32
  header[7] = 32
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  fs.writeFileSync(file, Buffer.concat([header, png]))
}

export async function writeIcons(root = process.cwd()) {
  const { PNG } = await loadPng()
  const source = PNG.sync.read(fs.readFileSync(path.join(root, 'public/images/ikon-yuvarlak.png')))
  const publicDir = path.join(root, 'public')
  const sizes = [
    [180, 'apple-touch-icon.png'],
    [32, 'favicon-32x32.png'],
  ]
  for (const [size, name] of sizes) {
    const image = new PNG({ width: size, height: size })
    image.data = boxResize(source.data, source.width, source.height, size, size)
    fs.writeFileSync(path.join(publicDir, name), PNG.sync.write(image))
  }
  writeIco(path.join(publicDir, 'favicon.ico'), fs.readFileSync(path.join(publicDir, 'favicon-32x32.png')))
}

if (process.argv[1]?.endsWith('write-icons.mjs')) {
  await writeIcons()
}
