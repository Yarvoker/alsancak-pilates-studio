import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const COMPRESS = {
  'devran-cicek.jpg': {
    source: [2048, 1984],
    outputs: [
      { file: 'devran-cicek.webp', width: 720, height: 698 },
      { file: 'devran-cicek-480.webp', width: 480, height: 466 },
    ],
  },
  'ecrin-aydinli.jpg': {
    source: [1536, 1815],
    outputs: [
      { file: 'ecrin-aydinli.webp', width: 720, height: 850 },
      { file: 'ecrin-aydinli-480.webp', width: 480, height: 568 },
    ],
  },
  'emel-gamze-guzel.jpg': {
    source: [1086, 1356],
    outputs: [
      { file: 'emel-gamze-guzel.webp', width: 720, height: 900 },
      { file: 'emel-gamze-guzel-480.webp', width: 480, height: 600 },
    ],
  },
}

function ffmpegBin() {
  if (process.env.FFMPEG_BIN && fs.existsSync(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN
  try {
    const bin = createRequire(import.meta.url)('ffmpeg-static')
    if (bin && fs.existsSync(bin)) return bin
  } catch {
    // fall through to the system binary
  }
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  if (probe.status === 0) return 'ffmpeg'
  throw new Error('ffmpeg is not available for media compression')
}

function dimensions(file) {
  const ff = ffmpegBin()
  const info = spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const text = `${info.stderr || ''}\n${info.stdout || ''}`
  const match = text.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
  if (!match) throw new Error(`Could not read dimensions of ${file}`)
  return [Number(match[1]), Number(match[2])]
}

export function writeTrainerFile(root, fileName, bytes) {
  const target = path.join(root, 'public', 'trainers')
  fs.mkdirSync(target, { recursive: true })
  const spec = COMPRESS[fileName]
  if (!spec) {
    fs.writeFileSync(path.join(target, fileName), bytes)
    return
  }
  const source = path.join(target, `${fileName}.source.jpg`)
  fs.writeFileSync(source, bytes)
  const [width, height] = dimensions(source)
  if (width !== spec.source[0] || height !== spec.source[1]) {
    throw new Error(`${fileName} is ${width}x${height}, expected ${spec.source[0]}x${spec.source[1]}`)
  }
  const ff = ffmpegBin()
  for (const output of spec.outputs) {
    const dest = path.join(target, output.file)
    const result = spawnSync(ff, [
      '-y',
      '-i', source,
      '-vf', `scale=${output.width}:-2`,
      '-c:v', 'libwebp',
      '-quality', '86',
      dest,
    ], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr || `${output.file} compression failed`)
    }
    const [outWidth, outHeight] = dimensions(dest)
    if (outWidth !== output.width || outHeight !== output.height) {
      throw new Error(`${output.file} is ${outWidth}x${outHeight}, expected ${output.width}x${output.height}`)
    }
    if (fs.statSync(dest).size > 150 * 1024) {
      throw new Error(`${output.file} is over 150KB`)
    }
  }
  fs.unlinkSync(source)
  const stale = path.join(target, fileName)
  if (fs.existsSync(stale)) fs.unlinkSync(stale)
}

export function writeHeroPoster(root) {
  const video = path.join(root, 'public', 'images', 'hero-pilates.mp4')
  const poster = path.join(root, 'public', 'images', 'hero-poster.jpg')
  if (!fs.existsSync(video)) throw new Error('hero video is missing')
  const result = spawnSync(ffmpegBin(), [
    '-y',
    '-ss', '0.8',
    '-i', video,
    '-frames:v', '1',
    '-q:v', '4',
    poster,
  ], { encoding: 'utf8' })
  if (result.status !== 0 || !fs.existsSync(poster)) {
    throw new Error(result.stderr || 'hero poster failed')
  }
}

export function compressPublishedHero(distDir) {
  const video = path.join(distDir, 'images', 'hero-pilates.mp4')
  const poster = path.join(distDir, 'images', 'hero-poster.jpg')
  if (!fs.existsSync(video)) throw new Error('dist hero video is missing')
  const ff = ffmpegBin()
  const posterRun = spawnSync(ff, [
    '-y',
    '-ss', '0.8',
    '-i', video,
    '-frames:v', '1',
    '-q:v', '4',
    poster,
  ], { encoding: 'utf8' })
  if (posterRun.status !== 0) throw new Error(posterRun.stderr || 'dist hero poster failed')
  const tmp = path.join(distDir, 'images', 'hero-pilates.compressed.mp4')
  const encoded = spawnSync(ff, [
    '-y',
    '-i', video,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    tmp,
  ], { encoding: 'utf8' })
  if (encoded.status !== 0) throw new Error(encoded.stderr || 'hero compression failed')
  const size = fs.statSync(tmp).size
  if (size >= 700 * 1024 || size < 80 * 1024) {
    throw new Error(`compressed hero video is ${size} bytes`)
  }
  fs.renameSync(tmp, video)
}
