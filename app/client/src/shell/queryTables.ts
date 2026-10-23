/** Which table each startup query reads, so the error banner can name it (spec 7). */
export const QUERY_TABLES: Record<string, string> = {
  chokepoints_daily: 'gold_chokepoint_daily',
  ports_daily: 'gold_port_daily, Jan to Apr chunk',
  ports_daily_2: 'gold_port_daily, May to Aug chunk',
  ports_daily_3: 'gold_port_daily, Sep to Dec chunk',
  lane_status: 'gold_lane_status',
  conflict_events: 'ref_conflict_events',
  ais_visibility: 'gold_ais_visibility_index',
  ais_regions: 'ref_ais_regions',
  vessel_positions: 'silver_ais_positions',
  lane_recommendation: 'gold_lane_recommendation',
  freshness: 'gold_chokepoint_daily, gold_port_daily, gold_ais_visibility',
};

/** One banner line: the query, its table, the error and the grant the viewer needs. */
export function errorLine(query: string, message: string, where: string): string {
  const table = QUERY_TABLES[query];
  const name = table ? `${query} (${table})` : query;
  return `Could not load ${name}: ${message}. Grant USE CATALOG, USE SCHEMA and SELECT on ${where} to your user.`;
}
