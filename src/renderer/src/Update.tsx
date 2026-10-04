import type { UpdateState } from '@shared/types'
import { Button, ProgressBar } from './components/ui'

/** Offers a new version, downloads it, then asks to restart. Shown under the title bar. */
export function UpdatePanel({ update: u, busy, onClose }: { update: UpdateState; busy: boolean; onClose: () => void }) {
  let title: string, body: React.ReactNode, action: React.ReactNode = null

  if (u.state === 'available') {
    title = 'Update available'
    body = (
      <>
        <p>nxtconvert {u.version} is out. You have {u.current}.</p>
        {u.notes && <pre className="app-update-notes">{u.notes}</pre>}
      </>
    )
    action = u.canInstall === false
      ? <Button icon="reveal" onClick={() => void window.nxt.update.openPage()}>Download</Button>
      : <Button icon="download" onClick={() => void window.nxt.update.download()}>Update</Button>
  } else if (u.state === 'downloading') {
    title = `Downloading ${u.version ?? 'update'}`
    body = <ProgressBar value={u.percent ?? 0} label="Downloading update" />
  } else if (u.state === 'ready') {
    title = 'Ready to install'
    body = <p>Restart to finish updating to {u.version}. If you wait, it installs the next time you quit.</p>
    action = (
      <Button icon="retry" disabled={busy} title={busy ? 'Finish converting first' : undefined}
        onClick={() => void window.nxt.update.install()}>
        {busy ? 'Converting…' : 'Restart now'}
      </Button>
    )
  } else if (u.state === 'error') {
    title = 'Update failed'
    body = <p>Download {u.version ?? 'the new version'} from GitHub instead.</p>
    action = <Button icon="reveal" onClick={() => void window.nxt.update.openPage()}>Open download page</Button>
  } else {
    return null
  }

  return (
    <div className="app-pop app-update" role="dialog" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} />
      </header>
      <div className="app-update-body">{body}</div>
      <footer>
        <Button variant="ghost" onClick={onClose}>Later</Button>
        {action}
      </footer>
    </div>
  )
}
