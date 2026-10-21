import { useEffect, useState } from 'react';
import { ChatPanel } from './chat/ChatPanel';
import { ChatProvider } from './chat/ChatProvider';
import { DataProvider } from './data/DataContext';
import { AppConfigContext, fetchAppConfig, type AppConfig } from './lib/appConfig';
import { MapScreen } from './map/MapScreen';
import { useMapState } from './map/useMapState';
import { ErrorBanner } from './shell/ErrorBanner';
import { HowItWorks } from './shell/HowItWorks';
import { TopBar } from './shell/TopBar';

function Screen() {
  const m = useMapState();
  const [how, setHow] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100vh' }}>
      {/* Rows are pinned, so a null ErrorBanner cannot pull the map and chat into an auto row. */}
      <div style={{ gridRow: 1 }}>
        <TopBar tourOn={!!m.tour} onTour={m.tour ? m.exitTour : m.beginTour} onHow={() => setHow(true)} />
      </div>
      <div style={{ gridRow: 2 }}>
        <ErrorBanner />
      </div>
      <div style={{ gridRow: 3, display: 'grid', gridTemplateColumns: '1fr 400px', minHeight: 0 }}>
        <MapScreen m={m} />
        <ChatPanel />
      </div>
      <HowItWorks open={how} onClose={() => setHow(false)} />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    fetchAppConfig()
      .then(setConfig)
      .catch((e: unknown) => setConfigError(String(e)));
  }, []);

  if (configError) return <p role="alert" style={{ padding: 'var(--space-3)' }}>Could not load app config: {configError}</p>;
  return (
    <AppConfigContext.Provider value={config}>
      <DataProvider>
        <ChatProvider>
          <Screen />
        </ChatProvider>
      </DataProvider>
    </AppConfigContext.Provider>
  );
}
