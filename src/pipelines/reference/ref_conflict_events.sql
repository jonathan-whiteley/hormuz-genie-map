CREATE OR REFRESH MATERIALIZED VIEW ref_conflict_events
COMMENT 'Key 2026 Iran war and Strait of Hormuz milestones for annotating charts. Dates come from public reporting (see source_url); verify before publishing.'
AS SELECT CAST(event_date AS DATE) AS event_date, event, source_url
FROM VALUES
  ('2026-02-28', 'US and Israeli strikes on Iran begin; war starts', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-03-04', 'Iran declares the Strait of Hormuz closed', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-03-08', 'Brent crude passes 100 USD per barrel', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-04-08', 'Two-week ceasefire begins', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-04-17', 'Brief partial reopening of the strait', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-06-17', 'US and Iran sign memorandum to end the war', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-06-20', 'Iran recloses the strait citing violations', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-07-08', 'Ceasefire collapses after attacks on commercial vessels', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-09-22', 'Saudi Arabia restarts East-West pipeline for crude exports to Yanbu', 'https://www.thenationalnews.com/')
AS t(event_date, event, source_url);
