import { createContext, useContext } from 'react';

export interface AppConfig {
  catalog: string;
  schema: string;
  genieSpaceTitle: string;
  /** False until the app is deployed with a real genie_space_id; the Genie panel then explains how to set it. */
  genieEnabled: boolean;
}

export const AppConfigContext = createContext<AppConfig | null>(null);
export const useAppConfig = () => useContext(AppConfigContext);

export async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch('/api/app-config');
  if (!res.ok) throw new Error(`app-config ${res.status}`);
  return (await res.json()) as AppConfig;
}

/** 'loading' before the config arrives, then 'on' or 'off'. An older server without the flag counts as on. */
export function genieStatus(config: AppConfig | null): 'loading' | 'on' | 'off' {
  if (!config) return 'loading';
  return config.genieEnabled === false ? 'off' : 'on';
}

export const GENIE_OFF_MESSAGE =
  'Genie is not configured for this app. Build the space with genie/build_space.py, then redeploy the bundle with --var="genie_space_id=<genie-space-id>".';
