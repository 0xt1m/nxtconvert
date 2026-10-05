/// <reference types="electron-vite/node" />

declare module 'heic-decode' {
  /** Decodes the primary image, with rotation and mirroring applied, as RGBA pixels. */
  function decode(opts: { buffer: Uint8Array }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>
  export default decode
}
