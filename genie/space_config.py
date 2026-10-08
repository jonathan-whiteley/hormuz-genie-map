"""Genie space content for the Hormuz Chokepoint Monitor (catalog/schema templated)."""

TABLES = [
    "gold_chokepoint_daily",
    "gold_port_daily",
    "ref_conflict_events",
    "ref_portwatch_chokepoints",
    "ref_portwatch_ports",
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
- Data lags real time by a few days; mention the latest date in the result."""

SAMPLE_QUESTIONS = [
    "How do daily tanker transits through the Strait of Hormuz compare to the pre-war baseline by month in 2026?",
    "Which region ports have tanker port calls above their pre-war baseline in the last 30 days?",
    "Compare 7-day average transits at Hormuz, Bab el-Mandeb, Suez Canal and Cape of Good Hope since January 2026.",
    "Show tanker exports at Fujairah and Yanbu by week since the war started.",
    "What were visible Hormuz transits in the week after each conflict event?",
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
]


def table_identifiers(catalog: str, schema: str) -> list[str]:
    return [f"{catalog}.{schema}.{t}" for t in TABLES]
