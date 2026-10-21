import { describe, expect, it } from 'vitest';
import { fill, pick } from '../fill';

describe('fill', () => {
  it('replaces every placeholder', () => {
    expect(fill('{a} and {b}, {a}', { a: 'x', b: 3 })).toBe('x and 3, x');
  });
  it('null, undefined, NaN and missing keys become no data', () => {
    expect(fill('{a}|{b}|{c}|{d}', { a: null, b: undefined, c: NaN })).toBe('no data|no data|no data|no data');
  });
  it('never outputs NaN or undefined', () => {
    const out = fill('{a} {b} {c}', { a: NaN, b: undefined, c: null });
    expect(out).not.toMatch(/NaN|undefined/);
  });
  it('keeps zero', () => {
    expect(fill('{a}', { a: 0 })).toBe('0');
  });
});

describe('pick', () => {
  it('returns the matching branch', () => {
    expect(pick(true, 'yes', 'no')).toBe('yes');
    expect(pick(false, 'yes', 'no')).toBe('no');
  });
});
