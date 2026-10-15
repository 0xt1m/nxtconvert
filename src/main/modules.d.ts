/// <reference types="electron-vite/node" />

declare module 'heic-decode' {
  /** Decodes the primary image, with rotation and mirroring applied, as RGBA pixels. */
  function decode(opts: { buffer: Uint8Array }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>
  export default decode
}

declare module 'dxf' {
  /** Parses a DXF drawing; only what nxtconvert uses is typed here. */
  export class Helper {
    constructor(contents: string)
    readonly parsed: { header?: Record<string, unknown> }
    readonly denormalised: Record<string, unknown>[]
    toSVG(): string
  }
}

