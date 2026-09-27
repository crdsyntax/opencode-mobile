/**
 * Generates the two notification tones shipped in android/app/src/main/res/raw.
 *
 * Android binds a sound to a notification *channel* at creation time, so success and failure need
 * two channels and therefore two distinct files. They are synthesised here rather than shipped as
 * binary assets to keep the repository free of opaque blobs.
 *
 * Run with: bun scripts/make-notification-sounds.ts
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const RATE = 44100

function envelope(index: number, total: number) {
  // Fast attack, exponential decay, and a short fade out so there is no click at the end.
  const t = index / total
  const attack = Math.min(1, t / 0.02)
  const decay = Math.exp(-4.5 * t)
  const tail = t > 0.9 ? (1 - t) / 0.1 : 1
  return attack * decay * tail
}

/** One tone with a soft attack/decay. `harmonic` adds a quiet octave for body. */
function tone(freq: number, seconds: number, gain = 0.42, harmonic = 0.18) {
  const total = Math.floor(RATE * seconds)
  const out = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    const t = i / RATE
    const env = envelope(i, total)
    const fundamental = Math.sin(2 * Math.PI * freq * t)
    const overtone = Math.sin(2 * Math.PI * freq * 2 * t) * harmonic
    out[i] = (fundamental + overtone) * env * gain
  }
  return out
}

function silence(seconds: number) {
  return new Float32Array(Math.floor(RATE * seconds))
}

function concat(parts: readonly Float32Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Float32Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function wav(samples: Float32Array) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(RATE, 24)
  buffer.writeUInt32LE(RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value))
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2)
  })
  return buffer
}

// Success: a rising major arpeggio, reads as "done" without being alarming.
const success = concat([tone(659.25, 0.13), tone(987.77, 0.26, 0.4)])

// Failure: two low pulses a fifth apart, deliberately dull and easy to recognise while pocketed.
const failure = concat([tone(233.08, 0.16, 0.46, 0.3), silence(0.06), tone(174.61, 0.32, 0.46, 0.3)])

const target = join(process.cwd(), "android", "app", "src", "main", "res", "raw")
mkdirSync(target, { recursive: true })
for (const [name, samples] of [
  ["success.wav", success],
  ["error.wav", failure],
] as const) {
  const file = join(target, name)
  writeFileSync(file, wav(samples))
  console.log(`wrote ${file} (${(samples.length / RATE).toFixed(2)}s)`)
}
