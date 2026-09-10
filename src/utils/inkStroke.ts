/**
 * Mouse-drawn signatures, kept as strokes rather than as a bitmap.
 *
 * The obvious implementation is to let the user scribble straight onto a canvas
 * and keep the canvas. This keeps the list of points instead, and rasterises on
 * demand, for two reasons. A stamp gets scaled up and down on the page and
 * exported into a PDF that may be printed, so it has to be re-rendered at
 * whatever resolution the moment needs rather than resampled from a 300px
 * scribble. And a saved signature that is a few hundred coordinates costs
 * nothing to store next to a re-encoded PNG of the same mark.
 */

export interface InkPoint {
  x: number;
  y: number;
  /** Half-width of the nib at this point, in the same units as x and y. */
  w: number;
}

export type InkStroke = InkPoint[];

/** How much of the previous width carries into the next sample. */
const WIDTH_SMOOTHING = 0.6;

/**
 * Width from speed, which is the cheapest convincing stand-in for pressure on a
 * mouse. A pen slows at the turns and corners of a signature and speeds through
 * the long connecting sweeps, so mapping slow to thick reproduces the weight
 * distribution of real handwriting closely enough to read as ink rather than as
 * a uniform tube.
 */
export function nibWidth(distance: number, base: number, previous: number | null): number {
  const target = base * (1.4 - Math.min(1, distance / (base * 6)) * 0.9);
  if (previous === null) return target;
  return previous * WIDTH_SMOOTHING + target * (1 - WIDTH_SMOOTHING);
}

export interface InkBounds { minX: number; minY: number; maxX: number; maxY: number }

/** Tight box around every stroke, widened by each point's own nib width. */
export function strokeBounds(strokes: InkStroke[]): InkBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x - p.w < minX) minX = p.x - p.w;
      if (p.x + p.w > maxX) maxX = p.x + p.w;
      if (p.y - p.w < minY) minY = p.y - p.w;
      if (p.y + p.w > maxY) maxY = p.y + p.w;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Draw the strokes into an existing context.
 *
 * Each pair of samples is its own stroked segment rather than one long path,
 * because the width changes along the stroke and a single path can only carry
 * one lineWidth. Round caps and joins hide the seams between segments; without
 * them the varying width would show as a chain of visible steps.
 *
 * The curve through the samples is the usual midpoint quadratic: each segment
 * runs between the midpoints of consecutive sample pairs, using the shared
 * sample as its control point. That gives a continuous tangent at every join
 * without needing to fit anything, which matters because this runs on every
 * pointermove while drawing.
 */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: InkStroke[],
  color: string,
  offsetX = 0,
  offsetY = 0,
  scale = 1,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;

    const at = (p: InkPoint) => ({
      x: (p.x - offsetX) * scale,
      y: (p.y - offsetY) * scale,
      w: p.w * scale,
    });

    // A tap with no travel still has to leave a mark, or dotting an i does
    // nothing.
    if (stroke.length === 1) {
      const p = at(stroke[0]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.w), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    for (let i = 1; i < stroke.length; i++) {
      const prev = at(stroke[i - 1]);
      const curr = at(stroke[i]);
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;

      ctx.beginPath();
      ctx.lineWidth = Math.max(0.5, (prev.w + curr.w));
      if (i === 1) {
        ctx.moveTo(prev.x, prev.y);
      } else {
        const before = at(stroke[i - 2]);
        ctx.moveTo((before.x + prev.x) / 2, (before.y + prev.y) / 2);
      }
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      ctx.stroke();
    }

    // The midpoint scheme stops half a sample short of the end, which is
    // visible as a clipped tail on a fast flourish.
    const last = at(stroke[stroke.length - 1]);
    const beforeLast = at(stroke[stroke.length - 2]);
    ctx.beginPath();
    ctx.lineWidth = Math.max(0.5, last.w * 2);
    ctx.moveTo((beforeLast.x + last.x) / 2, (beforeLast.y + last.y) / 2);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Rasterise at an arbitrary resolution, trimmed to the ink.
 *
 * `pixelsPerUnit` is what makes this worth keeping as strokes: the pad draws at
 * screen scale while you sign, and export calls the same function again at
 * several times that so the mark stays crisp in the exported PDF.
 */
export function rasteriseStrokes(
  strokes: InkStroke[],
  color: string,
  pixelsPerUnit: number,
  padding = 2,
): ImageData | null {
  const bounds = strokeBounds(strokes);
  if (!bounds) return null;

  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + padding * 2) * pixelsPerUnit));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + padding * 2) * pixelsPerUnit));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  paintStrokes(ctx, strokes, color, bounds.minX - padding, bounds.minY - padding, pixelsPerUnit);
  return ctx.getImageData(0, 0, width, height);
}

/** Aspect ratio of the ink, for sizing the stamp when it is first placed. */
export function strokeAspect(strokes: InkStroke[]): number {
  const b = strokeBounds(strokes);
  if (!b) return 3;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  return h > 0 ? w / h : 3;
}
