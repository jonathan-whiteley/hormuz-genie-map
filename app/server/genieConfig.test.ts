import { describe, expect, test } from 'vitest';
import { GENIE_PLACEHOLDER, genieSpaceIdFrom } from './genieConfig';

describe('genieSpaceIdFrom', () => {
  test('a real id enables Genie', () => {
    expect(genieSpaceIdFrom({ DATABRICKS_GENIE_SPACE_ID: '01abc' })).toBe('01abc');
    expect(genieSpaceIdFrom({ DATABRICKS_GENIE_SPACE_ID: '  01abc  ' })).toBe('01abc');
  });

  test('unset, empty and the placeholder leave Genie off', () => {
    expect(genieSpaceIdFrom({})).toBeNull();
    expect(genieSpaceIdFrom({ DATABRICKS_GENIE_SPACE_ID: '' })).toBeNull();
    expect(genieSpaceIdFrom({ DATABRICKS_GENIE_SPACE_ID: '   ' })).toBeNull();
    expect(genieSpaceIdFrom({ DATABRICKS_GENIE_SPACE_ID: GENIE_PLACEHOLDER })).toBeNull();
    expect(genieSpaceIdFrom({ DATABRICKS_GENIE_SPACE_ID: 'NONE' })).toBeNull();
  });

  test('the old GENIE_SPACE_ID name is no longer read', () => {
    expect(genieSpaceIdFrom({ GENIE_SPACE_ID: '01abc' })).toBeNull();
  });
});
