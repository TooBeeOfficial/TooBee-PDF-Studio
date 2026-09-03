import { useEffect, useRef, type RefObject } from 'react';

/**
 * Fits the page to the stage the first time a document is shown.
 *
 * The editors used to open every document at a fixed 150%, which on an A4 page
 * in a normal window meant landing mid-page with no idea what you were looking
 * at. This measures the rendered canvas against the space available and scales
 * so the first page fits whole.
 *
 * It measures the canvas rather than asking pdf.js for page dimensions, so it
 * works on any preview without reaching into the rendering code.
 *
 * Runs once per document: `key` identifies the loaded file, and the fit is
 * recorded against it so a later manual zoom is never overridden.
 */
export function useFitOnLoad(opts: {
  /** Identity of the current document. Null disables fitting. */
  key: string | null;
  stageRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Scale the canvas is currently rendered at. */
  scale: number;
  setScale: (next: number) => void;
  min?: number;
  max?: number;
  /** Breathing room left around the page, in CSS pixels. */
  padding?: number;
}) {
  const { key, stageRef, canvasRef, scale, setScale, min = 0.25, max = 4, padding = 56 } = opts;

  const fittedFor = useRef<string | null>(null);
  // Read through a ref so the effect can depend on `key` alone and never
  // re-run itself in response to the scale change it just made.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    if (!key) { fittedFor.current = null; return; }
    if (fittedFor.current === key) return;

    let raf = 0;
    let tries = 0;

    const attempt = () => {
      const box = stageRef.current;
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();

      // Wait for the first render to give the canvas a real size.
      if (box && canvas && rect && rect.width > 4 && rect.height > 4 && box.clientWidth > 0) {
        const availW = box.clientWidth - padding;
        const availH = box.clientHeight - padding;
        if (availW > 0 && availH > 0) {
          const factor = Math.min(availW / rect.width, availH / rect.height);
          const next = Math.max(min, Math.min(max, Math.round(scaleRef.current * factor * 100) / 100));
          // Recorded before setting, so this can never loop.
          fittedFor.current = key;
          if (Math.abs(next - scaleRef.current) > 0.01) setScale(next);
          return;
        }
      }

      // ~40 frames is comfortably longer than a first page render.
      if (tries++ < 40) raf = requestAnimationFrame(attempt);
    };

    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
