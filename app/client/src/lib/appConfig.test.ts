import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchAppConfig, genieStatus, type AppConfig } from './appConfig';

afterEach(() => vi.unstubAllGlobals());

describe('fetchAppConfig', () => {
  test('returns the JSON body from /api/app-config', async () => {
    const body = { catalog: 'c', schema: 's', genieSpaceTitle: 't', genieEnabled: true };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAppConfig()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('/api/app-config');
  });

  test('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchAppConfig()).rejects.toThrow('app-config 500');
  });
});

describe('genieStatus', () => {
  const cfg = (o: Partial<AppConfig>): AppConfig => ({ catalog: 'c', schema: 's', genieSpaceTitle: 't', genieEnabled: true, ...o });
  test('loading until the config arrives', () => expect(genieStatus(null)).toBe('loading'));
  test('on with a configured space', () => expect(genieStatus(cfg({}))).toBe('on'));
  test('off when the server reports no space', () => expect(genieStatus(cfg({ genieEnabled: false }))).toBe('off'));
  test('an older server without the flag counts as on', () => {
    const { genieEnabled: _drop, ...old } = cfg({});
    expect(genieStatus(old as AppConfig)).toBe('on');
  });
});
