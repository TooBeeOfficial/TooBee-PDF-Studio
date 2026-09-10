import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { rasteriseStrokes } from './inkStroke';
import { imageDataToPngBytes } from './signatureImage';
import type { Stamp } from './stamps';

/**
 * Writing placed stamps into the document.
 *
 * This replaces the page's older text-only apply step, which could embed a font
 * and draw a string and nothing else. Ink and imported images are bitmaps, and
 * both they and typed text now carry a rotation and a size the user set by
 * hand, so all three kinds have to go through one path that understands the
 * same geometry the on-screen overlay does.
 *
 * The whole of the coordinate flip lives in `place()` below. Everywhere else in
 * the feature, including this file's callers, works in screen-like page space:
 * points from the top-left, y running down, rotation clockwise.
 */

export interface CustomFontFile { name: string; bytes: Uint8Array }

/**
 * Pixels per point when re-rasterising ink for export.
 *
 * Ink is kept as strokes precisely so this can be higher than whatever the
 * screen was showing. Four is roughly 288 DPI once placed, which stays sharp in
 * print without producing an image so large it slows the save on the old
 * hardware this app targets.
 */
const INK_EXPORT_SCALE = 4;

/** Ceiling on either dimension of a re-rasterised stroke image. */
const INK_MAX_PIXELS = 2400;

/**
 * Where the text baseline sits above the bottom of the box the overlay draws.
 *
 * pdf-lib anchors drawText at the baseline, while the on-screen box is the full
 * line. Fonts differ, but the descent of the faces offered here clusters close
 * enough to a fifth of the size that measuring per-font would move the mark by
 * well under a point.
 */
const BASELINE_RATIO = 0.21;

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
}

/**
 * Convert a centre-anchored, y-down, clockwise placement into the corner-
 * anchored, y-up, counter-clockwise one pdf-lib wants.
 *
 * pdf-lib rotates about the anchor it is given, not about the middle of what it
 * is drawing, so asking it to rotate a stamp in place means working out where
 * the corner has travelled to and handing it that instead. `localX`/`localY`
 * are the anchor's offset from the centre in the stamp's own unrotated frame,
 * measured in the y-up convention pdf-lib uses.
 */
function place(
  stamp: Stamp,
  pageHeight: number,
  localX: number,
  localY: number,
): { x: number; y: number; rotate: ReturnType<typeof degrees> } {
  // Screen rotation is clockwise; PDF space has y up, which makes the same
  // visual turn a negative angle.
  const theta = (-stamp.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const cx = stamp.cx;
  const cy = pageHeight - stamp.cy;

  return {
    x: cx + localX * cos - localY * sin,
    y: cy + localX * sin + localY * cos,
    rotate: degrees(-stamp.rotation),
  };
}

/**
 * Bake the flips into the pixels.
 *
 * pdf-lib has no mirror option, and expressing one through its transform would
 * mean negative extents whose interaction with the rotation above is not worth
 * the debugging. Flipping the bitmap before embedding is exact, and it costs
 * one canvas pass on an image that is already in hand.
 */
async function applyFlips(png: Uint8Array, flipX: boolean, flipY: boolean): Promise<Uint8Array> {
  if (!flipX && !flipY) return png;

  const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D context.');

  ctx.translate(flipX ? bitmap.width : 0, flipY ? bitmap.height : 0);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return imageDataToPngBytes(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/**
 * Ink is re-rendered from its strokes at export resolution rather than reusing
 * the preview bitmap, which was only ever drawn at screen scale.
 */
async function inkToPng(stamp: Stamp): Promise<Uint8Array | null> {
  if (!stamp.strokes?.length) return stamp.png ?? null;

  const longest = Math.max(stamp.w, stamp.h);
  const scale = Math.min(INK_EXPORT_SCALE, INK_MAX_PIXELS / Math.max(1, longest));
  const data = rasteriseStrokes(stamp.strokes, stamp.color ?? '#000000', Math.max(1, scale));
  if (!data) return stamp.png ?? null;
  return imageDataToPngBytes(data);
}

async function drawBitmap(doc: PDFDocument, page: PDFPage, stamp: Stamp) {
  const source = stamp.kind === 'ink' ? await inkToPng(stamp) : stamp.png ?? null;
  if (!source) return;

  const flipped = await applyFlips(source, stamp.flipX, stamp.flipY);
  const embedded = await doc.embedPng(flipped);
  const { height } = page.getSize();

  // Anchor is the image's bottom-left corner: left of centre, and below it.
  const at = place(stamp, height, -stamp.w / 2, -stamp.h / 2);
  page.drawImage(embedded, {
    x: at.x,
    y: at.y,
    width: stamp.w,
    height: stamp.h,
    rotate: at.rotate,
    opacity: stamp.opacity,
  });
}

function drawTextStamp(page: PDFPage, stamp: Stamp, font: PDFFont) {
  const size = stamp.fontSize ?? stamp.h;
  const text = stamp.text ?? '';
  if (!text) return;

  const { height } = page.getSize();
  const measured = font.widthOfTextAtSize(text, size);

  // Anchor is the start of the baseline: left of centre, and up from the box's
  // bottom edge by the descent.
  const at = place(stamp, height, -measured / 2, -stamp.h / 2 + size * BASELINE_RATIO);
  page.drawText(text, {
    x: at.x,
    y: at.y,
    size,
    font,
    color: hexToRgb(stamp.color ?? '#000000'),
    rotate: at.rotate,
    opacity: stamp.opacity,
  });
}

/**
 * Fonts are embedded once per document and shared by every stamp that asks for
 * them. Embedding per stamp, as the previous version did, wrote a fresh copy of
 * an uploaded typeface into the file for each signature placed with it.
 */
async function buildFontCache(doc: PDFDocument, customFonts: CustomFontFile[]) {
  const cache = new Map<string, PDFFont>();

  return async function fontFor(name: string | undefined): Promise<PDFFont> {
    const key = name ?? 'Helvetica';
    const hit = cache.get(key);
    if (hit) return hit;

    const custom = customFonts.find(f => f.name === key);
    let font: PDFFont;
    if (custom) {
      font = await doc.embedFont(custom.bytes);
    } else if (key === 'TimesRomanItalic') {
      font = await doc.embedFont(StandardFonts.TimesRomanItalic);
    } else if (key === 'CourierBold') {
      font = await doc.embedFont(StandardFonts.CourierBold);
    } else {
      font = await doc.embedFont(StandardFonts.Helvetica);
    }

    cache.set(key, font);
    return font;
  };
}

/**
 * Burn every stamp into the document and hand back the new bytes.
 *
 * Stamps are applied in the order they were placed, so a later one overlaps an
 * earlier one exactly as the overlay showed.
 */
export async function applyStamps(
  pdfBytes: Uint8Array,
  stamps: Stamp[],
  customFonts: CustomFontFile[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes.slice(0));
  // Required before embedFont() will accept anything outside the standard 14
  // faces; without it every uploaded font throws.
  doc.registerFontkit(fontkit);

  const fontFor = await buildFontCache(doc, customFonts);
  const pages = doc.getPages();

  for (const stamp of stamps) {
    const page = pages[stamp.page - 1];
    if (!page) continue;

    if (stamp.kind === 'text') {
      drawTextStamp(page, stamp, await fontFor(stamp.font));
    } else {
      await drawBitmap(doc, page, stamp);
    }
  }

  return doc.save();
}
