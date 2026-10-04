import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/tokens.css'
import './styles/components.css'
import './styles/app.css'
import { App } from './App'

window.nxt.environment().then((env) => {
  document.documentElement.dataset.platform = env.platform
  createRoot(document.getElementById('root')!).render(<App env={env} />)
})
