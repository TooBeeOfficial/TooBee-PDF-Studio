import { useCallback, useEffect } from 'react';
import { isTypingTarget } from './useShortcuts';

/**
 * Quality-of-life keys and wheel gestures for a document preview.
 *
 * Wired into whichever surface shows a page, so the same gestures work in the
 * Studio Editor, Sign, PDF-to-image and the shared previewer:
 *
 *   Shift + wheel · Ctrl + wheel   zoom
 *   Ctrl + = / Ctrl + -            zoom in / out
 *   Ctrl + 0                       reset to 100%
 *   Page Up / Page Down            previous / next page
 *   ← / →                          previous / next page (when nothing is selected)
 *   Home / End                     first / last page
 *   ← ↑ → ↓                        nudge the selection by 1pt (Shift for 10pt)
 *   Delete / Backspace             delete the selection
 *   Escape                         clear the selection, or cancel what is being drawn
 *
 * Application-level shortcuts live in useShortcuts and use Alt, so the two sets
 * never contend for the same chord.
 */

export interface ZoomApi {
  value: number;
  set: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Zoom returned to by Ctrl+0. */
  reset?: number;
}

export interface PageApi {
  current: number;
  total: number;
  set: (next: number) => void;
}

export interface PreviewShortcutOptions {
  enabled?: boolean;
  zoom?: ZoomApi;
  page?: PageApi;
  /** When true, the arrow keys nudge instead of turning the page. */
  hasSelection?: boolean;
  onNudge?: (dx: number, dy: number) => void;
  onDelete?: () => void;
  onEscape?: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How hard the wheel bites. Multiplied by the raw wheel delta, so a flick of a
 * trackpad moves the zoom a little and a firm mouse notch moves it a lot.
 */
const WHEEL_SENSITIVITY = 0.0022;

/**
 * Zoom multiplicatively rather than by addition.
 *
 * Adding a fixed step makes zoom feel wrong at both ends: +0.2 on top of 0.25
 * is a 80% jump, while the same +0.2 on top of 4.0 is barely 5%. Scaling by a
 * factor instead means every notch changes the view by the same proportion,
 * which is what the eye reads as smooth. Taking the factor from the exponential
 * of the wheel delta also makes zooming in and back out land exactly where it
 * started, because exp(x) and exp(-x) are inverses.
 */
const zoomFactor = (delta: number) => Math.exp(-delta * WHEEL_SENSITIVITY);

/** One press of a zoom button. A quarter each way, for the same reason. */
export const ZOOM_BUTTON_FACTOR = 1.25;

/**
 * One press of Ctrl+= or Ctrl+-.
 *
 * Deliberately much gentler than the buttons: the shortcut is held down and
 * auto-repeats, so a large step per press marches through the range in a few
 * jumps. At eight percent a held key glides, and a single tap is a nudge rather
 * than a leap to the next preset.
 */
const ZOOM_KEY_FACTOR = 1.08;

/**
 * The zoom a button press should land on. Exported so the Studio Editor and
 * Sign buttons move by the same proportion as the wheel does, instead of the
 * flat ±0.2 they used to add.
 */
export function stepZoom(value: number, direction: 1 | -1, min = 0.25, max = 4): number {
  const next = direction > 0 ? value * ZOOM_BUTTON_FACTOR : value / ZOOM_BUTTON_FACTOR;
  return clamp(Math.round(next * 1000) / 1000, min, max);
}

export function usePreviewShortcuts(opts: PreviewShortcutOptions) {
  const {
    enabled = true, zoom, page, hasSelection = false,
    onNudge, onDelete, onEscape,
  } = opts;

  /** Scale the zoom by a factor. Rounded fine enough to read as continuous. */
  const scaleZoom = useCallback((factor: number) => {
    if (!zoom) return;
    const { value, set, min = 0.25, max = 4 } = zoom;
    set(clamp(Math.round(value * factor * 1000) / 1000, min, max));
  }, [zoom]);

  const goToPage = useCallback((next: number) => {
    if (!page) return;
    page.set(clamp(next, 1, Math.max(1, page.total)));
  }, [page]);

  /** Spread onto the scrolling preview container. */
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!enabled || !zoom) return;
    // Shift is the requested gesture; Ctrl is kept because it is the habit
    // most people already have from other document viewers.
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    // Shift+wheel is reported on deltaX by some drivers, so take whichever moved.
    const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

    // deltaMode 1 is lines and 2 is pages; both carry far smaller numbers than
    // the pixel units the sensitivity is tuned for, so they are converted
    // rather than left to produce an imperceptible nudge.
    const pixels = e.deltaMode === 1 ? raw * 16 : e.deltaMode === 2 ? raw * 400 : raw;

    scaleZoom(zoomFactor(pixels));
  }, [enabled, zoom, scaleZoom]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;

      // ── Zoom ───────────────────────────────────────────────────────────────
      if (mod && zoom && !e.altKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); scaleZoom(ZOOM_KEY_FACTOR); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); scaleZoom(1 / ZOOM_KEY_FACTOR); return; }
        if (e.key === '0') { e.preventDefault(); zoom.set(zoom.reset ?? 1); return; }
      }
      if (mod || e.altKey) return;

      // ── Selection ──────────────────────────────────────────────────────────
      if (e.key === 'Escape') {
        if (onEscape) { e.preventDefault(); onEscape(); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection && onDelete) {
        e.preventDefault();
        onDelete();
        return;
      }

      // ── Nudge takes the arrows while something is selected ────────────────
      if (hasSelection && onNudge) {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') { e.preventDefault(); onNudge(-step, 0); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); onNudge(step, 0); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); onNudge(0, -step); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); onNudge(0, step); return; }
      }

      // ── Paging ─────────────────────────────────────────────────────────────
      if (!page) return;
      if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !hasSelection)) {
        e.preventDefault(); goToPage(page.current - 1); return;
      }
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !hasSelection)) {
        e.preventDefault(); goToPage(page.current + 1); return;
      }
      if (e.key === 'Home') { e.preventDefault(); goToPage(1); return; }
      if (e.key === 'End') { e.preventDefault(); goToPage(page.total); return; }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, zoom, page, hasSelection, onNudge, onDelete, onEscape, scaleZoom, goToPage]);

  return { onWheel };
}
