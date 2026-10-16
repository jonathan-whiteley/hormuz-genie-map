import { lazy, Suspense, useEffect, useState } from 'react';
import { TopBar, type Tab } from './shell/TopBar';
import { AppConfigContext, fetchAppConfig, type AppConfig } from './lib/appConfig';
import { DataProvider } from './data/DataContext';
import { GenieProvider } from './genie/GenieProvider';
import { ErrorBanner } from './shell/ErrorBanner';
import { ExplorePage } from './explore/ExplorePage';
import { StoryPage } from './story/StoryPage';
import { SceneStepper } from './story/SceneStepper';

// React Flow and html-to-image are only needed on the Architecture tab, so they load in their own chunk.
const ArchitecturePage = lazy(() => import('./architecture/ArchitecturePage'));

const status = { padding: 'var(--space-3)' };

export default function App() {
  const [tab, setTab] = useState<Tab>('story');
  const [scene, setScene] = useState(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    fetchAppConfig()
      .then(setConfig)
      .catch((e: unknown) => setConfigError(String(e)));
  }, []);

  return (
    <AppConfigContext.Provider value={config}>
      <DataProvider>
        <GenieProvider>
          <TopBar
            tab={tab}
            onTab={setTab}
            slot={tab === 'story' ? <SceneStepper index={scene} onChange={setScene} /> : undefined}
          />
          <ErrorBanner />
          {tab === 'architecture' ? (
            <Suspense
              fallback={
                <p role="status" style={status}>
                  Loading the architecture diagram
                </p>
              }
            >
              <ArchitecturePage />
            </Suspense>
          ) : config ? (
            <main>{tab === 'explore' ? <ExplorePage /> : <StoryPage index={scene} onIndex={setScene} />}</main>
          ) : (
            <main style={status}>
              {configError ? <p role="alert">Could not load app config: {configError}</p> : <p role="status">Loading</p>}
            </main>
          )}
        </GenieProvider>
      </DataProvider>
    </AppConfigContext.Provider>
  );
}
