import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useAppConfig } from '../lib/appConfig';
import { emptyDataset, loadAll } from './loadAll';
import type { Dataset } from './types';

interface DataState {
  dataset: Dataset;
  loading: boolean;
}

const DataCtx = createContext<DataState>({ dataset: emptyDataset(), loading: true });
export const useData = () => useContext(DataCtx);

interface Slot {
  data: unknown[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * AppKit 0.76.1 exposes no client API for running a named query outside a hook, so each
 * query is run through useAnalyticsQuery (identical requests are de-duplicated by the
 * AppKit request store). Once all settle, loadAll assembles the Dataset exactly once,
 * using a runQuery that reads the settled hook results.
 */
function DataLoader({ catalog, schema, children }: { catalog: string; schema: string; children: ReactNode }) {
  const p = { catalog: sql.string(catalog), schema: sql.string(schema) };
  const slots: Record<string, Slot> = {
    chokepoints_daily: useAnalyticsQuery('chokepoints_daily', p),
    ports_daily: useAnalyticsQuery('ports_daily', p),
    ports_daily_2: useAnalyticsQuery('ports_daily_2', p),
    ports_daily_3: useAnalyticsQuery('ports_daily_3', p),
    lane_status: useAnalyticsQuery('lane_status', p),
    conflict_events: useAnalyticsQuery('conflict_events', p),
    ais_visibility: useAnalyticsQuery('ais_visibility', p),
    ais_regions: useAnalyticsQuery('ais_regions', p),
    ais_h3_daily: useAnalyticsQuery('ais_h3_daily', p),
    lane_recommendation: useAnalyticsQuery('lane_recommendation', p),
    freshness: useAnalyticsQuery('freshness', p),
  } as Record<string, Slot>;

  // A hook reports loading=false with data=null before its request starts, so require a result or an error.
  const settled = Object.values(slots).every((s) => !s.loading && (s.data !== null || !!s.error));
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    if (!settled || dataset) return;
    const runQuery = async (name: string): Promise<unknown[]> => {
      const s = slots[name];
      if (s.error) throw new Error(s.error);
      return s.data ?? [];
    };
    loadAll(runQuery, { catalog, schema }).then(setDataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const value = useMemo<DataState>(() => ({ dataset: dataset ?? emptyDataset(), loading: !dataset }), [dataset]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const config = useAppConfig();
  if (!config)
    return <DataCtx.Provider value={{ dataset: emptyDataset(), loading: true }}>{children}</DataCtx.Provider>;
  return (
    <DataLoader catalog={config.catalog} schema={config.schema}>
      {children}
    </DataLoader>
  );
}
