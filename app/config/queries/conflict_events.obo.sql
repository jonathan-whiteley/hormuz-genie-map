-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
SELECT event_date, event, source_url FROM IDENTIFIER(:catalog || '.' || :schema || '.ref_conflict_events')
