import { describe, expect, it } from 'vitest';
import { loadAll } from '../loadAll';

const cfg = { catalog: 'c', schema: 's' };
const fake =
  (fail: string[] = []) =>
  async (name: string): Promise<unknown[]> => {
    if (fail.includes(name)) throw new Error(`boom ${name}`);
    switch (name) {
      case 'chokepoints_daily':
        return [
          {
            date: '2026-03-01',
            chokepoint: 'Strait of Hormuz',
            lat: '26.5',
            lon: '56.2',
            n_total: '5',
            n_tanker: '',
            pct_of_baseline_total: '12.5',
          },
        ];
      case 'ports_daily':
      case 'ports_daily_2':
      case 'ports_daily_3':
        return [
          {
            date: '2026-03-01',
            port: 'X',
            country: 'Y',
            lat: 1,
            lon: 2,
            portcalls_tanker_7d_avg: '2',
            portcalls_container_7d_avg: '0',
            portcalls_dry_bulk_7d_avg: '1',
            baseline_portcalls_tanker: '4',
            baseline_portcalls_container: '0',
            baseline_portcalls_dry_bulk: '',
          },
        ];
      case 'lane_status':
        return [
          {
            date: '2026-03-01',
            lane_id: 'L1',
            annual_volume: '1500',
            alternative_ports: '["A","B"]',
            alt_ports: '[{"port":"A","lat":1,"lon":2,"pct":50,"baseline":3}]',
            exit_lat: '',
            hormuz_pct: '10',
          },
        ];
      case 'conflict_events':
        return [{ event_date: '2026-02-28', event: 'e', source_url: 'u' }];
      case 'ais_visibility':
        return [{ sample_id: 's', region: 'gulf_hormuz', unique_vessels: '54', visibility_vs_control: '0.15' }];
      case 'ais_regions':
        return [{ region: 'gulf_hormuz', lat_min: '22', area_km2: '1000.5' }];
      case 'ais_h3_daily':
        return [{ region: 'gulf_hormuz', day: '2026-10-01', h3_res5_str: 'abc', unique_vessels: '2', positions: '4' }];
      case 'lane_recommendation':
        return [
          {
            date: '2026-03-01',
            lane_id: 'L1',
            action: 'shift',
            action_probabilities: '{"shift":"0.81","hold":0.03}',
            action_confidence: '0.76',
            tier: 'Review',
          },
        ];
      case 'freshness':
        return [
          { chokepoint_date: '2026-10-04', port_date: '2026-10-02', ais_sample_hour: '2026-10-13T20:00:00.000Z' },
        ];
    }
    return [];
  };

describe('loadAll', () => {
  it('loads everything, coerces numbers, parses JSON', async () => {
    const d = await loadAll(fake(), cfg);
    expect(d.errors).toEqual([]);
    expect(d.chokepoints[0].lat).toBe(26.5);
    expect(d.chokepoints[0].n_total).toBe(5);
    expect(d.chokepoints[0].n_tanker).toBeNull();
    expect(d.lanes[0].alternative_ports).toEqual(['A', 'B']);
    expect(d.lanes[0].alt_ports[0].baseline).toBe(3);
    expect(d.lanes[0].exit_lat).toBeNull();
    expect(d.lanes[0].annual_volume).toBe(1500);
    expect(d.ports).toHaveLength(3);
    expect(d.ports[0].baseline_portcalls_tanker).toBe(4);
    expect(d.ports[0].pct_of_baseline_portcalls_tanker).toBe(50);
    expect(d.ports[0].pct_of_baseline_portcalls_container).toBeNull();
    expect(d.ports[0].pct_of_baseline_portcalls_dry_bulk).toBeNull();
    expect(d.visibility[0].unique_vessels).toBe(54);
    expect(d.regions[0].area_km2).toBe(1000.5);
    expect(d.aisCells[0].positions).toBe(4);
    expect(d.recsAvailable).toBe(true);
    expect(d.recs[0].action_probabilities).toEqual({ shift: 0.81, hold: 0.03 });
    expect(d.freshness).toEqual({
      portwatch_chokepoints_max: '2026-10-04',
      portwatch_ports_max: '2026-10-02',
      ais_latest_sample: '2026-10-13T20:00:00.000Z',
    });
  });

  it('a failed query leaves its array empty and records one error', async () => {
    const d = await loadAll(fake(['ports_daily']), cfg);
    expect(d.ports).toHaveLength(2);
    expect(d.errors).toHaveLength(1);
    expect(d.errors[0]).toEqual({ query: 'ports_daily', message: 'boom ports_daily' });
    expect(d.chokepoints).toHaveLength(1);
    expect(d.lanes).toHaveLength(1);
  });

  it('optional recommendation failure is silent', async () => {
    const d = await loadAll(fake(['lane_recommendation']), cfg);
    expect(d.errors).toEqual([]);
    expect(d.recsAvailable).toBe(false);
    expect(d.recs).toEqual([]);
  });
});
