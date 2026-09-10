import type { InkStroke } from './inkStroke';

/**
 * What can be placed on a page, and where it sits.
 *
 * Geometry is in PDF points with the origin at the page's top-left, y running
 * down. That is the screen's convention rather than the PDF's, and it is the
 * one chosen deliberately: every interaction in this page — dragging, the
 * resize handles, the rotate ring, hit-testing — is expressed in it, and only
 * the export flips into PDF space, once, in a single well-commented place. The
 * earlier version stored percentages of page size, which cannot survive a
 * resize handle: scaling a percentage-width box on a page whose aspect differs
 * from the box's would shear it.
 *
 * A stamp is anchored by its centre, not a corner, because rotation and both
 * flips are all defined about the centre. Anchoring anywhere else means every
 * one of those operations has to move the anchor to compensate.
 */

export type StampKind = 'text' | 'ink' | 'image';

export interface Stamp {
  id: string;
  kind: StampKind;
  /** 1-based, matching the page navigation. */
  page: number;

  /** Centre, in points from the page's top-left. */
  cx: number;
  cy: number;
  /** Size before rotation, in points. */
  w: number;
  h: number;
  /** Clockwise as seen on screen, in degrees. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;

  /* text only */
  text?: string;
  font?: string;
  color?: string;
  fontSize?: number;

  /* ink and image only */
  png?: Uint8Array;
  /** Object URL over `png`, for the on-screen preview. Not persisted. */
  url?: string;
  /** Kept for ink so it can be re-rasterised crisply at export resolution. */
  strokes?: InkStroke[];
}

/** A stamp saved to the library for reuse, minus anything page-specific. */
export interface SavedSignature {
  id: string;
  kind: StampKind;
  label: string;
  /** Milliseconds since the epoch, for ordering the library newest-first. */
  created: number;
  /** Natural aspect ratio (w / h), so a reused stamp keeps its proportions. */
  aspect: number;

  text?: string;
  font?: string;
  color?: string;
  /** Base64 PNG. Base64 rather than raw bytes because this round-trips through
   *  JSON on disk, and because it is what an <img> src can take directly. */
  png?: string;
  strokes?: InkStroke[];
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** Corner offsets from the centre, before rotation. */
const CORNERS = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
] as const;

export interface Vec { x: number; y: number }

/** Rotate `v` clockwise by `deg` (screen convention: y runs down). */
export function rotateVec(v: Vec, deg: number): Vec {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** The stamp's four corners in page space, rotation included. */
export function stampCorners(stamp: Stamp): Vec[] {
  return CORNERS.map(([fx, fy]) => {
    const local = { x: fx * stamp.w, y: fy * stamp.h };
    const spun = rotateVec(local, stamp.rotation);
    return { x: stamp.cx + spun.x, y: stamp.cy + spun.y };
  });
}

/**
 * Axis-aligned box that contains the rotated stamp. Used to keep a stamp from
 * being dragged entirely off the page, where it would be unreachable.
 */
export function stampAABB(stamp: Stamp) {
  const pts = stampCorners(stamp);
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** True if a page-space point falls inside the rotated stamp. */
export function hitTest(stamp: Stamp, point: Vec): boolean {
  // Rotate the point back into the stamp's own frame, where the test is a
  // plain rectangle comparison.
  const local = rotateVec({ x: point.x - stamp.cx, y: point.y - stamp.cy }, -stamp.rotation);
  return Math.abs(local.x) <= stamp.w / 2 && Math.abs(local.y) <= stamp.h / 2;
}

/**
 * Nudge a stamp back until some of it overlaps the page again.
 *
 * Deliberately permissive: a signature is often meant to hang off the edge a
 * little, so this only intervenes once the whole thing has left, and then only
 * far enough to leave a graspable margin on screen.
 */
export function clampToPage(stamp: Stamp, pageW: number, pageH: number): Stamp {
  const margin = 12;
  const box = stampAABB(stamp);
  let dx = 0;
  let dy = 0;
  if (box.maxX < margin) dx = margin - box.maxX;
  else if (box.minX > pageW - margin) dx = pageW - margin - box.minX;
  if (box.maxY < margin) dy = margin - box.maxY;
  else if (box.minY > pageH - margin) dy = pageH - margin - box.minY;
  return dx || dy ? { ...stamp, cx: stamp.cx + dx, cy: stamp.cy + dy } : stamp;
}

/** CSS transform that reproduces a stamp's rotation and flips on screen. */
export function stampTransform(stamp: Stamp): string {
  const sx = stamp.flipX ? -1 : 1;
  const sy = stamp.flipY ? -1 : 1;
  return `translate(-50%, -50%) rotate(${stamp.rotation}deg) scale(${sx}, ${sy})`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: String.fromCharCode.apply blows the argument limit somewhere
  // around a hundred thousand entries, and a signature PNG can exceed it.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
