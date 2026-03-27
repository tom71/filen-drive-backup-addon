import { normalizeTargetFolder } from '../services/filenStorageProvider';

describe('normalizeTargetFolder', () => {
  it('liefert immer einen führenden Slash und entfernt abschließende Slashes', () => {
    expect(normalizeTargetFolder('/foo/bar/')).toBe('/foo/bar');
    expect(normalizeTargetFolder('foo/bar/')).toBe('/foo/bar');
    expect(normalizeTargetFolder('/foo/bar')).toBe('/foo/bar');
    expect(normalizeTargetFolder('foo/bar')).toBe('/foo/bar');
  });

  it('gibt "/" für nur Slashes oder leere Eingabe zurück', () => {
    expect(normalizeTargetFolder('/')).toBe('/');
    expect(normalizeTargetFolder('////')).toBe('/');
    expect(normalizeTargetFolder('')).toBe('/Home Assistant Backups');
    expect(normalizeTargetFolder(undefined)).toBe('/Home Assistant Backups');
  });
});
