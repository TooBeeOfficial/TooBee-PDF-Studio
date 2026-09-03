import { useCallback, useState } from 'react';

/**
 * Enumerates the fonts installed on this machine.
 *
 * Uses the Local Font Access API (`window.queryLocalFonts`), available in the
 * Chromium that Electron 31 ships. It needs transient user activation, so it is
 * called from a click on the font field rather than on mount.
 *
 * Previewing needs nothing further: an installed family resolves by name in
 * CSS, so `font-family: 'Garamond'` renders correctly once the name is known.
 *
 * Export is a different matter — see the note in the Studio Editor panel. Only
 * the PDF standard-14 families and fonts uploaded as files can currently be
 * written into a PDF, because pdf-lib needs fontkit registered to embed
 * anything else and it is not wired up.
 */

export type SystemFontStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'denied';

interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

export function useSystemFonts() {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [status, setStatus] = useState<SystemFontStatus>('idle');

  const load = useCallback(async () => {
    // Only ever attempt once per session; a denial should not re-prompt on
    // every focus of the field.
    if (status !== 'idle') return;

    const query = (window as unknown as {
      queryLocalFonts?: () => Promise<LocalFontData[]>;
    }).queryLocalFonts;

    if (typeof query !== 'function') {
      setStatus('unavailable');
      return;
    }

    setStatus('loading');
    try {
      const data = await query();
      const families = Array.from(new Set(data.map(f => f.family)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      setSystemFonts(families);
      setStatus(families.length ? 'ready' : 'unavailable');
    } catch {
      // Permission refused, or the API threw without activation.
      setStatus('denied');
    }
  }, [status]);

  return { systemFonts, status, load };
}
