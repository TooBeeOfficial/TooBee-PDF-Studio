import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * A dropdown that is drawn at the top of the document instead of inside the
 * panel that owns it.
 *
 * An absolutely positioned menu inherits two problems from its ancestors. It is
 * clipped by the first scrolling box above it — in this app that is
 * `.inspector-body`, so a font list opened near the foot of the inspector was
 * cut off after a couple of rows. And its z-index is only ever compared against
 * whatever stacking context it happens to land in, so keeping it above the rail,
 * the canvas handles and the stage overlays meant guessing numbers that no
 * single rule could reconcile.
 *
 * Portalling to <body> removes both. The menu becomes a last child of the
 * document, so no ancestor can clip it, and it competes for paint order only
 * against the other top-level layers, which the --z-* scale now orders
 * explicitly. The cost is that it no longer moves with its anchor for free, so
 * the anchor's rectangle is measured on open and re-measured whenever anything
 * scrolls or the window resizes.
 */

interface Props {
  open: boolean;
  /** The element the menu should sit under and match the width of. */
  anchor: HTMLElement | null;
  /** Called when the click-away layer is used. */
  onClose: () => void;
  /** Applied to the menu itself, e.g. 'font-menu'. */
  className?: string;
  /** Tallest the menu may be before it scrolls internally. */
  maxHeight?: number;
  children: React.ReactNode;
}

interface Box {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/** Space kept between the menu and the window edge so it never sits flush. */
const EDGE_GAP = 8;
/** Space between the menu and its anchor. Matches the --s-1 the in-flow menu used. */
const ANCHOR_GAP = 4;

export default function AnchoredMenu({
  open, anchor, onClose, className = '', maxHeight = 200, children,
}: Props) {
  const [box, setBox] = useState<Box | null>(null);

  const measure = useCallback(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - ANCHOR_GAP - EDGE_GAP;
    const above = r.top - ANCHOR_GAP - EDGE_GAP;

    // Prefer dropping down, but flip up when the anchor is low enough that the
    // list would be squeezed into less room than it would get overhead. The
    // floor keeps a couple of rows visible rather than collapsing to a sliver
    // in the rare case that neither side has room.
    const flip = below < Math.min(maxHeight, above);
    const height = Math.min(maxHeight, Math.max(80, flip ? above : below));

    setBox({
      left: r.left,
      top: flip ? r.top - ANCHOR_GAP - height : r.bottom + ANCHOR_GAP,
      width: r.width,
      maxHeight: height,
    });
  }, [anchor, maxHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;

    // Capture phase, because the scroll that moves the anchor is the
    // inspector's own and does not bubble to the window.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Not `!open` — the menu keeps its box after closing so AnimatePresence has
  // somewhere to play the exit fade out of.
  if (!box) return null;

  return createPortal(
    <>
      {/* Click, not mousedown: the scrim has to absorb the whole click, or
          closing on press would let the mouseup land on whatever was underneath.
          It reaches over the rail too, so a nav item clicked with the menu open
          dismisses the menu instead of navigating out from under it. */}
      {open && <div className="menu-scrim" onClick={onClose} />}
      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`${className} menu-float`}
            style={{ left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
