import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantProvider, BlockDragProvider, BlocksProvider, CalendarProvider, GlossaryProvider, GoalsProvider, I18nProvider, OnboardingProvider, PanelsProvider, PluginsProvider, SearchProvider, SettingsProvider } from './context'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <I18nProvider>
        <GoalsProvider>
          <PluginsProvider>
            <CalendarProvider>
              <GlossaryProvider>
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
              </GlossaryProvider>
            </CalendarProvider>
          </PluginsProvider>
        </GoalsProvider>
      </I18nProvider>
    </SettingsProvider>
  </StrictMode>
)
