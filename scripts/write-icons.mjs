import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function readPng(file) {
  const data = fs.readFileSync(file)
  let offset = 8
  let width = 0
  let height = 0
  const idat = []
  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    const type = data.toString('ascii', offset + 4, offset + 8)
    const chunk = data.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
    } else if (type === 'IDAT') {
      idat.push(chunk)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(width * height * 4)
  let src = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src]
    src += 1
    const row = src
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      const value = raw[row + x]
      let out = value
      if (filter === 1) out = (value + left) & 255
      else if (filter === 2) out = (value + up) & 255
      else if (filter === 3) out = (value + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) {
        const estimate = left + up - upLeft
        const pa = Math.abs(estimate - left)
        const pb = Math.abs(estimate - up)
        const pc = Math.abs(estimate - upLeft)
        const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
        out = (value + pred) & 255
      }
      pixels[y * stride + x] = out
    }
    src += stride
  }
  return { width, height, pixels }
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

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  const crc = zlib.crc32(body)
  out.writeUInt32BE(crc >>> 0, 8 + data.length)
  return out
}

function writePng(file, width, height, pixels) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(file, png)
}

function writeIco(file, png) {
  const header = Buffer.alloc(22)
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

function writeExact(root, encodedName, destRelative) {
  let encoded = fs.readFileSync(path.join(root, 'scripts/logo', encodedName), 'utf8').replace(/\s+/g, '')
  if (encodedName === 'ikon-yuvarlak.b64') {
    encoded = encoded
      .replace('K4mtR0vQ6BdJgmc7QxdFTAsD', 'K4mtR0vQ6BdJmmc7QxdFTAsD')
      .replace('2fTB3Ye+6ql+2tMSOvuPv/5/', '2fTB3Ye+6ql+3tMSOvuPv/5/')
      .replace('1xH4SmPumlIyxx9Dff/7nFzQ', '1xH4SmPumlIywx9Dff/7nFzQ')
  }
  const bytes = Buffer.from(encoded, 'base64')
  const dest = path.join(root, destRelative)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, bytes)
  return bytes
}

export function writeIcons(root = process.cwd()) {
  // The GitHub contents API stores this text as UTF-8, so the logo bytes live in
  // ASCII base64 and are written back to the public paths before the build copies them.
  const png = writeExact(root, 'ikon-yuvarlak.b64', 'public/images/ikon-yuvarlak.png')
  if (png[0] !== 0x89 || png.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('ikon-yuvarlak.b64 did not decode to a PNG')
  }
  const digest = crypto.createHash('sha256').update(png).digest('hex')
  if (digest !== '5e7a899dda294fe2cbabc689c1f9aa50100abd9dcd89b5a7f4ad40201680474f') {
    throw new Error('ikon-yuvarlak.png is not the mint badge')
  }
  const jpgEncoded = [0, 1, 2, 3, 4, 5]
    .map((part) => fs.readFileSync(path.join(root, 'scripts/logo', `jpg-${part}.b64`), 'utf8'))
    .join('')
    .replace(/\s+/g, '')
  const jpg = Buffer.from(jpgEncoded, 'base64')
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8 || jpg[2] !== 0xff) {
    throw new Error('social logo slices did not decode to a JPEG')
  }
  const jpgDigest = crypto.createHash('sha256').update(jpg).digest('hex')
  if (jpgDigest !== '98b0f5b9b2fc89680d80b3eb117fe3fe25559c38b8c2c5d0ecef116a7e60f0f8') {
    throw new Error('alsancak-pilates-logo.jpg is not the mint badge')
  }
  const jpgDest = path.join(root, 'public/images/alsancak-pilates-logo.jpg')
  fs.mkdirSync(path.dirname(jpgDest), { recursive: true })
  fs.writeFileSync(jpgDest, jpg)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <image href="data:image/png;base64,${png.toString('base64')}" width="64" height="64"/>\n</svg>\n`
  fs.writeFileSync(path.join(root, 'public/favicon.svg'), svg)
  const source = readPng(path.join(root, 'public/images/ikon-yuvarlak.png'))
  const dir = path.join(root, 'public')
  for (const [size, name] of [[180, 'apple-touch-icon.png'], [32, 'favicon-32x32.png']]) {
    writePng(path.join(dir, name), size, size, boxResize(source.pixels, source.width, source.height, size, size))
  }
  writeIco(path.join(dir, 'favicon.ico'), fs.readFileSync(path.join(dir, 'favicon-32x32.png')))
}

if (process.argv[1]?.endsWith('write-icons.mjs')) writeIcons()
