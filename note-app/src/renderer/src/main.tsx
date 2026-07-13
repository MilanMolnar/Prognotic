import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantProvider, BlockDragProvider, BlocksProvider, CalendarProvider, GoalsProvider, OnboardingProvider, PanelsProvider, PluginsProvider, SearchProvider, SettingsProvider } from './context'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <GoalsProvider>
        <PluginsProvider>
          <CalendarProvider>
            <BlocksProvider>
              <SearchProvider>
                <PanelsProvider>
                  <AssistantProvider>
                    <BlockDragProvider>
                      <OnboardingProvider>
                        <App />
                      </OnboardingProvider>
                    </BlockDragProvider>
                  </AssistantProvider>
                </PanelsProvider>
              </SearchProvider>
            </BlocksProvider>
          </CalendarProvider>
        </PluginsProvider>
      </GoalsProvider>
    </SettingsProvider>
  </StrictMode>
)
