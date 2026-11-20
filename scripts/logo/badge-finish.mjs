import { encodeJpeg } from './jpeg-encode.mjs'

export function finishBadge(pixels, width, height) {
  stripHalo(width, height, pixels)
  return socialJpeg(pixels, width, height)
}

function stripHalo(width, height, pixels) {
  let sx = 0
  let sy = 0
  let count = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const a = pixels[i + 3]
      if (a > 200 && Math.abs(r - 170) < 12 && Math.abs(g - 207) < 12 && Math.abs(b - 176) < 12) {
        sx += x
        sy += y
        count += 1
      }
    }
  }
  if (!count) throw new Error('mint disc not found')
  const cx = sx / count
  const cy = sy / count
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const a = pixels[i + 3]
      if (a < 16) continue
      const d = Math.hypot(x - cx, y - cy)
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      if (d >= 64 && r >= 185 && g >= 185 && b >= 175 && spread <= 45) {
        pixels[i] = 0
        pixels[i + 1] = 0
        pixels[i + 2] = 0
        pixels[i + 3] = 0
      }
    }
  }
  const seen = new Uint8Array(width * height)
  const queue = []
  let seed = -1
  for (let y = 0; y < height && seed < 0; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const d = Math.hypot(x - cx, y - cy)
      if (pixels[i + 3] > 200 && Math.abs(pixels[i] - 170) < 12 && Math.abs(pixels[i + 1] - 207) < 12 && d < 25) {
        seed = y * width + x
        break
      }
    }
  }
  if (seed < 0) throw new Error('mint disc not found')
  seen[seed] = 1
  queue.push(seed)
  let head = 0
  while (head < queue.length) {
    const at = queue[head]
    head += 1
    const x = at % width
    const y = (at - x) / width
    const neighbors = [
      [x + 1 < width, at + 1],
      [x > 0, at - 1],
      [y + 1 < height, at + width],
      [y > 0, at - width],
    ]
    for (const [ok, j] of neighbors) {
      if (!ok || seen[j] || pixels[j * 4 + 3] < 16) continue
      seen[j] = 1
      queue.push(j)
    }
  }
  for (let i = 0; i < width * height; i += 1) {
    if (seen[i]) continue
    const o = i * 4
    pixels[o] = 0
    pixels[o + 1] = 0
    pixels[o + 2] = 0
    pixels[o + 3] = 0
  }
}

function socialJpeg(pixels, width, height) {
  const canvasW = 1390
  const canvasH = 752
  const scale = 4
  const dw = width * scale
  const dh = height * scale
  const ox = Math.round((canvasW - dw) / 2)
  const oy = Math.round((canvasH - dh) / 2)
  const rgb = Buffer.alloc(canvasW * canvasH * 3, 0)
  const bg = [12, 31, 27]
  for (let y = 0; y < canvasH; y += 1) {
    for (let x = 0; x < canvasW; x += 1) {
      const o = (y * canvasW + x) * 3
      let r = bg[0]
      let g = bg[1]
      let b = bg[2]
      const sx = (x - ox) / scale
      const sy = (y - oy) / scale
      if (sx >= 0 && sy >= 0 && sx < width && sy < height) {
        const x0 = Math.floor(sx)
        const y0 = Math.floor(sy)
        const x1 = Math.min(width - 1, x0 + 1)
        const y1 = Math.min(height - 1, y0 + 1)
        const tx = sx - x0
        const ty = sy - y0
        const p00 = (y0 * width + x0) * 4
        const p10 = (y0 * width + x1) * 4
        const p01 = (y1 * width + x0) * 4
        const p11 = (y1 * width + x1) * 4
        const mix = (p, ch) => {
          const a00 = pixels[p00 + 3] / 255
          const a10 = pixels[p10 + 3] / 255
          const a01 = pixels[p01 + 3] / 255
          const a11 = pixels[p11 + 3] / 255
          const c00 = pixels[p00 + ch] * a00
          const c10 = pixels[p10 + ch] * a10
          const c01 = pixels[p01 + ch] * a01
          const c11 = pixels[p11 + ch] * a11
          const color = c00 * (1 - tx) * (1 - ty) + c10 * tx * (1 - ty) + c01 * (1 - tx) * ty + c11 * tx * ty
          const alpha = a00 * (1 - tx) * (1 - ty) + a10 * tx * (1 - ty) + a01 * (1 - tx) * ty + a11 * tx * ty
          return Math.round(color + bg[ch] * (1 - alpha))
        }
        r = mix(0, 0)
        g = mix(0, 1)
        b = mix(0, 2)
      }
      rgb[o] = r
      rgb[o + 1] = g
      rgb[o + 2] = b
    }
  }
  return encodeJpeg(canvasW, canvasH, rgb, 82)
}

