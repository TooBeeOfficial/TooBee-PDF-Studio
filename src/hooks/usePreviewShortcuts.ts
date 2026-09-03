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

export function usePreviewShortcuts(opts: PreviewShortcutOptions) {
  const {
    enabled = true, zoom, page, hasSelection = false,
    onNudge, onDelete, onEscape,
  } = opts;

  const applyZoom = useCallback((delta: number) => {
    if (!zoom) return;
    const { value, set, min = 0.25, max = 4 } = zoom;
    set(clamp(Math.round((value + delta) * 100) / 100, min, max));
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
    applyZoom(raw > 0 ? -(zoom.step ?? 0.1) : (zoom.step ?? 0.1));
  }, [enabled, zoom, applyZoom]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;

      // ── Zoom ───────────────────────────────────────────────────────────────
      if (mod && zoom && !e.altKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(zoom.step ?? 0.1); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); applyZoom(-(zoom.step ?? 0.1)); return; }
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
  }, [enabled, zoom, page, hasSelection, onNudge, onDelete, onEscape, applyZoom, goToPage]);

  return { onWheel };
}
