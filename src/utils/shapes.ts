/**
 * Shape geometry for the Studio Editor.
 *
 * One generator, two consumers: the on-screen preview renders the returned path
 * in an <svg>, and burnToPdf hands the same string to pdf-lib's drawSvgPath.
 * Because both sides read from here, what you place is what gets written into
 * the PDF — there is no second implementation to drift out of step.
 *
 * Paths are emitted in element-local coordinates: origin at the element's
 * top-left, x right, y DOWN, spanning 0..w by 0..h. That matches both the SVG
 * viewport and the convention drawSvgPath expects.
 */

export type ShapeKind =
  /** Not a shape: the pointer. Clicking the page selects instead of creating. */
  | 'select'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'callout'
  | 'triangle'
  | 'star'
  | 'polygon'
  | 'path';

export interface ShapeMeta {
  kind: ShapeKind;
  label: string;
  /** Closed shapes take a fill; open ones are stroke-only. */
  filled: boolean;
  /** Shows the sides/points control in the inspector. */
  hasPoints?: boolean;
  /** Shows the corner-radius control. */
  hasRadius?: boolean;
}

export const SHAPES: ShapeMeta[] = [
  { kind: 'select', label: 'Select', filled: false },
  { kind: 'text', label: 'Text', filled: true, hasRadius: true },
  { kind: 'rect', label: 'Rectangle', filled: true, hasRadius: true },
  { kind: 'ellipse', label: 'Ellipse', filled: true },
  { kind: 'line', label: 'Line', filled: false },
  { kind: 'arrow', label: 'Arrow', filled: false },
  { kind: 'callout', label: 'Callout', filled: true, hasRadius: true },
  { kind: 'triangle', label: 'Triangle', filled: true },
  { kind: 'polygon', label: 'Polygon', filled: true, hasPoints: true },
  { kind: 'star', label: 'Star', filled: true, hasPoints: true },
  { kind: 'path', label: 'Custom path', filled: true },
];

export function shapeMeta(kind: ShapeKind): ShapeMeta {
  return SHAPES.find(s => s.kind === kind) ?? SHAPES[0];
}

const n = (v: number) => Math.round(v * 100) / 100;

/** Regular polygon vertices inscribed in the box, first point at the top. */
function regularPoints(w: number, h: number, sides: number): [number, number][] {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** Star with alternating outer and inner radii. */
function starPoints(w: number, h: number, points: number, innerRatio = 0.45): [number, number][] {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const outer = i % 2 === 0;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const fx = outer ? 1 : innerRatio;
    pts.push([cx + rx * fx * Math.cos(a), cy + ry * fx * Math.sin(a)]);
  }
  return pts;
}

/**
 * Rotates an already-generated path about (cx, cy).
 *
 * Baking the rotation into the coordinates rather than using a CSS transform on
 * screen and pdf-lib's `rotate` option on export keeps the single-source-of-
 * truth property: one path string still drives both, so there is no chance of
 * the two disagreeing about rotation direction or origin.
 *
 * Only parses the command set this module emits: M, L, A and Z, absolute.
 */
function rotateD(d: string, deg: number, cx: number, cy: number): string {
  if (!deg || !d) return d;
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t), sin = Math.sin(t);
  const rot = (x: number, y: number): [number, number] => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  };

  const tk = d.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tk.length) {
    const cmd = tk[i++];
    if (cmd === 'M' || cmd === 'L') {
      const [x, y] = rot(Number(tk[i++]), Number(tk[i++]));
      out.push(cmd, String(n(x)), String(n(y)));
    } else if (cmd === 'A') {
      const rx = tk[i++], ry = tk[i++];
      // The arc's own x-axis rotation has to advance with the shape.
      const xrot = Number(tk[i++]) + deg;
      const laf = tk[i++], sf = tk[i++];
      const [x, y] = rot(Number(tk[i++]), Number(tk[i++]));
      out.push('A', rx, ry, String(n(xrot)), laf, sf, String(n(x)), String(n(y)));
    } else {
      out.push(cmd);
    }
  }
  return out.join(' ');
}

/** The two endpoints of a line or arrow, in box-local coordinates. */
function endpoints(
  w: number,
  h: number,
  path?: { x: number; y: number }[]
): [[number, number], [number, number]] {
  if (path && path.length >= 2) {
    return [
      [path[0].x * w, path[0].y * h],
      [path[1].x * w, path[1].y * h],
    ];
  }
  return [[0, 0], [w, h]];
}

function polyPath(pts: [number, number][], close = true): string {
  if (!pts.length) return '';
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${n(x)} ${n(y)}`).join(' ');
  return close ? `${d} Z` : d;
}

export interface ShapeOptions {
  /** Corner radius for rect and callout. */
  radius?: number;
  /** Sides for polygon, points for star. */
  points?: number;
  /** Custom path vertices, normalised 0..1 against the element box.
   *  Line and arrow use this too, holding their two endpoints. */
  path?: { x: number; y: number }[];
  /** Clockwise rotation in degrees, about the centre of the box. */
  rotation?: number;
}

/**
 * Returns an SVG path `d` for a shape occupying a w × h box, rotated about the
 * box centre if a rotation is given.
 *
 * Returns '' for `text`, which is drawn by the existing text pipeline and does
 * not support rotation.
 */
export function shapePath(
  kind: ShapeKind,
  w: number,
  h: number,
  opts: ShapeOptions = {}
): string {
  const d = basePath(kind, w, h, opts);
  return opts.rotation ? rotateD(d, opts.rotation, w / 2, h / 2) : d;
}

/** Unrotated geometry. Split out so rotation happens in exactly one place. */
function basePath(
  kind: ShapeKind,
  w: number,
  h: number,
  opts: ShapeOptions = {}
): string {
  if (w <= 0 || h <= 0) return '';

  switch (kind) {
    case 'rect': {
      const r = Math.max(0, Math.min(opts.radius ?? 0, w / 2, h / 2));
      if (r === 0) return `M 0 0 L ${n(w)} 0 L ${n(w)} ${n(h)} L 0 ${n(h)} Z`;
      return [
        `M ${n(r)} 0`,
        `L ${n(w - r)} 0`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}`,
        `L ${n(w)} ${n(h - r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)}`,
        `L ${n(r)} ${n(h)}`,
        `A ${n(r)} ${n(r)} 0 0 1 0 ${n(h - r)}`,
        `L 0 ${n(r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(r)} 0`,
        'Z',
      ].join(' ');
    }

    case 'ellipse': {
      const rx = w / 2, ry = h / 2;
      return [
        `M 0 ${n(ry)}`,
        `A ${n(rx)} ${n(ry)} 0 0 1 ${n(w)} ${n(ry)}`,
        `A ${n(rx)} ${n(ry)} 0 0 1 0 ${n(ry)}`,
        'Z',
      ].join(' ');
    }

    // Both endpoints are placed by the user, so they are stored in `path` and
    // the box is simply their bounding rectangle. Falls back to the box
    // diagonal for anything created before two-point placement existed.
    case 'line': {
      const [a, b] = endpoints(w, h, opts.path);
      return `M ${n(a[0])} ${n(a[1])} L ${n(b[0])} ${n(b[1])}`;
    }

    case 'arrow': {
      const [a, b] = endpoints(w, h, opts.path);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const headLen = Math.min(Math.hypot(dx, dy) * 0.28, 24);
      const angle = Math.atan2(dy, dx);
      const spread = 0.42;
      const tipX = b[0], tipY = b[1];
      const leftX = tipX - headLen * Math.cos(angle - spread);
      const leftY = tipY - headLen * Math.sin(angle - spread);
      const rightX = tipX - headLen * Math.cos(angle + spread);
      const rightY = tipY - headLen * Math.sin(angle + spread);
      return [
        `M ${n(a[0])} ${n(a[1])} L ${n(tipX)} ${n(tipY)}`,
        `M ${n(leftX)} ${n(leftY)} L ${n(tipX)} ${n(tipY)} L ${n(rightX)} ${n(rightY)}`,
      ].join(' ');
    }

    case 'callout': {
      // Body occupies the upper 78%; the tail drops from the lower-left.
      const bodyH = h * 0.78;
      const r = Math.max(0, Math.min(opts.radius ?? 6, w / 2, bodyH / 2));
      const tailX = w * 0.22, tailW = w * 0.14;
      return [
        `M ${n(r)} 0`,
        `L ${n(w - r)} 0`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}`,
        `L ${n(w)} ${n(bodyH - r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(bodyH)}`,
        `L ${n(tailX + tailW)} ${n(bodyH)}`,
        `L ${n(tailX)} ${n(h)}`,
        `L ${n(tailX)} ${n(bodyH)}`,
        `L ${n(r)} ${n(bodyH)}`,
        `A ${n(r)} ${n(r)} 0 0 1 0 ${n(bodyH - r)}`,
        `L 0 ${n(r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(r)} 0`,
        'Z',
      ].join(' ');
    }

    case 'triangle':
      return polyPath([[w / 2, 0], [w, h], [0, h]]);

    case 'polygon':
      return polyPath(regularPoints(w, h, Math.max(3, Math.min(opts.points ?? 5, 12))));

    case 'star':
      return polyPath(starPoints(w, h, Math.max(3, Math.min(opts.points ?? 5, 12))));

    case 'path': {
      const pts = opts.path ?? [];
      if (pts.length < 2) return '';
      return polyPath(pts.map(p => [p.x * w, p.y * h] as [number, number]));
    }

    default:
      return '';
  }
}
