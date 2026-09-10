/**
 * Turning an arbitrary picture into something that can be stamped on a page.
 *
 * A signature stamp sits on top of whatever is already printed under it, so the
 * one thing that matters here is the alpha channel: the paper the signature was
 * photographed on has to become transparent, or the stamp lands as a white
 * rectangle covering the document.
 *
 * Three ways to do that are offered, because no single one is right for every
 * source. They share one signature so the picker in the import dialog can swap
 * between them and re-preview without the caller knowing which is which.
 */

export type BackgroundMethod = 'threshold' | 'flood' | 'auto';

export interface BackgroundOptions {
  /** 0-255. Threshold: how light counts as paper. Flood: how far a colour may
   *  drift from the sampled corner and still count as the same background. */
  tolerance: number;
  /** Softens the alpha edge so the stroke does not end in hard jaggies. */
  feather: number;
}

export const DEFAULT_BACKGROUND_OPTIONS: BackgroundOptions = { tolerance: 200, feather: 24 };

/**
 * What each method is and which controls apply to it.
 *
 * Text lives in the locale files, not here; these are the i18n keys under
 * `sign.cutout`. Keeping the copy out of this module means the same table
 * drives every language, and it is what caught the bug that made two sliders
 * share a name.
 *
 * `hasTolerance` is the important field. The automatic method runs a model that
 * decides for itself what is background, so there is nothing for a tolerance to
 * mean — it was previously shown a slider that changed nothing, under a label
 * identical to the one below it.
 */
export interface BackgroundMethodInfo {
  id: BackgroundMethod;
  /** Whether the first slider does anything for this method. */
  hasTolerance: boolean;
  toleranceMin: number;
  toleranceMax: number;
  /** Sensible starting point, since the useful range differs per method. */
  toleranceDefault: number;
}

export const BACKGROUND_METHODS: BackgroundMethodInfo[] = [
  { id: 'threshold', hasTolerance: true, toleranceMin: 1, toleranceMax: 255, toleranceDefault: 200 },
  { id: 'flood', hasTolerance: true, toleranceMin: 1, toleranceMax: 160, toleranceDefault: 60 },
  { id: 'auto', hasTolerance: false, toleranceMin: 0, toleranceMax: 0, toleranceDefault: 0 },
];

export function methodInfo(id: BackgroundMethod): BackgroundMethodInfo {
  return BACKGROUND_METHODS.find(m => m.id === id) ?? BACKGROUND_METHODS[0];
}

/**
 * Rec. 709 luma. Matches how the eye weights the channels, so a mid-yellow
 * reads as light (which it is) rather than as mid-grey.
 */
function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Everything lighter than `tolerance` becomes transparent, everything darker
 * stays. `feather` widens that into a ramp rather than a cliff, so the
 * antialiased edge pixels of a pen stroke fade out instead of turning into a
 * stair-step outline.
 */
function keyByBrightness(src: ImageData, { tolerance, feather }: BackgroundOptions): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const soft = Math.max(1, feather);
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d[i], d[i + 1], d[i + 2]);
    // 0 at (tolerance - soft) and below, so fully opaque; 1 at tolerance and
    // above, so fully clear.
    const t = (l - (tolerance - soft)) / soft;
    const alpha = 1 - Math.min(1, Math.max(0, t));
    d[i + 3] = Math.round(d[i + 3] * alpha);
  }
  return out;
}

/**
 * Flood fill inward from all four corners, clearing anything within `tolerance`
 * of the colour it started on.
 *
 * The difference from the brightness key is that this only removes background
 * that is connected to the edge of the picture. A dark desk behind the paper is
 * removed; a dark loop enclosed by the signature is not, however light the ink
 * around it happens to be. That connectivity is the whole point, and it is the
 * one thing a brightness key cannot express.
 *
 * Iterative rather than recursive: a full-page scan is millions of pixels deep
 * and would blow the call stack.
 */
function keyByFlood(src: ImageData, { tolerance, feather }: BackgroundOptions): ImageData {
  const { width: w, height: h } = src;
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  const d = out.data;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];

  const seeds = [0, w - 1, (h - 1) * w, h * w - 1];
  const refs = seeds.map(p => [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]] as const);

  for (const p of seeds) {
    if (!seen[p]) {
      seen[p] = 1;
      stack.push(p);
    }
  }

  // Squared distances throughout, to keep Math.sqrt out of the inner loop.
  const limit = tolerance * tolerance;
  const ramp = Math.max(1, feather) ** 2;
  const edge = Math.max(0, limit - ramp);

  while (stack.length) {
    const p = stack.pop() as number;
    const i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];

    let best = Infinity;
    for (const ref of refs) {
      const dist = (r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2;
      if (dist < best) best = dist;
    }
    // Too far from every corner colour: this is subject, not background, and
    // the fill stops here rather than leaking through it.
    if (best > limit) continue;

    // Fade out over the last part of the tolerance range, so the boundary
    // between kept and cleared is a ramp rather than a hard cut.
    const alpha = best <= edge ? 0 : Math.min(1, (best - edge) / Math.max(1, limit - edge));
    d[i + 3] = Math.round(d[i + 3] * alpha);

    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0 && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
    if (x < w - 1 && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
    if (y > 0 && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
    if (y < h - 1 && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
  }

  return out;
}

/** Raised when the automatic cutout is asked for but its model pack is absent. */
export class ModelPackMissingError extends Error {
  constructor() {
    super(
      'The automatic cutout could not load its model. Use Brightness or Edge colour instead.',
    );
    this.name = 'ModelPackMissingError';
  }
}

/**
 * Where the model weights are served from.
 *
 * Two origins, because the renderer has two. Under the dev server it is an http
 * origin and the files sit in public/, so a relative path works. In the packaged
 * app it is file:, where Chromium refuses fetch() outright — so the main process
 * exposes the same directory over a custom scheme that fetch will accept. See
 * registerModelProtocol in electron/main.ts.
 */
function modelBase(): string {
  return window.location.protocol === 'file:'
    ? 'bgmodel://assets/'
    : new URL('bg-removal/', window.location.href).href;
}

type RemoveFn = (input: Blob, config?: Record<string, unknown>) => Promise<Blob>;

/**
 * Machine-learning cutout.
 *
 * The import is still guarded, because the model pack is an optional dependency:
 * a checkout that skipped it, or a build where the sync script found nothing to
 * copy, should degrade to a note pointing at the other two methods rather than a
 * button that throws.
 *
 * `publicPath` is pinned to the app's own origin. Left unset, the library
 * defaults to the vendor's CDN, which would make the feature silently require a
 * network — the one thing it must never do.
 */
async function keyByModel(src: ImageData, { feather }: BackgroundOptions): Promise<ImageData> {
  let removeBg: RemoveFn;
  try {
    const mod = await import(/* @vite-ignore */ '@imgly/background-removal');
    removeBg = (mod as unknown as { removeBackground: RemoveFn }).removeBackground;
    if (typeof removeBg !== 'function') throw new Error('entry point missing');
  } catch {
    throw new ModelPackMissingError();
  }

  const blob = await canvasToBlob(imageDataToCanvas(src));
  let cut: Blob;
  try {
    cut = await removeBg(blob, {
      publicPath: modelBase(),
      // The 44 MB model rather than the 88 MB one: this app has to stay usable
      // on old hardware, and on a high-contrast mark on paper the larger model
      // earns very little for twice the memory and inference cost.
      model: 'small',
      output: { format: 'image/png', quality: 1 },
    });
  } catch (e: unknown) {
    // The import succeeding only proves the library is present. Its weights are
    // fetched separately and can be absent on their own — a build whose sync
    // step found nothing to copy, or a packaged app missing the directory. The
    // library reports that as a message about publicPath, which would mean
    // nothing to the person looking at the dialog.
    const message = e instanceof Error ? e.message : String(e);
    if (/publicPath|Resource|fetch|404|not found/i.test(message)) {
      throw new ModelPackMissingError();
    }
    throw e;
  }

  const bitmap = await createImageBitmap(cut);
  const dest = document.createElement('canvas');
  dest.width = bitmap.width;
  dest.height = bitmap.height;
  const ctx = dest.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D context.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const data = ctx.getImageData(0, 0, dest.width, dest.height);
  // The model returns a fairly hard matte. Applying the same feather control
  // the other two methods expose as an alpha gamma means the slider does
  // something predictable whichever method is selected.
  if (feather > 0) {
    const gamma = 1 + feather / 128;
    const d = data.data;
    for (let i = 3; i < d.length; i += 4) {
      d[i] = Math.round(255 * Math.pow(d[i] / 255, gamma));
    }
  }
  return data;
}

export async function removeBackground(
  src: ImageData,
  method: BackgroundMethod,
  options: BackgroundOptions,
): Promise<ImageData> {
  if (method === 'threshold') return keyByBrightness(src, options);
  if (method === 'flood') return keyByFlood(src, options);
  return keyByModel(src, options);
}

/* ─── Canvas plumbing ─────────────────────────────────────────────────────── */

export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D context.');
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not read the image back out of the canvas.'));
    }, 'image/png');
  });
}

/** Crop rectangle, in source-pixel coordinates. */
export interface CropRect { x: number; y: number; width: number; height: number }

export function cropToImageData(source: CanvasImageSource, rect: CropRect): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D context.');
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Shrink-wrap the picture to the pixels that survived the cutout.
 *
 * Without this the stamp carries however much empty paper the crop happened to
 * include, so its on-page box would not match the ink inside it and placing it
 * against a printed signature line would be guesswork.
 */
export function trimTransparent(data: ImageData, alphaFloor = 8): ImageData {
  const { width: w, height: h, data: d } = data;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > alphaFloor) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Nothing survived. Hand back the original rather than a zero-sized canvas,
  // so the dialog can show the empty result and the user can back the tolerance
  // off, instead of being met with an error.
  if (maxX < 0) return data;

  return cropToImageData(imageDataToCanvas(data), {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  });
}

export async function imageDataToPngBytes(data: ImageData): Promise<Uint8Array> {
  const blob = await canvasToBlob(imageDataToCanvas(data));
  return new Uint8Array(await blob.arrayBuffer());
}

export function pngBytesToUrl(bytes: Uint8Array): string {
  // Copy into a fresh buffer: the caller's view may be backed by a larger
  // ArrayBuffer that is reused elsewhere, and Blob would capture all of it.
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
}

/** Reads a picked file into something drawable, at its natural pixel size. */
export function fileToBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}
