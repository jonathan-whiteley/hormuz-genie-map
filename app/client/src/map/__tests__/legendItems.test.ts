import { describe, expect, it } from 'vitest';
import { RESTING } from '../baseLayers';
import { legendItems } from '../legendItems';

describe('legendItems', () => {
  it('is one ramp at rest and grows only with the layers that are on', () => {
    expect(legendItems(RESTING, false)).toEqual(['ramp']);
    expect(legendItems({ chokepoints: false, ports: false, lanes: false, ais: false }, false)).toEqual([]);
    expect(legendItems({ chokepoints: false, ports: true, lanes: true, ais: true }, true)).toEqual([
      'ramp',
      'lanes',
      'ais',
      'answer',
    ]);
  });
});
