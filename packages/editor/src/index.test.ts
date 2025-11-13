import { describe, expect, it } from 'vitest';

import { snapValue } from './index';

describe('index barrel', () => {
  it('re-exports utilities', () => {
    expect(snapValue(8)).toBe(8);
  });
});
