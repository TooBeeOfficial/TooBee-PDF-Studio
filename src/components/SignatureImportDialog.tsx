import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, HelpCircle, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BACKGROUND_METHODS,
  methodInfo,
  DEFAULT_BACKGROUND_OPTIONS,
  ModelPackMissingError,
  cropToImageData,
  imageDataToCanvas,
  imageDataToPngBytes,
  removeBackground,
  trimTransparent,
  type BackgroundMethod,
  type BackgroundMethodInfo,
  type BackgroundOptions,
  type CropRect,
} from '../utils/signatureImage';

/**
 * Import a picture of a signature, crop it, and lift it off its paper.
 *
 * Two steps in one dialog, in the order the user asked for: crop first, cut out
 * second. That order is not arbitrary — every cutout method is sensitive to
 * what else is in frame. The flood fill seeds from the corners, so a desk edge
 * left in the picture changes what it treats as background; the brightness key
 * gets its useful range from the histogram of what remains. Cropping to the
 * signature first makes both behave predictably.
 */

interface Props {
  open: boolean;
  onCancel: () => void;
  /** Handed a trimmed, transparent PNG plus its natural aspect ratio. */
  onAccept: (png: Uint8Array, aspect: number) => void;
}

/** Preview runs on a downscale — full resolution is only paid for on accept. */
const PREVIEW_MAX = 720;

/**
 * The tolerance actually in force. Methods have different ranges, so a value
 * carried over from another one can sit outside this method's — in which case
 * the slider pinned to its end while the number beside it read something else.
 */
function clampTolerance(value: number, info: BackgroundMethodInfo): number {
  return Math.min(info.toleranceMax, Math.max(info.toleranceMin, value));
}

type Step = 'crop' | 'cutout';
type Handle = 'nw' | 'ne' | 'se' | 'sw' | 'move' | null;

export default function SignatureImportDialog({ open, onCancel, onAccept }: Props) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [step, setStep] = useState<Step>('crop');
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [method, setMethod] = useState<BackgroundMethod>('threshold');
  const [options, setOptions] = useState<BackgroundOptions>(DEFAULT_BACKGROUND_OPTIONS);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zoom is a multiplier on top of the fit-to-frame scale, and pan is an offset
  // in frame pixels away from centred. Keeping them separate from the fit means
  // the image stays framed correctly when the dialog is resized.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; origin: CropRect } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);

  const { t } = useTranslation();
  const info = methodInfo(method);
  // Hoisted rather than called at the point of use: the <img> that wants it is
  // behind two conditionals, and a hook cannot live under one.
  const bitmapUrl = useObjectUrl(bitmap);

  const reset = useCallback(() => {
    setBitmap(prev => { prev?.close(); return null; });
    setStep('crop');
    setCrop(null);
    setMethod('threshold');
    setOptions(DEFAULT_BACKGROUND_OPTIONS);
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setError(null);
    setBusy(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => { if (!open) reset(); }, [open, reset]);

  // The dialog opens straight into the OS file picker: there is nothing to
  // decide on an empty first screen, so showing one would be a step that only
  // ever gets clicked through.
  useEffect(() => {
    if (open && !bitmap) fileRef.current?.click();
  }, [open, bitmap]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      // The picker was dismissed, so there is nothing to come back to.
      onCancel();
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      setBitmap(bmp);
      setCrop({ x: 0, y: 0, width: bmp.width, height: bmp.height });
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setError(null);
    } catch {
      setError(t('sign.import.errRead'));
    }
  };

  /* ─── Crop geometry ────────────────────────────────────────────────────────
     The image is shown letterboxed inside a fixed frame, so display pixels and
     source pixels differ by a single scale factor. Everything the pointer does
     is in display space; the crop is stored in source space, which is what the
     cut-out step needs and what stays correct if the frame is ever resized. */

  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const r = frame.getBoundingClientRect();
      setFrameSize({ width: r.width, height: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [bitmap, step]);

  const view = useMemo(() => {
    if (!bitmap || !frameSize.width || !frameSize.height) return null;
    const fit = Math.min(frameSize.width / bitmap.width, frameSize.height / bitmap.height);
    const scale = fit * zoom;
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    return {
      fit,
      scale,
      width,
      height,
      offsetX: (frameSize.width - width) / 2 + pan.x,
      offsetY: (frameSize.height - height) / 2 + pan.y,
    };
  }, [bitmap, frameSize, zoom, pan]);

  const toSource = (clientX: number, clientY: number) => {
    const frame = frameRef.current!.getBoundingClientRect();
    const v = view!;
    return {
      x: (clientX - frame.left - v.offsetX) / v.scale,
      y: (clientY - frame.top - v.offsetY) / v.scale,
    };
  };

  const clampCrop = (rect: CropRect): CropRect => {
    if (!bitmap) return rect;
    // Normalise first: dragging up or left produces negative extents.
    let { x, y, width, height } = rect;
    if (width < 0) { x += width; width = -width; }
    if (height < 0) { y += height; height = -height; }
    x = Math.max(0, Math.min(x, bitmap.width - 1));
    y = Math.max(0, Math.min(y, bitmap.height - 1));
    width = Math.max(4, Math.min(width, bitmap.width - x));
    height = Math.max(4, Math.min(height, bitmap.height - y));
    return { x, y, width, height };
  };

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 12;
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  /**
   * Zoom about a point, so whatever is under the cursor stays under it.
   *
   * Zooming about the centre of the frame is the easy version and the wrong
   * one: at high magnification the detail you are trying to reach slides out of
   * view as soon as you scroll. `anchor` is in client coordinates.
   */
  const zoomAbout = useCallback((nextZoomRaw: number, anchor: { x: number; y: number }) => {
    if (!bitmap || !view || !frameRef.current) return;
    const nextZoom = clampZoom(nextZoomRaw);
    if (nextZoom === zoom) return;

    const rect = frameRef.current.getBoundingClientRect();
    const localX = anchor.x - rect.left;
    const localY = anchor.y - rect.top;

    // The source pixel currently under the anchor.
    const sx = (localX - view.offsetX) / view.scale;
    const sy = (localY - view.offsetY) / view.scale;

    // Where centring alone would put the image at the new zoom, and therefore
    // what pan has to be for that same source pixel to land back on the anchor.
    const scale = view.fit * nextZoom;
    const centredX = (frameSize.width - bitmap.width * scale) / 2;
    const centredY = (frameSize.height - bitmap.height * scale) / 2;

    setZoom(nextZoom);
    setPan({ x: localX - sx * scale - centredX, y: localY - sy * scale - centredY });
  }, [bitmap, view, zoom, frameSize]);

  const chooseMethod = (next: BackgroundMethod) => {
    setMethod(next);
    const info = methodInfo(next);
    if (info.hasTolerance) setOptions(o => ({ ...o, tolerance: info.toleranceDefault }));
  };

  const onFrameWheel = (e: React.WheelEvent) => {
    if (step !== 'crop' || !view) return;
    e.preventDefault();
    // Same exponential response as the page previews, so the two feel alike.
    const raw = e.deltaY;
    const pixels = e.deltaMode === 1 ? raw * 16 : e.deltaMode === 2 ? raw * 400 : raw;
    zoomAbout(zoom * Math.exp(-pixels * 0.0022), { x: e.clientX, y: e.clientY });
  };

  /** Zoom buttons act on the middle of the frame, which is what is being read. */
  const zoomByButton = (direction: 1 | -1) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAbout(direction > 0 ? zoom * 1.25 : zoom / 1.25, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const fitToFrame = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    if (!view || !crop) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSource(e.clientX, e.clientY);
    dragRef.current = { handle, startX: p.x, startY: p.y, origin: crop };
  };

  const startNewCrop = (e: React.PointerEvent) => {
    if (!view) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    // Middle button or Alt pans instead of drawing a crop. The left button on
    // its own has to keep meaning "draw a crop", which is the common action.
    if (e.button === 1 || e.altKey) {
      panRef.current = { startX: e.clientX, startY: e.clientY, origin: pan };
      return;
    }

    const p = toSource(e.clientX, e.clientY);
    dragRef.current = { handle: 'se', startX: p.x, startY: p.y, origin: { x: p.x, y: p.y, width: 0, height: 0 } };
    setCrop({ x: p.x, y: p.y, width: 4, height: 4 });
  };

  const onDragMove = (e: React.PointerEvent) => {
    const panning = panRef.current;
    if (panning) {
      setPan({
        x: panning.origin.x + (e.clientX - panning.startX),
        y: panning.origin.y + (e.clientY - panning.startY),
      });
      return;
    }

    const drag = dragRef.current;
    if (!drag || !view) return;
    const p = toSource(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const o = drag.origin;

    let next: CropRect;
    switch (drag.handle) {
      case 'move': next = { ...o, x: o.x + dx, y: o.y + dy }; break;
      case 'nw': next = { x: o.x + dx, y: o.y + dy, width: o.width - dx, height: o.height - dy }; break;
      case 'ne': next = { x: o.x, y: o.y + dy, width: o.width + dx, height: o.height - dy }; break;
      case 'sw': next = { x: o.x + dx, y: o.y, width: o.width - dx, height: o.height + dy }; break;
      case 'se': next = { x: o.x, y: o.y, width: o.width + dx, height: o.height + dy }; break;
      default: return;
    }
    setCrop(clampCrop(next));
  };

  const endDrag = () => { dragRef.current = null; panRef.current = null; };

  /* ─── Cut-out preview ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (step !== 'cutout' || !bitmap || !crop) return;

    let cancelled = false;
    setBusy(true);
    setError(null);

    // Debounced, because both sliders emit continuously while dragged and the
    // flood fill in particular is not something to run on every input event.
    const timer = window.setTimeout(async () => {
      try {
        const scale = Math.min(1, PREVIEW_MAX / Math.max(crop.width, crop.height));
        const full = cropToImageData(bitmap, crop);
        const cut = await removeBackground(
          scale < 1 ? downscale(full, scale) : full,
          method,
          options,
        );
        if (cancelled) return;

        const canvas = imageDataToCanvas(cut);
        canvas.toBlob(blob => {
          if (cancelled || !blob) return;
          setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        }, 'image/png');
      } catch (e: unknown) {
        if (cancelled) return;
        setError(
          e instanceof ModelPackMissingError
            ? e.message
            : e instanceof Error ? e.message : t('sign.import.errProcess'),
        );
        setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 180);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [step, bitmap, crop, method, options]);

  const accept = async () => {
    if (!bitmap || !crop) return;
    setBusy(true);
    try {
      // Full resolution this time, and trimmed, so the stamp's box is the ink
      // rather than whatever slack the crop left around it.
      const cut = await removeBackground(cropToImageData(bitmap, crop), method, options);
      const trimmed = trimTransparent(cut);
      const png = await imageDataToPngBytes(trimmed);
      onAccept(png, trimmed.width / trimmed.height);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('sign.import.errProcess'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const rectStyle = view && crop
    ? {
        left: view.offsetX + crop.x * view.scale,
        top: view.offsetY + crop.y * view.scale,
        width: crop.width * view.scale,
        height: crop.height * view.scale,
      }
    : undefined;

  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('sign.import.cropTitle')}>
        <div className="modal-head">
          <h2>{step === 'crop' ? t('sign.import.cropTitle') : t('sign.import.cutTitle')}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onCancel} aria-label={t('common.cancel')}>
            <X size={16} />
          </button>
        </div>

        <input type="file" ref={fileRef} hidden accept="image/*" onChange={pick} />

        {!bitmap ? (
          <p className="hint">{t('sign.import.choose')}</p>
        ) : (
          <>
            <div
              className={`crop-frame ${step === 'cutout' ? 'is-preview' : ''}`}
              ref={frameRef}
              onWheel={onFrameWheel}
              onPointerDown={step === 'crop' ? startNewCrop : undefined}
              onPointerMove={step === 'crop' ? onDragMove : undefined}
              onPointerUp={step === 'crop' ? endDrag : undefined}
              onPointerCancel={step === 'crop' ? endDrag : undefined}
              onContextMenu={e => e.preventDefault()}
            >
              {step === 'crop' ? (
                <>
                  {view && (
                    <img
                      className="crop-image"
                      src={bitmapUrl}
                      alt=""
                      draggable={false}
                      style={{ left: view.offsetX, top: view.offsetY, width: view.width, height: view.height }}
                    />
                  )}
                  {rectStyle && (
                    <div className="crop-rect" style={rectStyle} onPointerDown={startDrag('move')} onPointerMove={onDragMove} onPointerUp={endDrag}>
                      {(['nw', 'ne', 'se', 'sw'] as const).map(h => (
                        <span
                          key={h}
                          className={`crop-handle crop-handle-${h}`}
                          onPointerDown={startDrag(h)}
                          onPointerMove={onDragMove}
                          onPointerUp={endDrag}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                preview && <img className="crop-preview" src={preview} alt={t('sign.import.cutTitle')} />
              )}
              {busy && <div className="crop-busy"><span className="spin" /></div>}
            </div>

            {step === 'crop' && (
              <div className="crop-toolbar">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => zoomByButton(-1)} aria-label={t('common.zoomOut')}>
                  <ZoomOut size={14} />
                </button>
                <span className="crop-zoom-value num">{Math.round(zoom * 100)}%</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => zoomByButton(1)} aria-label={t('common.zoomIn')}>
                  <ZoomIn size={14} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={fitToFrame} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}>
                  {t('common.fit')}
                </button>
                <span className="crop-hint">{t('sign.import.panHint')}</span>
              </div>
            )}

            {step === 'cutout' && (
              <>
                <div className="field">
                  <label>{t('sign.cutout.method')}</label>
                  <div className="segmented">
                    {BACKGROUND_METHODS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => chooseMethod(m.id)}
                        aria-pressed={method === m.id}
                        title={t(`sign.cutout.${m.id}.blurb`)}
                      >
                        {t(`sign.cutout.${m.id}.label`)}
                      </button>
                    ))}
                  </div>
                  <p className="hint">{t(`sign.cutout.${method}.blurb`)}</p>
                </div>

                {/* Only shown where it does something. The automatic method has
                    no threshold to set, and offering a dead slider under a name
                    borrowed from the control below it was worse than useless. */}
                {info.hasTolerance && (
                  <div className="field">
                    <label htmlFor="cut-tolerance" title={t(`sign.cutout.${method}.toleranceHelp`)}>
                      {t(`sign.cutout.${method}.toleranceLabel`)}{' '}
                      <span className="num">{clampTolerance(options.tolerance, info)}</span>
                      <HelpCircle size={12} className="field-help" aria-hidden="true" />
                    </label>
                    <input
                      id="cut-tolerance"
                      type="range"
                      min={info.toleranceMin}
                      max={info.toleranceMax}
                      value={clampTolerance(options.tolerance, info)}
                      aria-describedby="cut-tolerance-help"
                      onChange={e => setOptions(o => ({ ...o, tolerance: +e.target.value }))}
                    />
                    <p className="hint" id="cut-tolerance-help">
                      {t(`sign.cutout.${method}.toleranceHelp`)}
                    </p>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="cut-feather" title={t('sign.cutout.featherHelp')}>
                    {t('sign.cutout.featherLabel')} <span className="num">{options.feather}</span>
                    <HelpCircle size={12} className="field-help" aria-hidden="true" />
                  </label>
                  <input
                    id="cut-feather"
                    type="range"
                    min={0}
                    max={64}
                    value={options.feather}
                    aria-describedby="cut-feather-help"
                    onChange={e => setOptions(o => ({ ...o, feather: +e.target.value }))}
                  />
                  <p className="hint" id="cut-feather-help">{t('sign.cutout.featherHelp')}</p>
                </div>
              </>
            )}

            {error && <p className="hint hint-danger">{error}</p>}

            <div className="modal-actions">
              {step === 'crop' ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setCrop({ x: 0, y: 0, width: bitmap.width, height: bitmap.height })}
                  >
                    <Maximize2 size={14} /> {t('sign.import.wholeImage')}
                  </button>
                  <button className="btn btn-primary" onClick={() => setStep('cutout')} disabled={!crop}>
                    {t('sign.import.next')}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={() => setStep('crop')}>
                    <ArrowLeft size={14} /> {t('sign.import.back')}
                  </button>
                  <button className="btn btn-primary" onClick={accept} disabled={busy || !preview}>
                    <Check size={14} /> {t('sign.import.use')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Box-filter downscale, so the preview costs a fraction of the full image. */
function downscale(data: ImageData, scale: number): ImageData {
  const canvas = imageDataToCanvas(data);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(data.width * scale));
  out.height = Math.max(1, Math.round(data.height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) return data;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return ctx.getImageData(0, 0, out.width, out.height);
}

/** Keeps one object URL alive per bitmap, for the crop step's <img>. */
function useObjectUrl(bitmap: ImageBitmap | null): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!bitmap) { setUrl(''); return; }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    let revoke = '';
    canvas.toBlob(blob => {
      if (!blob) return;
      revoke = URL.createObjectURL(blob);
      setUrl(revoke);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [bitmap]);
  return url;
}
