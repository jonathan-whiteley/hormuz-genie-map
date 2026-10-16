import { describe, expect, it } from 'vitest';
import { tooltipPos } from '../tooltip';

const box = { w: 800, h: 600 };
const tip = { w: 300, h: 120 };

describe('tooltipPos', () => {
  it('sits below-right of the cursor with room', () => {
    expect(tooltipPos(100, 100, box, tip)).toEqual({ left: 112, top: 112 });
  });
  it('flips left near the right edge', () => {
    expect(tooltipPos(700, 100, box, tip)).toEqual({ left: 388, top: 112 });
  });
  it('flips above near the bottom edge', () => {
    expect(tooltipPos(100, 560, box, tip)).toEqual({ left: 112, top: 428 });
  });
  it('stays inside a container smaller than the flip room', () => {
    const p = tooltipPos(150, 50, { w: 320, h: 140 }, tip);
    expect(p.left).toBeGreaterThanOrEqual(4);
    expect(p.left + tip.w).toBeLessThanOrEqual(316);
    expect(p.top).toBeGreaterThanOrEqual(4);
  });
});
