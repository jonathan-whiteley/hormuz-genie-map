import { describe, expect, it } from 'vitest';
import { fmtHeard, navStatusLabel } from '../vessels';

describe('vessel tooltip formatting', () => {
  it('names the AIS navigational status codes', () => {
    expect(navStatusLabel(1)).toBe('At anchor');
    expect(navStatusLabel(5)).toBe('Moored');
    expect(navStatusLabel(15)).toBe('Not defined');
    expect(navStatusLabel(null)).toBe('no data');
  });

  it('shows the report time in UTC', () => {
    expect(fmtHeard('2026-10-22T14:05:00.000Z')).toBe('Oct 22, 14:05 UTC');
    expect(fmtHeard('not a time')).toBe('not a time');
  });
});
