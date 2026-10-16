import { describe, expect, it } from 'vitest';
import { GRAY, LAVA, NAVY, pctColor, statusColor } from '../colors';

describe('pctColor', () => {
  it('100% or more is Navy 900', () => {
    expect(pctColor(100)).toEqual([...NAVY, 230]);
    expect(pctColor(250)).toEqual([...NAVY, 230]);
  });
  it('0% (and below) is Lava 600', () => {
    expect(pctColor(0)).toEqual([...LAVA, 230]);
    expect(pctColor(-5)).toEqual([...LAVA, 230]);
  });
  it('50% is the linear midpoint', () => {
    const mid = pctColor(50);
    for (let i = 0; i < 3; i++) expect(mid[i]).toBe(Math.round((LAVA[i] + NAVY[i]) / 2));
    expect(mid[3]).toBe(230);
  });
  it('null and NaN are gray', () => {
    expect(pctColor(null)).toEqual(GRAY);
    expect(pctColor(NaN)).toEqual(GRAY);
    expect(GRAY).toEqual([150, 150, 150, 160]);
  });
});

describe('statusColor', () => {
  it('maps every status', () => {
    expect(statusColor('Normal').slice(0, 3)).toEqual(NAVY);
    expect(statusColor('Degraded').slice(0, 3)).toEqual([0xf5, 0xa6, 0x23]);
    expect(statusColor('Shifted to alternative').slice(0, 3)).toEqual([0x1b, 0x8a, 0x8f]);
    expect(statusColor('Disrupted').slice(0, 3)).toEqual(LAVA);
    expect(statusColor('No data')).toEqual(GRAY);
  });
});
