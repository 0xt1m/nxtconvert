import type { Caps } from '@shared/formats'
import type { Settings } from '@shared/types'
import { Button, Icon, Select, Switch } from './components/ui'

const QUALITY = [
  { value: 100, label: 'Maximum' }, { value: 92, label: 'High' }, { value: 85, label: 'Balanced' },
  { value: 75, label: 'Smaller' }, { value: 60, label: 'Smallest' }
]
const RESOLUTION = [
  { value: 0, label: 'Original' }, { value: 2160, label: '2160p (4K)' }, { value: 1440, label: '1440p' },
  { value: 1080, label: '1080p' }, { value: 720, label: '720p' }, { value: 480, label: '480p' }
]
const VIDEO_QUALITY = [{ value: 'high', label: 'High' }, { value: 'balanced', label: 'Balanced' }, { value: 'small', label: 'Small file' }]
const BITRATE = [128, 192, 256, 320].map((v) => ({ value: v, label: `${v} kbit/s` }))

/** Keeps an unusual saved value selectable instead of silently showing another one. */
function withValue<T extends string | number>(opts: { value: T; label: string }[], v: T) {
  return opts.some((o) => o.value === v) ? opts : [...opts, { value: v, label: String(v) }]
}

export function SettingsPanel({ settings: s, caps, onChange, onClose }: {
  settings: Settings; caps: Caps; onChange: (patch: Partial<Settings>) => void; onClose: () => void
}) {
  const tools = [
    { name: 'Images, video and audio', ok: true, adds: 'Built in' },
    ...(caps.platform === 'darwin' ? [{ name: 'HEIC export', ok: caps.sips, adds: caps.sips ? 'macOS' : 'Not found' }] : []),
    { name: 'LibreOffice', ok: caps.soffice, adds: 'DOC, ODT, RTF, best DOCX' },
    { name: 'Pandoc', ok: caps.pandoc, adds: 'EPUB and more' },
    { name: 'Poppler', ok: caps.poppler, adds: 'PDF pages and text' }
  ]
  return (
    <div className="app-pop app-settings" role="dialog" aria-label="Settings">
      <header>
        <h2>Settings</h2>
        <Button variant="ghost" size="sm" icon="x" aria-label="Close settings" onClick={onClose} />
      </header>

      <section>
        <h3>Images</h3>
        <div className="app-field">
          <span>Quality</span>
          <Select plain label="Image quality" value={s.imageQuality} options={withValue(QUALITY, s.imageQuality)}
            onChange={(e) => onChange({ imageQuality: Number(e.target.value) })} />
        </div>
      </section>

      <section>
        <h3>Video</h3>
        <div className="app-field">
          <span>Resolution</span>
          <Select plain label="Video resolution" value={s.videoMaxHeight} options={withValue(RESOLUTION, s.videoMaxHeight)}
            onChange={(e) => onChange({ videoMaxHeight: Number(e.target.value) })} />
        </div>
        <div className="app-field">
          <span>Quality</span>
          <Select plain label="Video quality" value={s.videoQuality} options={VIDEO_QUALITY}
            onChange={(e) => onChange({ videoQuality: e.target.value as Settings['videoQuality'] })} />
        </div>
      </section>

      <section>
        <h3>Audio</h3>
        <div className="app-field">
          <span>Bitrate</span>
          <Select plain label="Audio bitrate" value={s.audioBitrate} options={withValue(BITRATE, s.audioBitrate)}
            onChange={(e) => onChange({ audioBitrate: Number(e.target.value) })} />
        </div>
      </section>

      <section>
        <h3>Files</h3>
        <Switch label="Strip metadata" checked={s.stripMetadata} onChange={(e) => onChange({ stripMetadata: e.target.checked })} />
        <Switch label="Open folder when done" checked={s.openFolderWhenDone} onChange={(e) => onChange({ openFolderWhenDone: e.target.checked })} />
      </section>

      <section>
        <h3>Converters on this computer</h3>
        <ul className="app-tools">
          {tools.map((t) => (
            <li key={t.name}>
              <span className={t.ok ? 'ok' : undefined}><Icon name={t.ok ? 'check' : 'minus'} size={14} strokeWidth={2.25} /></span>
              {t.name}
              <small>{t.ok ? t.adds : 'Not installed'}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
