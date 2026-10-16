"""Genie space content for the Hormuz Chokepoint Monitor (catalog/schema templated)."""
import re

TABLES = [
    "gold_chokepoint_daily",
    "gold_port_daily",
    "ref_conflict_events",
    "ref_portwatch_chokepoints",
    "ref_portwatch_ports",
    "ref_demo_lanes",
    "gold_lane_status",
    "gold_lane_recommendation",
    "gold_ais_visibility_index",
    "ref_ais_regions",
]

INSTRUCTIONS = """You answer questions about shipping through the Strait of Hormuz and nearby chokepoints and ports during the 2026 Iran war.
- All counts come from IMF PortWatch and include only vessels broadcasting AIS. Many tankers transit with AIS off ("dark"), so low counts mean low visible traffic, not necessarily zero traffic. Say so when reporting Hormuz counts after 2026-02-28.
- The pre-war baseline is the mean of 2026-01-01 to 2026-02-27. Use pct_of_baseline_* columns for "compared to before the war".
- Chokepoint names: use the chokepoint column exactly, e.g. 'Strait of Hormuz', 'Bab el-Mandeb Strait', 'Suez Canal', 'Cape of Good Hope'.
- Bypass ports outside the strait: Fujairah and Khor Fakkan (UAE, Gulf of Oman) and Yanbu (Saudi Arabia, Red Sea; stored as 'Yanbu (Yanbu city)' and 'Yanbu (King Fahd Port)', match with port LIKE 'Yanbu%'). Ports inside the Gulf include Ras Tanura, Jebel Ali, Ras Laffan.
- Prefer 7-day averages (n_total_7d_avg, n_tanker_7d_avg, portcalls_tanker_7d_avg, export_tanker_7d_avg) for trends; daily values are noisy.
- export_tanker and import_tanker are estimated metric tons, not barrels.
- For map answers return lat, lon, and h3_res7 columns alongside the metric.
- Use ref_conflict_events to annotate or segment by war phase (event_date).
- Data lags real time by a few days; mention the latest date in the result.
- ref_demo_lanes and gold_lane_status describe a fictional company's example lanes (synthetic). Say so when answering. volume_at_risk is an assumption.
- For questions about our lanes, use gold_lane_status at the latest date unless a date is given, and return lane_id, lane, status, primary_pct, alternative_pct, volume_at_risk, volume_unit. Do not filter to status = 'Disrupted': show all lanes with their status so lanes that 'Shifted to alternative' stay visible.
- For questions about places, return lat and lon (ports, chokepoints) or h3_res5 (AIS cells) so the app can map the answer.
- gold_ais_visibility_index: visibility_vs_control compares a Gulf target region with the median busy control lane (1.0 = equally visible). It measures AIS visibility, not traffic.
- Percent-of-baseline values are unreliable when the pre-war baseline is under 1 call per day. Do not headline them; report the 7-day average calls and the baseline alongside, and say the baseline is small (low_baseline).
- gold_lane_recommendation holds ai_decide recommendations. Always report tier, action, and action_confidence together; tiers use untuned demo thresholds; never present a recommendation as certain."""

SAMPLE_QUESTIONS = [
    "Which of our lanes are disrupted today, and how much volume is at risk?",
    "Which alternative ports are running above their pre-war baseline?",
    "When did our container lane shift away from Jebel Ali?",
    "Which lanes have no alternative route?",
    "How do visible tanker transits through Hormuz compare with the pre-war baseline by month?",
    "How much of the Gulf can we see on AIS compared with normal shipping lanes?",
]

EXAMPLE_SQL = [
    (
        "Monthly Hormuz transits vs. pre-war baseline",
        """SELECT date_trunc('month', date) AS month,
       ROUND(AVG(n_total), 1) AS avg_daily_transits,
       ROUND(AVG(n_tanker), 1) AS avg_daily_tanker_transits,
       ROUND(AVG(pct_of_baseline_total), 1) AS pct_of_prewar_baseline
FROM `{catalog}`.`{schema}`.gold_chokepoint_daily
WHERE chokepoint = 'Strait of Hormuz' AND date >= '2026-01-01'
GROUP BY 1 ORDER BY 1""",
    ),
    (
        "Bypass port tanker activity, weekly",
        """SELECT date_trunc('week', date) AS week, port,
       SUM(portcalls_tanker) AS tanker_port_calls,
       ROUND(SUM(export_tanker)) AS tanker_export_tonnes,
       ANY_VALUE(lat) AS lat, ANY_VALUE(lon) AS lon, ANY_VALUE(h3_res7) AS h3_res7
FROM `{catalog}`.`{schema}`.gold_port_daily
WHERE (port IN ('Fujairah', 'Khor Fakkan') OR port LIKE 'Yanbu%') AND date >= '2026-02-28'
GROUP BY 1, 2 ORDER BY 1, 2""",
    ),
    (
        "Chokepoint comparison, 7-day average",
        """SELECT date, chokepoint, n_total_7d_avg, pct_of_baseline_total
FROM `{catalog}`.`{schema}`.gold_chokepoint_daily
WHERE chokepoint IN ('Strait of Hormuz', 'Bab el-Mandeb Strait', 'Suez Canal', 'Cape of Good Hope')
  AND date >= '2026-01-01'
ORDER BY date, chokepoint""",
    ),
    (
        "Which of our lanes are disrupted today, and how much volume is at risk?",
        """SELECT lane_id, lane, status, primary_pct, alternative_pct, volume_at_risk, volume_unit
FROM `{catalog}`.`{schema}`.gold_lane_status
WHERE date = (SELECT MAX(date) FROM `{catalog}`.`{schema}`.gold_lane_status)
ORDER BY volume_at_risk DESC""",
    ),
    (
        "Which alternative ports are running above their pre-war baseline?",
        """WITH alts AS (
  SELECT l.lane_id, l.vessel_type, alt_port
  FROM `{catalog}`.`{schema}`.ref_demo_lanes l
  LATERAL VIEW EXPLODE(l.alternative_ports) t AS alt_port
),
m AS (
  SELECT a.lane_id, a.vessel_type, p.port, p.lat, p.lon,
         CASE a.vessel_type WHEN 'tanker' THEN p.portcalls_tanker_7d_avg
                            WHEN 'container' THEN p.portcalls_container_7d_avg
                            ELSE p.portcalls_dry_bulk_7d_avg END AS calls_7d,
         CASE a.vessel_type WHEN 'tanker' THEN p.baseline_portcalls_tanker
                            WHEN 'container' THEN p.baseline_portcalls_container
                            ELSE p.baseline_portcalls_dry_bulk END AS baseline
  FROM alts a
  JOIN `{catalog}`.`{schema}`.gold_port_daily p ON p.port = a.alt_port
  WHERE p.date = (SELECT MAX(date) FROM `{catalog}`.`{schema}`.gold_port_daily)
)
SELECT port, lane_id, vessel_type, ROUND(calls_7d, 2) AS calls_7d, ROUND(baseline, 2) AS baseline,
       ROUND(100 * calls_7d / NULLIF(baseline, 0), 1) AS pct, baseline < 1 AS low_baseline, lat, lon
FROM m
WHERE 100 * calls_7d / NULLIF(baseline, 0) >= 100
ORDER BY low_baseline ASC, pct DESC""",
    ),
    (
        "When did our container lane shift away from Jebel Ali?",
        """WITH s AS (
  SELECT date, lane_id, primary_pct, alternative_pct, status
  FROM `{catalog}`.`{schema}`.gold_lane_status
  WHERE primary_port = 'Jebel Ali' AND vessel_type = 'container'
)
SELECT date, lane_id, primary_pct, alternative_pct, status,
       MIN(CASE WHEN primary_pct < 50 THEN date END) OVER () AS first_date_below_50
FROM s
WHERE date >= (SELECT MIN(date) FROM s WHERE primary_pct < 50)
ORDER BY date""",
    ),
    (
        "What should we do about the Jebel Ali lane, and how confident is the model?",
        """SELECT r.date, r.lane_id, r.lane, r.action, ROUND(r.action_confidence, 2) AS action_confidence, r.tier,
       r.shift_target, r.situation
FROM `{catalog}`.`{schema}`.gold_lane_recommendation r
JOIN `{catalog}`.`{schema}`.ref_demo_lanes l ON l.lane_id = r.lane_id
WHERE l.primary_port = 'Jebel Ali' AND l.vessel_type = 'container'
  AND r.date = (SELECT MAX(date) FROM `{catalog}`.`{schema}`.gold_lane_recommendation)""",
    ),
    (
        "When did the model start recommending a shift for our container lane?",
        """SELECT r.lane_id, MIN(r.date) AS first_shift_recommendation_date
FROM `{catalog}`.`{schema}`.gold_lane_recommendation r
JOIN `{catalog}`.`{schema}`.ref_demo_lanes l ON l.lane_id = r.lane_id
WHERE l.primary_port = 'Jebel Ali' AND l.vessel_type = 'container'
  AND r.action = 'shift' AND r.tier IN ('Recommended', 'Review')
GROUP BY r.lane_id""",
    ),
    (
        "Which lanes have no alternative route?",
        """SELECT lane_id, lane, commodity, primary_port, chokepoint, annual_volume, volume_unit
FROM `{catalog}`.`{schema}`.ref_demo_lanes
WHERE size(alternative_ports) = 0""",
    ),
    (
        "How much of the Gulf can we see on AIS compared with normal shipping lanes?",
        """SELECT region, label, sample_hour, unique_vessels, vessels_per_10k_km2, visibility_vs_control
FROM `{catalog}`.`{schema}`.gold_ais_visibility_index
WHERE error IS NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY region ORDER BY sample_hour DESC) = 1
ORDER BY region""",
    ),
]


def table_identifiers(catalog: str, schema: str, missing: frozenset[str] = frozenset()) -> list[str]:
    return [f"{catalog}.{schema}.{t}" for t in TABLES if t not in missing]


def _mentions(text: str, missing: frozenset[str]) -> bool:
    return any(re.search(rf"\b{re.escape(t)}\b", text) for t in missing)


def examples_for(missing: frozenset[str] = frozenset()) -> list[tuple[str, str]]:
    """Example SQL that only reads tables that exist (for example no ai_decide, so no gold_lane_recommendation)."""
    return [(q, sql) for q, sql in EXAMPLE_SQL if not _mentions(sql, missing)]


def instructions_for(missing: frozenset[str] = frozenset()) -> str:
    """The instructions without the bullet lines about tables that do not exist."""
    return "\n".join(line for line in INSTRUCTIONS.split("\n") if not _mentions(line, missing))
