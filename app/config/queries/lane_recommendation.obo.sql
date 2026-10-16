-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
SELECT date, lane_id, action, to_json(action_probabilities) AS action_probabilities,
  action_confidence, shift_target, situation, signal_quality_score, tier
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_lane_recommendation')
WHERE date >= DATE'2026-01-01'
