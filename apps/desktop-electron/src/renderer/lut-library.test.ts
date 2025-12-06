import { describe, expect, it } from 'vitest';

import { LUT_LIBRARY_STORAGE_KEY, loadLutLibrary, removeLutEntry, saveLutLibrary } from './lut-library';
import type { LutLibraryEntry, LutStorage } from './types';

const createMemoryStorage = (): LutStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    }
  };
};

const sampleEntry = (): LutLibraryEntry => ({
  id: 'lut-1',
  name: 'Teal & Orange',
  path: '/tmp/teal.cube',
  filename: 'teal.cube',
  addedAt: 123
});

describe('lut-library storage helpers', () => {
  it('returns empty array when storage is empty', () => {
    const storage = createMemoryStorage();
    expect(loadLutLibrary(storage)).toEqual([]);
  });

  it('handles malformed JSON gracefully', () => {
    const storage = createMemoryStorage();
    storage.setItem(LUT_LIBRARY_STORAGE_KEY, '{bad json');
    expect(loadLutLibrary(storage)).toEqual([]);
  });

  it('round-trips entries through save and load', () => {
    const storage = createMemoryStorage();
    const entries: LutLibraryEntry[] = [sampleEntry()];
    saveLutLibrary(storage, entries);
    expect(loadLutLibrary(storage)).toEqual(entries);
  });

  it('removes a LUT by id', () => {
    const entries: LutLibraryEntry[] = [sampleEntry(), { ...sampleEntry(), id: 'lut-2', name: 'Alt' }];
    const next = removeLutEntry(entries, 'lut-1');
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('lut-2');
  });
});
