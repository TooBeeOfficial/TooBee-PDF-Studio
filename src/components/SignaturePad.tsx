import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { nibWidth, paintStrokes, type InkPoint, type InkStroke } from '../utils/inkStroke';

/**
 * A surface to sign on with the mouse.
 *
 * The strokes, not the pixels, are the output. What is drawn here is only ever
 * a preview at whatever size the panel happens to be; the mark is re-rendered
 * from these coordinates at export resolution, so a signature drawn in a 260px
 * box still prints cleanly. Coordinates are therefore in CSS pixels of the pad
 * and carry no resolution of their own.
 *
 * Pointer events rather than mouse events, so a trackpad, a pen and a
 * touchscreen all work without three code paths. Pointer capture keeps a stroke
 * attached to the pad when the hand overshoots its edge mid-signature, which on
 * a small box happens constantly.
 */

interface Props {
  color: string;
  /** Base nib half-width in pad pixels; velocity varies it around this. */
  weight?: number;
  onChange: (strokes: InkStroke[]) => void;
}

export default function SignaturePad({ color, weight = 1.6, onChange }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const strokesRef = useRef<InkStroke[]>([]);
  const currentRef = useRef<InkStroke | null>(null);
  const lastRef = useRef<InkPoint | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const all = currentRef.current
      ? [...strokesRef.current, currentRef.current]
      : strokesRef.current;
    paintStrokes(ctx, all, color);
  }, [color]);

  /**
   * The backing store is sized to the device pixel ratio while the element
   * keeps its CSS size, so the ink is not a blurry upscale on a high-DPI
   * screen. Resizing a canvas clears it, hence the redraw.
   */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = wrap.getBoundingClientRect();
    if (!width || !height) return;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    const observer = new ResizeObserver(resize);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [resize]);

  useEffect(() => { redraw(); }, [redraw]);

  const pointAt = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const commit = () => {
    onChange(strokesRef.current.slice());
    setIsEmpty(strokesRef.current.length === 0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);

    const { x, y } = pointAt(e);
    const point: InkPoint = { x, y, w: weight };
    currentRef.current = [point];
    lastRef.current = point;
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!currentRef.current) return;
    e.preventDefault();

    const { x, y } = pointAt(e);
    const last = lastRef.current;
    if (!last) return;

    const distance = Math.hypot(x - last.x, y - last.y);
    // Discard sub-pixel jitter: without this a held-still mouse packs hundreds
    // of near-identical samples into the stroke and the smoothing has nothing
    // to work with.
    if (distance < 0.7) return;

    const point: InkPoint = { x, y, w: nibWidth(distance, weight, last.w) };
    currentRef.current.push(point);
    lastRef.current = point;
    redraw();
  };

  const endStroke = (e: React.PointerEvent) => {
    if (!currentRef.current) return;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    strokesRef.current = [...strokesRef.current, currentRef.current];
    currentRef.current = null;
    lastRef.current = null;
    redraw();
    commit();
  };

  const undo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
    commit();
  };

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    lastRef.current = null;
    redraw();
    commit();
  };

  return (
    <div className="sign-pad">
      <div className="sign-pad-surface" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          aria-label={t('sign.pad.aria')}
          role="img"
        />
        {isEmpty && <span className="sign-pad-hint">{t('sign.pad.hint')}</span>}
        {/* A ruled line to sign on, the way a paper form gives you one. */}
        <span className="sign-pad-rule" aria-hidden="true" />
      </div>

      <div className="sign-pad-actions">
        <button
          className="btn btn-secondary btn-sm"
          onClick={undo}
          disabled={isEmpty}
        >
          <Undo2 size={13} /> {t('sign.pad.undo')}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={clear}
          disabled={isEmpty}
        >
          <Eraser size={13} /> {t('sign.pad.clear')}
        </button>
      </div>
    </div>
  );
}
