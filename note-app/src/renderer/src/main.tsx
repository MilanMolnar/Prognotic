import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantProvider, BlockDragProvider, BlocksProvider, GoalsProvider, PanelsProvider, PluginsProvider, SearchProvider, SettingsProvider } from './context'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <GoalsProvider>
        <PluginsProvider>
          <BlocksProvider>
            <SearchProvider>
              <PanelsProvider>
                <AssistantProvider>
                  <BlockDragProvider>
                    <App />
                  </BlockDragProvider>
                </AssistantProvider>
              </PanelsProvider>
            </SearchProvider>
          </BlocksProvider>
        </PluginsProvider>
      </GoalsProvider>
    </SettingsProvider>
  </StrictMode>
)
