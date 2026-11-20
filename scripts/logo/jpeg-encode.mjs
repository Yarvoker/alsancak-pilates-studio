const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14,
  21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23,
  30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60,
  61, 54, 47, 55, 62, 63,
]

const Y_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
]

const C_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
]

function scaleQuant(base, quality) {
  const q = Math.max(1, Math.min(100, quality))
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2
  return base.map((value) => Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))))
}

function buildHuffman(counts, symbols) {
  const map = new Map()
  let code = 0
  let index = 0
  for (let length = 1; length <= 16; length += 1) {
    for (let n = 0; n < counts[length - 1]; n += 1) {
      map.set(symbols[index], { code, length })
      code += 1
      index += 1
    }
    code <<= 1
  }
  return map
}

const DC_L_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
const DC_L_VAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const DC_C_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
const DC_C_VAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const AC_L_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d]
const AC_L_VAL = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
]
const AC_C_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77]
const AC_C_VAL = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
]

const HUFF_DC_Y = buildHuffman(DC_L_BITS, DC_L_VAL)
const HUFF_DC_C = buildHuffman(DC_C_BITS, DC_C_VAL)
const HUFF_AC_Y = buildHuffman(AC_L_BITS, AC_L_VAL)
const HUFF_AC_C = buildHuffman(AC_C_BITS, AC_C_VAL)

class BitWriter {
  constructor() {
    this.bytes = []
    this.acc = 0
    this.n = 0
  }

  write(value, length) {
    this.acc = ((this.acc << length) | (value & ((1 << length) - 1))) >>> 0
    this.n += length
    while (this.n >= 8) {
      this.n -= 8
      const byte = (this.acc >> this.n) & 255
      this.bytes.push(byte)
      if (byte === 0xff) this.bytes.push(0)
    }
  }

  flush() {
    if (this.n > 0) {
      const byte = ((this.acc << (8 - this.n)) | ((1 << (8 - this.n)) - 1)) & 255
      this.bytes.push(byte)
      if (byte === 0xff) this.bytes.push(0)
    }
  }
}

function dct8(block) {
  const out = new Array(64).fill(0)
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0
      const cu = u === 0 ? 0.7071067811865476 : 1
      const cv = v === 0 ? 0.7071067811865476 : 1
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          sum += block[y * 8 + x]
            * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
            * Math.cos(((2 * y + 1) * v * Math.PI) / 16)
        }
      }
      out[v * 8 + u] = 0.25 * cu * cv * sum
    }
  }
  return out
}

function bitSize(value) {
  if (value === 0) return 0
  let size = 0
  let abs = Math.abs(value)
  while (abs) {
    abs >>= 1
    size += 1
  }
  return size
}

function encodeBlock(writer, samples, quant, dcTable, acTable, prevDc) {
  const freq = dct8(samples)
  const zz = new Array(64)
  for (let i = 0; i < 64; i += 1) {
    const at = ZIGZAG[i]
    zz[i] = Math.round(freq[at] / quant[at])
  }
  const diff = zz[0] - prevDc
  const dcSize = bitSize(diff)
  const dc = dcTable.get(dcSize)
  writer.write(dc.code, dc.length)
  if (dcSize) {
    const mag = diff < 0 ? diff + (1 << dcSize) - 1 : diff
    writer.write(mag, dcSize)
  }
  let run = 0
  for (let i = 1; i < 64; i += 1) {
    const coef = zz[i]
    if (coef === 0) {
      run += 1
      continue
    }
    while (run > 15) {
      const zrl = acTable.get(0xf0)
      writer.write(zrl.code, zrl.length)
      run -= 16
    }
    const size = bitSize(coef)
    const ac = acTable.get((run << 4) | size)
    writer.write(ac.code, ac.length)
    const mag = coef < 0 ? coef + (1 << size) - 1 : coef
    writer.write(mag, size)
    run = 0
  }
  if (run > 0) {
    const eob = acTable.get(0x00)
    writer.write(eob.code, eob.length)
  }
  return zz[0]
}

function marker(bytes, hex) {
  bytes.push((hex >> 8) & 255, hex & 255)
}

function quantSegment(bytes, table, id) {
  marker(bytes, 0xffdb)
  bytes.push(0, 67, id)
  for (let i = 0; i < 64; i += 1) bytes.push(table[ZIGZAG[i]])
}

function huffSegment(bytes, counts, symbols, id) {
  marker(bytes, 0xffc4)
  const length = 2 + 1 + 16 + symbols.length
  bytes.push((length >> 8) & 255, length & 255, id)
  for (const count of counts) bytes.push(count)
  for (const symbol of symbols) bytes.push(symbol)
}

export function encodeJpeg(width, height, rgb, quality = 82) {
  const yQuant = scaleQuant(Y_QUANT, quality)
  const cQuant = scaleQuant(C_QUANT, quality)
  const bw = Math.ceil(width / 8) * 8
  const bh = Math.ceil(height / 8) * 8
  const yPlane = new Float64Array(bw * bh)
  const cbPlane = new Float64Array(bw * bh)
  const crPlane = new Float64Array(bw * bh)
  for (let y = 0; y < bh; y += 1) {
    const sy = Math.min(y, height - 1)
    for (let x = 0; x < bw; x += 1) {
      const sx = Math.min(x, width - 1)
      const i = (sy * width + sx) * 3
      const r = rgb[i]
      const g = rgb[i + 1]
      const b = rgb[i + 2]
      const at = y * bw + x
      yPlane[at] = 0.299 * r + 0.587 * g + 0.114 * b - 128
      cbPlane[at] = -0.168736 * r - 0.331264 * g + 0.5 * b
      crPlane[at] = 0.5 * r - 0.418688 * g - 0.081312 * b
    }
  }
  const writer = new BitWriter()
  let yDc = 0
  let cbDc = 0
  let crDc = 0
  const block = new Array(64)
  for (let by = 0; by < bh; by += 8) {
    for (let bx = 0; bx < bw; bx += 8) {
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          block[row * 8 + col] = yPlane[(by + row) * bw + bx + col]
        }
      }
      yDc = encodeBlock(writer, block, yQuant, HUFF_DC_Y, HUFF_AC_Y, yDc)
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          block[row * 8 + col] = cbPlane[(by + row) * bw + bx + col]
        }
      }
      cbDc = encodeBlock(writer, block, cQuant, HUFF_DC_C, HUFF_AC_C, cbDc)
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          block[row * 8 + col] = crPlane[(by + row) * bw + bx + col]
        }
      }
      crDc = encodeBlock(writer, block, cQuant, HUFF_DC_C, HUFF_AC_C, crDc)
    }
  }
  writer.flush()
  const bytes = []
  marker(bytes, 0xffd8)
  marker(bytes, 0xffe0)
  bytes.push(0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0)
  quantSegment(bytes, yQuant, 0)
  quantSegment(bytes, cQuant, 1)
  marker(bytes, 0xffc0)
  bytes.push(0, 17, 8, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 3)
  bytes.push(1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1)
  huffSegment(bytes, DC_L_BITS, DC_L_VAL, 0x00)
  huffSegment(bytes, AC_L_BITS, AC_L_VAL, 0x10)
  huffSegment(bytes, DC_C_BITS, DC_C_VAL, 0x01)
  huffSegment(bytes, AC_C_BITS, AC_C_VAL, 0x11)
  marker(bytes, 0xffda)
  bytes.push(0, 12, 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0)
  bytes.push(...writer.bytes)
  marker(bytes, 0xffd9)
  return Buffer.from(bytes)
}
