import { describe, expect, it } from 'vitest';
import { isStale, relativeTime } from '../freshness';

const now = Date.parse('2026-10-15T12:00:00Z');

describe('isStale', () => {
  it('fresh when PortWatch is within 7 days and AIS within 3 hours', () => {
    expect(isStale('2026-10-10', '2026-10-15T10:05:00Z', now)).toBe(false);
  });
  it('amber when PortWatch is more than 7 days old', () => {
    expect(isStale('2026-10-02', '2026-10-15T11:05:00Z', now)).toBe(true);
  });
  it('amber when the last AIS sample is more than 3 hours old', () => {
    expect(isStale('2026-10-14', '2026-10-15T08:00:00Z', now)).toBe(true);
  });
  it('missing values are not stale on their own', () => {
    expect(isStale(null, null, now)).toBe(false);
  });
});

describe('relativeTime', () => {
  it('minutes, hours, days', () => {
    expect(relativeTime('2026-10-15T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-10-15T07:00:00Z', now)).toBe('5 h ago');
    expect(relativeTime('2026-10-12T12:00:00Z', now)).toBe('3 d ago');
    expect(relativeTime('not a date', now)).toBe('unknown');
  });
});
