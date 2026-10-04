import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { NxtApi, ProgressEvent, UpdateState } from '@shared/types'

const api: NxtApi = {
  environment: () => ipcRenderer.invoke('environment'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  probe: (paths) => ipcRenderer.invoke('probe', paths),
  convert: (req) => ipcRenderer.invoke('convert', req),
  cancel: (id) => ipcRenderer.invoke('cancel', id),
  onProgress: (cb) => {
    const fn = (_e: unknown, ev: ProgressEvent): void => cb(ev)
    ipcRenderer.on('progress', fn)
    return () => { ipcRenderer.removeListener('progress', fn) }
  },
  onCommand: (cb) => {
    const fn = (_e: unknown, cmd: string): void => cb(cmd)
    ipcRenderer.on('command', fn)
    return () => { ipcRenderer.removeListener('command', fn) }
  },
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  windowControl: (action) => ipcRenderer.send('window', action),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    openPage: () => ipcRenderer.invoke('update:open-page'),
    onChange: (cb) => {
      const fn = (_e: unknown, s: UpdateState): void => cb(s)
      ipcRenderer.on('update', fn)
      return () => { ipcRenderer.removeListener('update', fn) }
    }
  }
}

contextBridge.exposeInMainWorld('nxt', api)
