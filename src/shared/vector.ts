// Output size for vector images (SVG) turned into pixels. Shared so the row's preview of the
// size and the converter always agree.

/** Settings → Images → Vector size. "2x" scales the drawing's own size; "1024" sets the width in pixels. */
export const VECTOR_SIZES = [
  { value: '1x', label: 'Original size' },
  { value: '2x', label: '2×' },
  { value: '3x', label: '3×' },
  { value: '4x', label: '4×' },
  { value: '512', label: '512 px wide' },
  { value: '1024', label: '1024 px wide' },
  { value: '2048', label: '2048 px wide' },
  { value: '4096', label: '4096 px wide' }
] as const

/** Longest edge allowed, so a huge drawing at 4× can't exhaust memory. */
export const MAX_RASTER_EDGE = 16384

/**
 * Pixel size for a drawing that is `width` × `height` at its own declared size.
 * `scale` is relative to that size (sharp renders SVG at 72 dpi, so density = 72 × scale).
 */
export function vectorOutputSize(width: number, height: number, setting: string): { width: number; height: number; scale: number } {
  const n = parseFloat(setting)
  let scale = setting.endsWith('x') ? n : n / width
  if (!Number.isFinite(scale) || scale <= 0) scale = 1
  scale = Math.min(scale, MAX_RASTER_EDGE / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}
