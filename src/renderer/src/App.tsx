import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultTarget, extOf, FORMATS, kindOf, targetsFor, type Kind, type Target } from '@shared/formats'
import type { Environment, Settings as SettingsT, UpdateState } from '@shared/types'
import { Button, DropZone, FileRow, FormatPicker, Icon, Switch, Tabs, Window, type RowStatus, type TabItem } from './components/ui'
import { SettingsPanel } from './Settings'
import { UpdatePanel } from './Update'
import { vectorOutputSize } from '@shared/vector'

interface Row {
  id: string
  path: string
  name: string
  from: string
  meta: string
  /** An SVG's own size, used to show the size it will be converted at. */
  vector?: { width: number; height: number }
  to?: string
  targets: Target[]
  status: RowStatus
  progress: number
  error?: string
  retryable: boolean
  output?: string
}

const KINDS: TabItem[] = [
  { id: 'all', label: 'All', icon: 'grid' }, { id: 'image', label: 'Images', icon: 'image' },
  { id: 'video', label: 'Video', icon: 'video' }, { id: 'audio', label: 'Audio', icon: 'audio' },
  { id: 'doc', label: 'Documents', icon: 'doc' }
]

/** Files converted at once: enough to overlap small jobs without starving a video encode. */
const PARALLEL = 2

let nextId = 0
const newId = (): string => `f${++nextId}`

const inTab = (r: Row, tab: string): boolean => tab === 'all' || kindOf(r.from) === tab
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function App({ env }: { env: Environment }) {
  const { platform, caps } = env
  const [settings, setSettings] = useState<SettingsT>(env.settings)
  const [rows, setRows] = useState<Row[]>([])
  const [tab, setTab] = useState('all')
  const [dragging, setDragging] = useState(false)
  const [popover, setPopover] = useState<'settings' | 'setall' | 'update' | null>(null)
  const [appUpdate, setAppUpdate] = useState<UpdateState>({ state: 'idle' })
  const [batch, setBatch] = useState<{ total: number; finished: number } | null>(null)
  const started = useRef(new Set<string>())
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const update = useCallback((id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), [])

  const saveSettings = useCallback(async (patch: Partial<SettingsT>) => {
    setSettings((s) => ({ ...s, ...patch }))
    setSettings(await window.nxt.saveSettings(patch))
  }, [])

  // ---------- Adding files ----------

  const addPaths = useCallback(async (paths: string[]) => {
    const known = new Set(rowsRef.current.filter((r) => r.status !== 'done').map((r) => r.path))
    const fresh = [...new Set(paths)].filter((p) => p && !known.has(p))
    if (!fresh.length) return
    const infos = await window.nxt.probe(fresh)
    setRows((rs) => [...rs, ...infos.map((info): Row => {
      const from = extOf(info.path)
      const supported = kindOf(from) !== 'any'
      return {
        id: newId(), path: info.path, name: info.name, from: from || '?', meta: info.meta, vector: info.vector,
        targets: targetsFor(from, caps),
        to: defaultTarget(from, caps, settings.preferredTargets),
        status: supported ? 'ready' : 'error', progress: 0,
        error: supported ? undefined : 'Unsupported format', retryable: false
      }
    })])
  }, [caps, settings.preferredTargets])

  const addFiles = useCallback((files: File[]) => {
    void addPaths(files.map((f) => window.nxt.pathForFile(f)))
  }, [addPaths])

  const browse = useCallback(async () => { void addPaths(await window.nxt.pickFiles()) }, [addPaths])

  // The whole window accepts drops once the queue is showing.
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent): void => { if (e.dataTransfer?.types.includes('Files')) { depth++; setDragging(true) } }
    const leave = (): void => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const over = (e: DragEvent): void => { e.preventDefault() }
    const drop = (e: DragEvent): void => {
      depth = 0
      setDragging(false)
      // The empty-state drop zone handles its own drops and marks them with preventDefault.
      if (!e.defaultPrevented && e.dataTransfer?.files.length) addFiles(Array.from(e.dataTransfer.files))
      e.preventDefault()
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [addFiles])

  // ---------- Converting ----------

  useEffect(() => window.nxt.onProgress(({ id, progress }) => update(id, { progress })), [update])

  const runRow = useCallback(async (row: Row) => {
    update(row.id, { status: 'converting', progress: 0, error: undefined })
    const res = await window.nxt.convert({ id: row.id, path: row.path, to: row.to! })
    started.current.delete(row.id)
    if (res.ok) update(row.id, { status: 'done', progress: 100, output: res.output })
    else if (res.cancelled) update(row.id, { status: 'ready', progress: 0 })
    else update(row.id, { status: 'error', error: res.error, retryable: true })
    setBatch((b) => (b ? { ...b, finished: b.finished + 1 } : b))
  }, [update])

  // Start queued rows, at most PARALLEL at a time, in list order.
  useEffect(() => {
    let free = PARALLEL - started.current.size
    for (const r of rows) {
      if (free <= 0) break
      if (r.status === 'queued' && !started.current.has(r.id)) {
        started.current.add(r.id)
        free--
        void runRow(r)
      }
    }
  }, [rows, runRow])

  const busy = rows.some((r) => r.status === 'queued' || r.status === 'converting')
  const convertible = rows.filter((r) => r.status === 'ready' && r.to && r.targets.find((t) => t.ext === r.to)?.available)

  // When a batch ends, optionally open the output folder.
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      if (settings.openFolderWhenDone && rows.some((r) => r.status === 'done')) void window.nxt.openFolder(settings.outputDir)
      setBatch(null)
    }
    wasBusy.current = busy
  }, [busy, rows, settings.openFolderWhenDone, settings.outputDir])

  const startAll = useCallback(() => {
    const ids = new Set(convertible.map((r) => r.id))
    if (!ids.size) return
    setBatch((b) => ({ total: (b?.total ?? 0) + ids.size, finished: b?.finished ?? 0 }))
    setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, status: 'queued', progress: 0 } : r)))
  }, [convertible])

  const retry = useCallback((r: Row) => {
    setBatch((b) => ({ total: (b?.total ?? 0) + 1, finished: b?.finished ?? 0 }))
    update(r.id, { status: 'queued', progress: 0, error: undefined })
  }, [update])

  const stop = useCallback(() => {
    for (const r of rowsRef.current) if (r.status === 'converting') void window.nxt.cancel(r.id)
    setRows((rs) => rs.map((r) => (r.status === 'queued' ? { ...r, status: 'ready' } : r)))
  }, [])

  const setTarget = useCallback((r: Row, ext: string) => {
    update(r.id, { to: ext, status: 'ready', error: undefined })
    void saveSettings({ preferredTargets: { ...settings.preferredTargets, [r.from]: ext } })
  }, [update, saveSettings, settings.preferredTargets])

  const clear = useCallback(() => {
    setRows((rs) => rs.filter((r) => r.status === 'converting' || r.status === 'queued'))
    setTab('all')
  }, [])

  const changeFolder = useCallback(async () => {
    const dir = await window.nxt.pickFolder()
    if (dir) void saveSettings({ outputDir: dir })
  }, [saveSettings])

  // ---------- Updates ----------

  useEffect(() => {
    void window.nxt.update.state().then(setAppUpdate)
    const off = window.nxt.update.onChange((u) => {
      setAppUpdate(u)
      // Offer a new version once, as soon as it's found; afterwards it waits behind the title bar button.
      if (u.state === 'available') setPopover((p) => p ?? 'update')
    })
    // Offline at launch: check as soon as the connection is back.
    const online = (): void => { void window.nxt.update.check() }
    window.addEventListener('online', online)
    return () => { off(); window.removeEventListener('online', online) }
  }, [])

  // ---------- Menu commands and keys ----------

  useEffect(() => window.nxt.onCommand((cmd) => {
    if (cmd === 'add-files') void browse()
    else if (cmd === 'convert') startAll()
    else if (cmd === 'settings') setPopover((p) => (p === 'settings' ? null : 'settings'))
  }), [browse, startAll])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPopover(null) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // ---------- "Set all to" for one category ----------

  const tabKind = tab === 'all' ? null : (tab as Kind)
  const settable = rows.filter((r) => inTab(r, tab) && (r.status === 'ready' || r.status === 'error') && r.targets.length)
  const setAllFormats = useMemo<Target[]>(() => {
    if (!tabKind) return []
    return FORMATS[tabKind].map((f) => {
      const reachable = settable.some((r) => r.targets.find((t) => t.ext === f.ext)?.available)
      return { ...f, available: reachable, reason: reachable ? undefined : 'Not available' }
    })
  }, [tabKind, settable])
  const setAllValue = settable.length && settable.every((r) => r.to === settable[0].to) ? settable[0].to : null

  const setAll = (ext: string): void => {
    const ids = new Set(settable.filter((r) => r.targets.find((t) => t.ext === ext)?.available).map((r) => r.id))
    setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, to: ext, status: 'ready', error: undefined } : r)))
    setPopover(null)
  }

  // ---------- Render ----------

  /** SVG rows also show the pixel size they'll be converted at (Settings → Vector size). */
  const metaFor = (r: Row): string => {
    if (!r.vector || r.status === 'done') return r.meta
    const out = vectorOutputSize(r.vector.width, r.vector.height, settings.vectorSize)
    const size = r.to === 'ico' ? 'up to 256 × 256' : `${out.width} × ${out.height}`
    return `${r.meta} → ${size}`
  }

  const titleActions = (<>
    {appUpdate.state !== 'idle' && popover !== 'update' && (
      <Button variant="ghost" size="sm" icon="download" onClick={() => setPopover('update')}>
        {appUpdate.state === 'ready' ? 'Restart to update' : 'Update'}
      </Button>
    )}
    <Button variant="ghost" icon="sliders" aria-label="Settings" title="Settings" aria-expanded={popover === 'settings'}
      onClick={() => setPopover((p) => (p === 'settings' ? null : 'settings'))} />
  </>)

  const savePath = (
    <div className="nc-savepath">
      <Icon name="folder" size={16} />
      <span>Save to</span>
      <b title={settings.outputDir}>{settings.outputDir}</b>
      <Button variant="ghost" size="sm" onClick={changeFolder}>Change</Button>
    </div>
  )

  const popovers = popover && (
    <>
      <div className="app-scrim" onClick={() => setPopover(null)} />
      {popover === 'update' && <UpdatePanel update={appUpdate} busy={busy} onClose={() => setPopover(null)} />}
      {popover === 'settings' && <SettingsPanel settings={settings} caps={caps} onChange={saveSettings} onClose={() => setPopover(null)} />}
      {popover === 'setall' && tabKind && (
        <div className="app-pop app-setall" role="dialog" aria-label="Set all to" style={{ top: 'calc(var(--titlebar-h) + 52px)', right: 16 }}>
          <h2>Set all {KINDS.find((k) => k.id === tab)?.label.toLowerCase()} to</h2>
          <FormatPicker formats={setAllFormats} value={setAllValue} onChange={setAll} />
        </div>
      )}
    </>
  )

  if (!rows.length) {
    return (
      <Window platform={platform} actions={titleActions}
        footer={<>{savePath}<div className="nc-spacer" /><Button variant="primary" disabled>Convert</Button></>}>
        <DropZone onFiles={addFiles} onBrowse={browse} />
        {popovers}
      </Window>
    )
  }

  const tabs = KINDS.map((k) => ({ ...k, count: rows.filter((r) => inTab(r, k.id)).length }))
  const shown = rows.filter((r) => inTab(r, tab))
  const n = convertible.length

  return (
    <Window platform={platform} actions={titleActions} className={dragging ? 'app-dragging' : undefined}
      toolbar={<>
        <Tabs items={tabs} value={tab} onChange={setTab} />
        <div className="nc-spacer" />
        {tabKind && settable.length > 0 && (
          <Button variant="ghost" icon="chevron" aria-expanded={popover === 'setall'} onClick={() => setPopover('setall')}>Set all to</Button>
        )}
        <Button variant="ghost" onClick={clear} disabled={rows.every((r) => r.status === 'converting' || r.status === 'queued')}>Clear</Button>
        <Button icon="plus" onClick={browse}>Add files</Button>
      </>}
      footer={<>
        {savePath}
        <div className="nc-spacer" />
        {busy && batch && <span className="app-batch" aria-live="polite">{Math.min(batch.finished + 1, batch.total)} of {batch.total}</span>}
        {busy && <Button variant="secondary" onClick={stop}>Stop</Button>}
        <Switch checked={settings.keepOriginals} onChange={(e) => void saveSettings({ keepOriginals: e.target.checked })} label="Keep originals" />
        <Button variant="primary" icon="arrow" disabled={!n} onClick={startAll}>{n ? `Convert ${plural(n, 'file')}` : 'Convert'}</Button>
      </>}>
      {shown.length
        ? shown.map((r) => (
          <FileRow key={r.id} name={r.name} from={r.from} to={r.to} meta={metaFor(r)} targets={r.targets}
            status={r.status} progress={r.progress} error={r.error} retryable={r.retryable}
            onTargetChange={(ext) => setTarget(r, ext)}
            onRemove={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
            onReveal={() => r.output && void window.nxt.reveal(r.output)}
            onRetry={() => retry(r)} />
        ))
        : <div className="app-list-empty">No {KINDS.find((k) => k.id === tab)?.label.toLowerCase()} in the queue</div>}
      {popovers}
    </Window>
  )
}
