-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
-- SELECT * so an older table without effect and short_label still loads; the client defaults them to null.
-- Columns: event_date, event, source_url, effect ('down', 'up' or 'context'), short_label.
SELECT * FROM IDENTIFIER(:catalog || '.' || :schema || '.ref_conflict_events')
