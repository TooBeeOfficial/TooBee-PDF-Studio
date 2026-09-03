import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrefsStore } from '../store/usePrefsStore';

/**
 * Application keyboard shortcuts.
 *
 * A tool that wants to feel professional and has no shortcuts is not finished.
 * Scope is deliberately limited to navigation and app chrome: per-tool actions
 * like open and save would mean reaching into each page's handlers, which sit
 * next to the PDF pipeline.
 *
 *   Alt+1 … Alt+9    jump to a tool
 *   Alt+0            dashboard
 *   Ctrl+,           settings
 *   Ctrl+Shift+L     toggle light/dark
 *
 * Navigation uses Alt rather than Ctrl so that Ctrl+0 / Ctrl+= / Ctrl+- stay
 * free for zoom in the previews, where they are the near-universal convention.
 * See usePreviewShortcuts.
 */

export const SHORTCUT_ROUTES = [
  '/merge',
  '/split',
  '/compress',
  '/rotate',
  '/extract',
  '/extract-folder',
  '/edit',
  '/sign',
  '/protect',
] as const;

/** True when focus is somewhere that should keep its own key handling. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable;
}

export function useShortcuts(onOpenSettings: () => void) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Shift+L — flip the theme. Shift-guarded so it can't collide with
      // a plain Ctrl+L in any future text context.
      if (mod && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const { resolvedTheme, setTheme } = usePrefsStore.getState();
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
        return;
      }

      if (mod && !e.altKey && !e.shiftKey && e.key === ',') {
        e.preventDefault();
        onOpenSettings();
        return;
      }

      // Navigation is Alt-based, leaving the Ctrl digits to preview zoom.
      if (!e.altKey || mod || e.shiftKey) return;

      // e.code rather than e.key: on a Greek or Japanese layout the digit keys
      // still report Digit1..Digit9, while e.key may not. Alt also rewrites
      // e.key to accented characters on several layouts.
      const match = /^Digit([0-9])$/.exec(e.code);
      if (!match) return;

      const n = Number(match[1]);
      if (n === 0) {
        e.preventDefault();
        navigate('/');
        return;
      }
      const route = SHORTCUT_ROUTES[n - 1];
      if (route) {
        e.preventDefault();
        navigate(route);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, onOpenSettings]);
}
