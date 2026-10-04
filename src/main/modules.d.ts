declare module 'heic-convert' {
  function convert(opts: { buffer: Buffer | Uint8Array; format: 'PNG' | 'JPEG'; quality?: number }): Promise<ArrayBuffer>
  export default convert
}
