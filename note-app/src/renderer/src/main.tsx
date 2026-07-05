import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BlocksProvider, GoalsProvider, PanelsProvider, SearchProvider, SettingsProvider } from './context'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <GoalsProvider>
        <BlocksProvider>
          <SearchProvider>
            <PanelsProvider>
              <App />
            </PanelsProvider>
          </SearchProvider>
        </BlocksProvider>
      </GoalsProvider>
    </SettingsProvider>
  </StrictMode>
)
