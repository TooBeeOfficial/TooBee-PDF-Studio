import { create } from 'zustand';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** What the user picked. 'system' keeps following the OS for the whole session. */
export type ThemeChoice = 'system' | 'light' | 'dark';
/** What is actually painted. Always one of two; never ambiguous. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * Performance tier.
 *   full    — everything on
 *   light   — fewer thumbnails rendered up front, lighter chrome
 *   minimal — light, plus every transition and animation removed
 *
 * The tier is mirrored onto <html data-perf> so CSS can respond on its own
 * without a single component having to branch on it.
 */
export type PerfTier = 'full' | 'light' | 'minimal';

interface PrefsState {
  themeChoice: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  perf: PerfTier;
  /** True once the first-launch probe has run, so the hint shows at most once. */
  perfHintSeen: boolean;
  /** Set when the probe thinks this machine would do better on a lower tier. */
  perfHintOpen: boolean;

  setTheme: (choice: ThemeChoice) => void;
  setPerf: (tier: PerfTier) => void;
  dismissPerfHint: (accept: boolean) => void;
}

// ─── Storage ───────────────────────────────────────────────────────────────────

const KEY_THEME = 'toobee.theme';
const KEY_PERF = 'toobee.perf';
const KEY_HINT = 'toobee.perfHintSeen';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode or blocked storage: fall back to defaults rather than throw.
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* non-fatal — the preference just will not survive a restart */
  }
}

// ─── Resolution ────────────────────────────────────────────────────────────────

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function systemTheme(): ResolvedTheme {
  return darkQuery()?.matches ? 'dark' : 'light';
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

/**
 * Writes both attributes onto <html>. Exported because index.html runs the same
 * logic inline before first paint to avoid a flash of the wrong theme, and the
 * two must not drift apart.
 */
export function applyToDocument(theme: ResolvedTheme, perf: PerfTier) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-perf', perf);
}

// ─── Initial values ────────────────────────────────────────────────────────────

function initialThemeChoice(): ThemeChoice {
  const stored = read(KEY_THEME);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function initialPerf(): PerfTier {
  const stored = read(KEY_PERF);
  return stored === 'full' || stored === 'light' || stored === 'minimal' ? stored : 'full';
}

// ─── Store ─────────────────────────────────────────────────────────────────────

const startChoice = initialThemeChoice();
const startPerf = initialPerf();

export const usePrefsStore = create<PrefsState>((set, get) => ({
  themeChoice: startChoice,
  resolvedTheme: resolve(startChoice),
  perf: startPerf,
  perfHintSeen: read(KEY_HINT) === '1',
  perfHintOpen: false,

  setTheme: (choice) => {
    const resolved = resolve(choice);
    write(KEY_THEME, choice);
    applyToDocument(resolved, get().perf);
    set({ themeChoice: choice, resolvedTheme: resolved });
  },

  setPerf: (tier) => {
    write(KEY_PERF, tier);
    applyToDocument(get().resolvedTheme, tier);
    set({ perf: tier });
  },

  dismissPerfHint: (accept) => {
    write(KEY_HINT, '1');
    if (accept) {
      write(KEY_PERF, 'light');
      applyToDocument(get().resolvedTheme, 'light');
      set({ perf: 'light', perfHintOpen: false, perfHintSeen: true });
    } else {
      set({ perfHintOpen: false, perfHintSeen: true });
    }
  },
}));

// ─── OS theme tracking ─────────────────────────────────────────────────────────

/**
 * Keeps 'system' following the OS for the life of the session. Attached once at
 * module load; there is exactly one app window, so there is nothing to tear down.
 */
const mq = darkQuery();
mq?.addEventListener?.('change', () => {
  const { themeChoice, perf } = usePrefsStore.getState();
  if (themeChoice !== 'system') return;
  const resolved = systemTheme();
  applyToDocument(resolved, perf);
  usePrefsStore.setState({ resolvedTheme: resolved });
});

// ─── First-launch capability probe ─────────────────────────────────────────────

/**
 * Samples cheap capability signals and, if the machine looks weak, opens a
 * one-time hint offering Light mode. Deliberately only ever *suggests*: these
 * signals are indicative at best, and silently degrading the app would leave
 * someone with a worse experience and no explanation for it.
 */
export function probePerformance() {
  const s = usePrefsStore.getState();
  if (s.perfHintSeen || s.perf !== 'full') return;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;

  // Time two frames. A machine that cannot hold ~60fps while idle at startup is
  // very unlikely to hold it while rendering PDF pages.
  const t0 = performance.now();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const perFrame = (performance.now() - t0) / 2;
      const weak = cores <= 2 || memory <= 2 || perFrame > 32;
      if (weak) {
        usePrefsStore.setState({ perfHintOpen: true });
      } else {
        write(KEY_HINT, '1');
        usePrefsStore.setState({ perfHintSeen: true });
      }
    });
  });
}
