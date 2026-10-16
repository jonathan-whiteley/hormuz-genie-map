CREATE OR REFRESH MATERIALIZED VIEW gold_lane_recommendation
COMMENT 'ai_decide recommendations per demo lane on weekly snapshot dates (Mondays from 2026-02-02 plus the latest date). SQL turns the numbers into a plain-language description (state_text); ai_decide classifies it with calibrated probabilities; SQL composes a tier with untuned demo thresholds: Novel situation (none_fit or top probability below 0.40), Analyst (signal_quality score 1.5 or more), Recommended (confidence 0.90 or more), Review (0.60 or more), else Analyst. Lanes are synthetic examples.'
AS
WITH s AS (
  SELECT ls.*,
         LAG(ls.primary_pct, 14) OVER (PARTITION BY ls.lane_id ORDER BY ls.date) AS primary_pct_14d_ago
  FROM `${hormuz.catalog}`.`${hormuz.schema}`.gold_lane_status ls
),
snap AS (
  SELECT * FROM s
  WHERE dayofweek(s.date) = 2 AND s.date >= DATE'2026-02-02'
     OR s.date = (SELECT MAX(date) FROM `${hormuz.catalog}`.`${hormuz.schema}`.gold_lane_status)
),
ev AS (
  SELECT s.lane_id, s.date, max_by(e.event, e.event_date) AS latest_event
  FROM snap s LEFT JOIN `${hormuz.catalog}`.`${hormuz.schema}`.ref_conflict_events e ON e.event_date <= s.date
  GROUP BY s.lane_id, s.date
),
vis AS (
  SELECT s.lane_id, s.date, max_by(v.visibility_vs_control, v.sample_hour) AS gulf_vis
  FROM snap s LEFT JOIN `${hormuz.catalog}`.`${hormuz.schema}`.gold_ais_visibility_index v
    ON v.region = 'gulf_hormuz' AND CAST(v.sample_hour AS DATE) <= s.date
  GROUP BY s.lane_id, s.date
),
described AS (
  SELECT s.date, s.lane_id, s.lane,
    concat(
      'Lane: ', s.lane, ' via ', s.primary_port, ' (',
      CASE s.vessel_type WHEN 'tanker' THEN 'tankers' WHEN 'container' THEN 'container ships' ELSE 'dry bulk carriers' END, '). ',
      'Primary port: visible calls ',
      CASE WHEN s.primary_pct IS NULL THEN 'have no visible data'
           WHEN s.primary_pct < 25 THEN 'are far below pre-war levels'
           WHEN s.primary_pct < 50 THEN 'are well below pre-war levels'
           WHEN s.primary_pct < 80 THEN 'are below pre-war levels'
           WHEN s.primary_pct < 120 THEN 'are near pre-war levels'
           WHEN s.primary_pct < 200 THEN 'are above pre-war levels'
           ELSE 'are well above pre-war levels' END,
      CASE WHEN s.primary_pct IS NULL OR s.primary_pct_14d_ago IS NULL THEN ''
           WHEN s.primary_pct_14d_ago = 0 THEN CASE WHEN s.primary_pct > 0 THEN ' and rising over the last 14 days' ELSE ' and steady over the last 14 days' END
           WHEN s.primary_pct < 0.8 * s.primary_pct_14d_ago THEN ' and falling over the last 14 days'
           WHEN s.primary_pct > 1.25 * s.primary_pct_14d_ago THEN ' and rising over the last 14 days'
           ELSE ' and steady over the last 14 days' END, '. ',
      'Alternative ports: ',
      coalesce(nullif(array_join(transform(s.alt_ports, a -> concat(a.port, ' is ',
        CASE WHEN a.pct IS NULL THEN 'without visible data'
             WHEN a.baseline < 1 AND a.pct >= 100 THEN 'above pre-war levels, but this reading is unreliable because of a very small baseline'
             WHEN a.baseline < 1 THEN 'below pre-war levels on a very small baseline'
             WHEN a.pct < 50 THEN 'well below pre-war levels'
             WHEN a.pct < 80 THEN 'below pre-war levels'
             WHEN a.pct < 120 THEN 'near pre-war levels'
             WHEN a.pct < 200 THEN 'above pre-war levels'
             ELSE 'well above pre-war levels' END)), '; '), ''),
        'none, this lane has no bypass route'), '. ',
      'Strait of Hormuz: visible transits for this vessel type ',
      CASE WHEN s.hormuz_pct IS NULL THEN 'have no visible data'
           WHEN s.hormuz_pct < 25 THEN 'are near zero compared with pre-war levels'
           WHEN s.hormuz_pct < 80 THEN 'are below pre-war levels'
           ELSE 'are near pre-war levels' END, '. ',
      'Latest event: ', coalesce(ev.latest_event, 'none recorded'), '. ',
      'Gulf AIS visibility: ',
      CASE WHEN vis.gulf_vis IS NULL THEN 'not measured'
           WHEN vis.gulf_vis < 0.05 THEN 'very low'
           WHEN vis.gulf_vis < 0.3 THEN 'low'
           ELSE 'moderate' END, '.'
    ) AS state_text
  FROM snap s JOIN ev USING (lane_id, date) JOIN vis USING (lane_id, date)
),
decided AS (
  SELECT d.*, ai_decide(d.state_text, '{
    "situation": {"type": "choice", "instructions": "Which pattern best describes this shipping lane right now?",
      "criteria": {"acute_closure": "Traffic through the strait recently collapsed",
                   "sustained_closure": "Traffic has been far below normal for a long period",
                   "partial_recovery": "Traffic is recovering toward normal levels",
                   "normal": "Traffic is at or near normal levels",
                   "none_fit": "None of these patterns fits the description"}},
    "action": {"type": "choice", "instructions": "Which action does the description support for a shipper using this lane?",
      "criteria": {"hold": "Keep using the primary port and route",
                   "shift": "Move volume to alternative ports that are running above normal",
                   "buffer": "Build safety stock because no alternative is working",
                   "escalate": "Escalate to leadership because the situation is severe and unclear",
                   "none_fit": "None of these actions fits the description"}},
    "shift_target": {"type": "choice", "instructions": "If volume should shift, which alternative port does the description show running best? Prefer ports with a normal baseline; ignore readings described as unreliable.",
      "criteria": {"Yanbu (King Fahd Port)": null, "Fujairah": null, "Khor Fakkan": null, "Port of Sohar": null,
                   "Salalah": null, "Jeddah": null,
                   "not_applicable": "The lane has no working alternative port or should not shift"}},
    "signal_quality": {"type": "score", "instructions": "How clear and consistent are the signals in this description?",
      "criteria": ["Clear and consistent signals", "Mixed signals with some caveats", "Thin or contradictory signals"]}
  }', map('version', '1.0')) AS decision
  FROM described d
),
parsed AS (
  SELECT date, lane_id, lane, state_text, decision,
    decision:response.answers.action.choice::string AS action,
    from_json(to_json(decision:response.answers.action.probabilities), 'map<string,double>') AS action_probabilities,
    decision:response.answers.action.confidence::double AS action_confidence,
    decision:response.answers.shift_target.choice::string AS shift_target,
    decision:response.answers.situation.choice::string AS situation,
    decision:response.answers.signal_quality.score::double AS signal_quality_score
  FROM decided
)
SELECT p.*,
  CASE
    WHEN p.action IS NULL OR p.action = 'none_fit' OR array_max(map_values(p.action_probabilities)) < 0.40 THEN 'Novel situation'
    WHEN p.signal_quality_score >= 1.5 THEN 'Analyst'
    WHEN p.action_confidence >= 0.90 THEN 'Recommended'
    WHEN p.action_confidence >= 0.60 THEN 'Review'
    ELSE 'Analyst'
  END AS tier
FROM parsed p;
