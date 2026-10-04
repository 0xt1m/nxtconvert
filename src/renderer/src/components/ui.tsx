// The nxtconvert design system components (components/bundle.js), typed and wired to the real window.
import { useState, type ElementType, type ButtonHTMLAttributes, type CSSProperties, type DragEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { kindOf, type Kind, type Target } from '@shared/formats'
import type { Platform } from '@shared/types'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

// ---------- Icon ----------

type Part = string | [string, Record<string, number>]
const ICONS: Record<string, Part[]> = {
  image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }], ['circle', { cx: 9, cy: 9, r: 1.8 }], 'M21 15l-5-5L5 21'],
  video: [['rect', { x: 3, y: 5, width: 13, height: 14, rx: 2 }], 'M16 10l5-3v10l-5-3z'],
  audio: ['M9 18V5l11-2v13', ['circle', { cx: 6, cy: 18, r: 3 }], ['circle', { cx: 17, cy: 16, r: 3 }]],
  doc: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
  grid: [['rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.5 }], ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.5 }], ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.5 }], ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.5 }]],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  upload: ['M12 15V4', 'M7 9l5-5 5 5', 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  sliders: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', ['circle', { cx: 16, cy: 7, r: 2 }], ['circle', { cx: 10, cy: 17, r: 2 }]],
  chevron: ['M7 10l5 5 5-5'],
  alert: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 7.5v5.5', 'M12 16.5v.01'],
  retry: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  reveal: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  minus: ['M5 12h14'],
  square: [['rect', { x: 6, y: 6, width: 12, height: 12, rx: 1 }]]
}

export function Icon({ name, size = 18, strokeWidth = 1.75, label, className }: { name: string; size?: number; strokeWidth?: number; label?: string; className?: string }) {
  return (
    <svg className={cx('nc-icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      {(ICONS[name] ?? []).map((p, i) => {
        if (typeof p === 'string') return <path key={i} d={p} />
        const Tag = p[0] as ElementType, attrs = p[1]
        return <Tag key={i} {...attrs} />
      })}
    </svg>
  )
}

// ---------- Button ----------

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  const iconOnly = !children && icon
  return (
    <button type="button" {...rest}
      className={cx('nc-btn', `nc-btn-${variant}`, size !== 'md' && `nc-btn-${size}`, iconOnly && 'nc-btn-icon', className)}>
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}

// ---------- FormatBadge ----------

export function FormatBadge({ ext, kind, size, title }: { ext: string; kind?: Kind | 'any'; size?: 'md' | 'lg'; title?: string }) {
  const k = kind ?? kindOf(ext)
  return <span className={cx('nc-badge', `nc-k-${k}`, size === 'lg' && 'nc-badge-lg')} title={title}>{ext.replace('.', '').toUpperCase()}</span>
}

// ---------- Tabs ----------

export interface TabItem { id: string; label: string; icon?: string; count?: number }
const KIND_INK: Record<string, string> = { image: 'var(--kind-image)', video: 'var(--kind-video)', audio: 'var(--kind-audio)', doc: 'var(--kind-doc)' }

export function Tabs({ items, value, onChange, label = 'File type' }: { items: TabItem[]; value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <div className="nc-tabs" role="tablist" aria-label={label}>
      {items.map((it) => {
        const sel = it.id === value
        return (
          <button key={it.id} type="button" role="tab" aria-selected={sel} className="nc-tab"
            style={sel && KIND_INK[it.id] ? ({ '--tab-ink': KIND_INK[it.id] } as CSSProperties) : undefined}
            onClick={() => onChange(it.id)}>
            {it.icon && <Icon name={it.icon} size={15} />}
            {it.label}
            {it.count != null && <span className="nc-tab-count">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ---------- FormatPicker ----------

export function FormatPicker({ formats, value, onChange, label = 'Convert to' }: { formats: Target[]; value?: string | null; onChange: (ext: string) => void; label?: string }) {
  return (
    <div className="nc-picker" role="radiogroup" aria-label={label}>
      {formats.map((f) => (
        <button key={f.ext} type="button" role="radio" className="nc-chip" aria-checked={value === f.ext}
          disabled={!f.available} title={f.reason} onClick={() => onChange(f.ext)}>
          <b>{f.ext.toUpperCase()}</b>
          <span>{f.available ? f.note : f.reason}</span>
        </button>
      ))}
    </div>
  )
}

// ---------- DropZone ----------

const DROP_EXAMPLES = ['jpg', 'png', 'webp', 'avif', 'mp4', 'mov', 'mp3', 'flac', 'pdf', 'docx']

export function DropZone({ onFiles, onBrowse }: { onFiles: (files: File[]) => void; onBrowse: () => void }) {
  const [over, setOver] = useState(false)
  const drop = (e: DragEvent): void => {
    // preventDefault marks the drop as handled; the window-level listener still resets its drag state.
    e.preventDefault()
    setOver(false)
    onFiles(Array.from(e.dataTransfer.files))
  }
  return (
    <div className="nc-drop" data-active={over} tabIndex={0} role="button" aria-label="Add files to convert"
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={drop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBrowse() } }}>
      <div className="nc-drop-glyph"><Icon name={over ? 'plus' : 'upload'} size={26} /></div>
      <h2>{over ? 'Release to add' : 'Drop files to convert'}</h2>
      <p>Images, video, audio and documents. Everything stays on this computer.</p>
      <Button variant="secondary" icon="folder" onClick={(e) => { e.stopPropagation(); onBrowse() }}>Browse files</Button>
      <div className="nc-drop-kinds">{DROP_EXAMPLES.map((e) => <FormatBadge key={e} ext={e} />)}</div>
    </div>
  )
}

// ---------- ProgressBar ----------

export function ProgressBar({ value, label = 'Converting', hideValue }: { value: number; label?: string; hideValue?: boolean }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="nc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      <div className="nc-progress-track"><div className="nc-progress-fill" style={{ width: `${v}%` }} /></div>
      {!hideValue && <span className="nc-progress-num">{Math.round(v)}%</span>}
    </div>
  )
}

// ---------- Select ----------

export interface SelectOption { value: string | number; label: string; disabled?: boolean }

export function Select({ options, label, plain, className, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { options: SelectOption[]; label: string; plain?: boolean }) {
  return (
    <label className={cx('nc-select', plain && 'nc-select-plain', className)}>
      <select aria-label={label} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <Icon name="chevron" size={14} />
    </label>
  )
}

// ---------- Switch ----------

export function Switch({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx('nc-switch', className)}>
      <input type="checkbox" role="switch" {...rest} />
      {label}
    </label>
  )
}

// ---------- FileRow ----------

export type RowStatus = 'ready' | 'queued' | 'converting' | 'done' | 'error'

export interface FileRowProps {
  name: string
  from: string
  to?: string
  meta?: string
  targets: Target[]
  status: RowStatus
  progress?: number
  error?: string
  retryable?: boolean
  onTargetChange: (ext: string) => void
  onRemove: () => void
  onReveal: () => void
  onRetry: () => void
}

export function FileRow(p: FileRowProps) {
  let right: ReactNode
  if (p.status === 'converting') right = <ProgressBar value={p.progress ?? 0} label={`Converting ${p.name}`} />
  else if (p.status === 'queued') right = <span className="nc-row-status idle">Waiting</span>
  else if (p.status === 'done') right = <span className="nc-row-status ok"><Icon name="check" size={16} strokeWidth={2.25} />Done</span>
  else if (p.status === 'error') right = <span className="nc-row-status err" title={p.error}><Icon name="alert" size={16} />{p.error ?? 'Failed'}</span>
  else right = <span className="nc-row-status idle">Ready</span>

  const tail = p.status === 'done'
    ? <Button variant="ghost" icon="reveal" aria-label="Show in folder" title="Show in folder" onClick={p.onReveal} />
    : p.status === 'error' && p.retryable
      ? <Button variant="ghost" icon="retry" aria-label="Try again" title="Try again" onClick={p.onRetry} />
      : <Button variant="ghost" icon="x" aria-label={`Remove ${p.name}`} title="Remove" onClick={p.onRemove}
          disabled={p.status === 'converting' || p.status === 'queued'} />

  const options: SelectOption[] = p.targets.map((t) => ({
    value: t.ext,
    label: t.available ? t.ext.toUpperCase() : `${t.ext.toUpperCase()} · ${t.reason}`,
    disabled: !t.available
  }))

  return (
    <div className="nc-row" data-status={p.status}>
      <FormatBadge ext={p.from} size="lg" />
      <div className="nc-row-name"><b title={p.name}>{p.name}</b><small>{p.meta}</small></div>
      <div className="nc-row-to">
        <Icon name="arrow" size={16} />
        {options.length
          ? <Select value={p.to ?? ''} options={options} label={`Convert ${p.name} to`}
              disabled={p.status !== 'ready' && p.status !== 'error'}
              onChange={(e) => p.onTargetChange(e.target.value)} />
          : <span className="nc-row-status idle">None</span>}
      </div>
      {right}
      {tail}
    </div>
  )
}

// ---------- TitleBar ----------

export function TitleBar({ platform, actions }: { platform: Platform; actions?: ReactNode }) {
  const small = platform === 'linux'
  return (
    // The bar is an OS drag region, so double-click to maximise comes from the OS on every platform.
    <div className={cx('nc-titlebar', `nc-titlebar-${platform}`)}>
      {platform === 'mac' && <div className="nc-lights-space" aria-hidden />}
      <div className="nc-wordmark"><LogoMark /><div><span>nxt</span>convert</div></div>
      <div className="nc-titlebar-actions">{actions}</div>
      {platform !== 'mac' && (
        <div className="nc-winctl">
          <button type="button" aria-label="Minimise" onClick={() => window.nxt.windowControl('minimize')}><Icon name="minus" size={small ? 12 : 14} /></button>
          <button type="button" aria-label="Maximise" onClick={() => window.nxt.windowControl('maximize')}><Icon name="square" size={small ? 12 : 13} /></button>
          <button type="button" aria-label="Close" className="close" onClick={() => window.nxt.windowControl('close')}><Icon name="x" size={small ? 12 : 14} /></button>
        </div>
      )}
    </div>
  )
}

// ---------- Logo ----------

/** The nxtconvert mark (logo/nxtconvert-mark-ink.svg), in the current text colour. */
export function LogoMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="nc-logo" width={(size * 296) / 264} height={size} viewBox="112 112 296 264" aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d="M136 112h160a24 24 0 0 1 24 24v160a24 24 0 0 1-24 24H136a24 24 0 0 1-24-24V136a24 24 0 0 1 24-24z M316 192a92 92 0 1 1 0 184a92 92 0 1 1 0-184z" />
    </svg>
  )
}

// ---------- Window ----------

export function Window({ platform, toolbar, footer, actions, children, className }: { platform: Platform; toolbar?: ReactNode; footer?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('nc', 'nc-window', 'nc-window-native', className)}>
      <TitleBar platform={platform} actions={actions} />
      {toolbar && <div className="nc-window-toolbar">{toolbar}</div>}
      <div className="nc-window-body">{children}</div>
      {footer && <div className="nc-window-footer">{footer}</div>}
    </div>
  )
}
