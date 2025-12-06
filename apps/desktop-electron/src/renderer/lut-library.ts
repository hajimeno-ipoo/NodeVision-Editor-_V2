import type { LutLibraryEntry, LutStorage } from './types';

export const LUT_LIBRARY_STORAGE_KEY = 'nodevision.lut.library.v1';

const isValidEntry = (entry: unknown): entry is LutLibraryEntry =>
  Boolean(
    entry &&
      typeof entry === 'object' &&
      typeof (entry as { id: unknown }).id === 'string' &&
      typeof (entry as { name: unknown }).name === 'string' &&
      typeof (entry as { path: unknown }).path === 'string' &&
      typeof (entry as { filename: unknown }).filename === 'string' &&
      typeof (entry as { addedAt: unknown }).addedAt === 'number'
  );

const normalizeEntries = (raw: unknown): LutLibraryEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidEntry);
};

export const loadLutLibrary = (storage: LutStorage): LutLibraryEntry[] => {
  const raw = storage.getItem(LUT_LIBRARY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeEntries(parsed);
  } catch {
    return [];
  }
};

export const saveLutLibrary = (storage: LutStorage, entries: LutLibraryEntry[]): void => {
  storage.setItem(LUT_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
};

export const removeLutEntry = (entries: LutLibraryEntry[], id: string): LutLibraryEntry[] =>
  entries.filter(entry => entry.id !== id);
