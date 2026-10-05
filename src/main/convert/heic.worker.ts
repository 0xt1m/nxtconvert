// Decodes one HEIC photo off the main thread: the WebAssembly decoder is synchronous and would
// otherwise freeze the app and stop two photos from converting at the same time.
import { parentPort, workerData } from 'node:worker_threads'
import decode from 'heic-decode'

/** HEIC photos are almost always opaque; dropping an all-255 alpha keeps JPEGs and PDFs simple. */
function withoutOpaqueAlpha(rgba: Uint8Array, width: number, height: number): { pixels: Uint8Array; channels: 3 | 4 } {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return { pixels: rgba, channels: 4 }
  const rgb = new Uint8Array(width * height * 3)
  for (let s = 0, d = 0; s < rgba.length; s += 4, d += 3) {
    rgb[d] = rgba[s]
    rgb[d + 1] = rgba[s + 1]
    rgb[d + 2] = rgba[s + 2]
  }
  return { pixels: rgb, channels: 3 }
}

decode({ buffer: workerData as Uint8Array })
  .then(({ width, height, data }) => {
    const { pixels, channels } = withoutOpaqueAlpha(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height)
    parentPort!.postMessage({ width, height, channels, pixels }, [pixels.buffer as ArrayBuffer])
  })
  .catch((err: Error) => parentPort!.postMessage({ error: err.message }))
