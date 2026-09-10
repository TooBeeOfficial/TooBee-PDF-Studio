import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import EmptyStage from '../components/EmptyStage';
import { appendPdf } from '../utils/appendPdf';
import ValueInput from '../components/ValueInput';
import AnchoredMenu from '../components/AnchoredMenu';
import SignaturePad from '../components/SignaturePad';
import SignatureImportDialog from '../components/SignatureImportDialog';
import { toPdfFile } from '../utils/fileConverter';
import { useToolStore } from '../store/useToolStore';
import { useSystemFonts } from '../hooks/useSystemFonts';
import { usePreviewShortcuts, stepZoom } from '../hooks/usePreviewShortcuts';
import { useFitOnLoad } from '../hooks/useFitOnLoad';
import { useSignatureLibrary } from '../hooks/useSignatureLibrary';
import { applyStamps } from '../utils/stampPdf';
import { rasteriseStrokes, strokeAspect, type InkStroke } from '../utils/inkStroke';
import { imageDataToPngBytes, pngBytesToUrl } from '../utils/signatureImage';
import {
  base64ToBytes,
  bytesToBase64,
  clampToPage,
  hitTest,
  newId,
  rotateVec,
  stampTransform,
  type SavedSignature,
  type Stamp,
  type Vec,
} from '../utils/stamps';
import {
  Download,
  Trash2,
  Save,
  ZoomIn,
  ZoomOut,
  Search,
  Plus,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  PenLine,
  Type,
  ImageIcon,
  BookmarkPlus,
  FolderOpen,
  X,
} from 'lucide-react';

const PRESET_COLORS = [
  '#ffffff', '#000000', '#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'
];

const SYSTEM_FONTS = [
  'Helvetica', 'TimesRomanItalic', 'CourierBold', 'Arial', 'Verdana', 'Georgia', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins'
];

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface CustomFont {
  name: string;
  bytes: Uint8Array;
  url: string;
}

/** Which of the three ways of making a signature the inspector is showing. */
type Mode = 'type' | 'draw' | 'image';

/**
 * What will be dropped on the page by the next click. Held separately from the
 * placed stamps so that the same source can be stamped repeatedly — initialling
 * every page of a contract is the common case, and having to rebuild the
 * signature between pages would be the wrong shape entirely.
 */
interface PendingSource {
  kind: 'text' | 'ink' | 'image';
  aspect: number;
  text?: string;
  font?: string;
  color?: string;
  png?: Uint8Array;
  url?: string;
  strokes?: InkStroke[];
}

/** Height a freshly placed stamp gets, in PDF points. */
const PLACED_HEIGHT = { text: 30, ink: 42, image: 52 } as const;

/** Pixels per point when rasterising ink for the on-page preview. */
const INK_PREVIEW_SCALE = 2;

type Drag =
  | { kind: 'move'; id: string; grab: Vec; origin: Stamp }
  | { kind: 'resize'; id: string; sx: number; sy: number; origin: Stamp }
  | { kind: 'rotate'; id: string; origin: Stamp; offset: number };

export default function Sign() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => {
                setStamps([]);
                setSelectedId(null);
                setCurrentPage(1);
                handleFilesSelected(files);
              });
  const { document: sharedDoc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: currentPdfBytes } = sharedDoc;
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('type');

  const [signatureText, setSignatureText] = useState("");
  const [selectedFont, setSelectedFont] = useState("Helvetica");
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [imported, setImported] = useState<{ png: Uint8Array; url: string; aspect: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [visualScale, setVisualScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  // Scale the bitmap on screen was drawn at; see PdfPreviewer for why.
  const [shownScale, setShownScale] = useState(0);
  // Natural page size in points, so the frame can take the requested size
  // immediately — a CSS transform does not change layout, so without this the
  // frame would lag the scaled canvas and let it spill past its border.
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const [mousePos, setMousePos] = useState<Vec>({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  // Custom Font state
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const { systemFonts, status: fontStatus, load: loadSystemFonts } = useSystemFonts();
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [fontSearch, setFontSearch] = useState('Helvetica');
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  // The menu is portalled to <body>, so it is positioned from this row's rect.
  const fontAnchorRef = useRef<HTMLDivElement>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const library = useSignatureLibrary();

  const selected = useMemo(
    () => stamps.find(s => s.id === selectedId) ?? null,
    [stamps, selectedId],
  );

  const allFontFamilies = useMemo(() => {
    const customNames = customFonts.map(f => f.name);
    // Built-ins first (these are the ones that survive export), then uploaded
    // files, then everything installed on the machine.
    return Array.from(new Set([...SYSTEM_FONTS, ...customNames, ...systemFonts]));
  }, [customFonts, systemFonts]);

  const filteredFonts = useMemo(() => {
    const filtered = allFontFamilies.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()));
    // Move selected font to top
    return filtered.sort((a, b) => {
      if (a === selectedFont) return -1;
      if (b === selectedFont) return 1;
      return 0;
    });
  }, [allFontFamilies, fontSearch, selectedFont]);

  const performRender = useCallback(async (pageNum: number, scale: number) => {
    if (!currentPdfBytes) return;
    try {
      const pdf = await pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise;
      const page = await pdf.getPage(pageNum);
      const dpi = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpi });
      setPageSize({ width: viewport.width / dpi / scale, height: viewport.height / dpi / scale });

      const buffer = bufferCanvasRef.current;
      if (!buffer) return;
      const ctx = buffer.getContext('2d');
      if (ctx) {
        buffer.width = viewport.width;
        buffer.height = viewport.height;
        buffer.style.width = `${viewport.width / dpi}px`;
        buffer.style.height = `${viewport.height / dpi}px`;

        // pdf.js throws if a second render starts on the same canvas before the
        // first finishes, so cancel any in-flight render before starting a new one.
        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (renderTaskRef.current === task) renderTaskRef.current = null;

        const main = mainCanvasRef.current;
        if (main) {
          main.width = buffer.width;
          main.height = buffer.height;
          main.style.width = buffer.style.width;
          main.style.height = buffer.style.height;
          main.getContext('2d')?.drawImage(buffer, 0, 0);
          setShownScale(scale);
        }
      }
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') console.error(e);
    }
  }, [currentPdfBytes]);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Appending leaves existing signatures on the pages they were placed on.
    if (currentPdfBytes && currentPdfBytes.length && file) {
      try {
        const merged = await appendPdf(currentPdfBytes, newFiles);
        noteNextChange('Added pages');
        setDocument(new File([merged], file.name, { type: 'application/pdf' }), merged);
        return;
      } catch (err) {
        console.error('Could not append to the open document', err);
      }
    }

    let selectedFile: File;
    try {
      selectedFile = await toPdfFile(newFiles[0]);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.errUnsupported'));
      return;
    }
    const buffer = await selectedFile.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    setDocument(selectedFile, uint8Array);
    // The effect below re-renders once currentPdfBytes lands; calling performRender
    // here too (with a stale closure) would race it on the same canvas.
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const name = file.name.split('.')[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(new Blob([bytes]));
    const fontFace = new FontFace(name, `url(${url})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    setCustomFonts(prev => [...prev, { name, bytes, url }]);
    setSelectedFont(name);
    setFontSearch(name);
  };

  const handleZoom = (direction: 1 | -1) => {
    setVisualScale(prev => stepZoom(prev, direction));
  };

  /* ─── The pending source ───────────────────────────────────────────────────
     Whichever mode is showing decides what the next click on the page places.
     Deriving it rather than storing it means switching tabs never leaves a
     stale stamp armed behind the one you are looking at. */

  const pending: PendingSource | null = useMemo(() => {
    if (mode === 'type') {
      if (!signatureText.trim()) return null;
      return { kind: 'text', aspect: 3, text: signatureText, font: selectedFont, color: selectedColor };
    }
    if (mode === 'draw') {
      if (!strokes.length) return null;
      return { kind: 'ink', aspect: strokeAspect(strokes), color: selectedColor, strokes };
    }
    if (!imported) return null;
    return { kind: 'image', aspect: imported.aspect, png: imported.png, url: imported.url };
  }, [mode, signatureText, selectedFont, selectedColor, strokes, imported]);

  /**
   * Ink needs a bitmap for the on-page preview, but only the strokes are worth
   * keeping. This rasterises once per change at screen resolution; export
   * re-rasterises from the same strokes at four times the density.
   */
  const inkPreviewUrl = useMemo(() => {
    if (mode !== 'draw' || !strokes.length) return null;
    const data = rasteriseStrokes(strokes, selectedColor, INK_PREVIEW_SCALE);
    if (!data) return null;
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')?.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  }, [mode, strokes, selectedColor]);

  /* ─── Placing and manipulating ─────────────────────────────────────────── */

  /** Client coordinates to points from the page's top-left. */
  const toPage = useCallback((clientX: number, clientY: number): Vec => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / visualScale,
      y: (clientY - rect.top) / visualScale,
    };
  }, [visualScale]);

  const measureText = useCallback((text: string, font: string, size: number) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { w: size * text.length * 0.5, h: size * 1.25 };
    ctx.font = `${size}px "${font}", sans-serif`;
    return { w: Math.max(size, ctx.measureText(text).width), h: size * 1.25 };
  }, []);

  const placeAt = useCallback((point: Vec) => {
    if (!pending) return;

    const height = PLACED_HEIGHT[pending.kind];
    let w: number;
    let h: number;
    let fontSize: number | undefined;

    if (pending.kind === 'text') {
      fontSize = PLACED_HEIGHT.text;
      // The screen font and the embedded PDF font are rarely the same file, so
      // this width is close rather than exact. Because both the overlay and the
      // export centre the text on the same point, any difference shows as a
      // symmetric sliver rather than a shift in where the signature sits.
      const m = measureText(pending.text ?? '', pending.font ?? 'Helvetica', fontSize);
      w = m.w;
      h = m.h;
    } else {
      h = height;
      w = height * pending.aspect;
    }

    const stamp: Stamp = {
      id: newId(),
      kind: pending.kind,
      page: currentPage,
      cx: point.x,
      cy: point.y,
      w,
      h,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      text: pending.text,
      font: pending.font,
      color: pending.color,
      fontSize,
      png: pending.png,
      url: pending.url,
      strokes: pending.strokes,
    };

    setStamps(prev => [...prev, stamp]);
    setSelectedId(stamp.id);
  }, [pending, currentPage, measureText]);

  const updateStamp = useCallback((id: string, patch: Partial<Stamp>) => {
    setStamps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const onFramePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const point = toPage(e.clientX, e.clientY);

    // Topmost first, so clicking overlapping stamps grabs the one drawn on top.
    const hit = [...stamps]
      .reverse()
      .find(s => s.page === currentPage && hitTest(s, point));

    if (hit) {
      setSelectedId(hit.id);
      dragRef.current = {
        kind: 'move',
        id: hit.id,
        grab: { x: point.x - hit.cx, y: point.y - hit.cy },
        origin: hit,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }

    if (pending) {
      placeAt(point);
      return;
    }
    setSelectedId(null);
  };

  const startResize = (sx: number, sy: number) => (e: React.PointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'resize', id: selected.id, sx, sy, origin: selected };
  };

  const startRotate = (e: React.PointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toPage(e.clientX, e.clientY);
    const angle = (Math.atan2(p.y - selected.cy, p.x - selected.cx) * 180) / Math.PI;
    dragRef.current = { kind: 'rotate', id: selected.id, origin: selected, offset: angle - selected.rotation };
  };

  const onFramePointerMove = (e: React.PointerEvent) => {
    // The cursor ghost only matters while something is armed and nothing is
    // being dragged, so it is cheap to keep updating.
    if (!dragRef.current) {
      setMousePos(toPage(e.clientX, e.clientY));
      return;
    }

    const drag = dragRef.current;
    const p = toPage(e.clientX, e.clientY);
    const o = drag.origin;

    if (drag.kind === 'move') {
      const next = clampToPage(
        { ...o, cx: p.x - drag.grab.x, cy: p.y - drag.grab.y },
        pageSize.width,
        pageSize.height,
      );
      updateStamp(drag.id, { cx: next.cx, cy: next.cy });
      return;
    }

    if (drag.kind === 'rotate') {
      const angle = (Math.atan2(p.y - o.cy, p.x - o.cx) * 180) / Math.PI;
      let rotation = angle - drag.offset;
      // Shift snaps to the same fifteen degrees the rotate field steps by.
      if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
      updateStamp(drag.id, { rotation: Math.round(rotation * 10) / 10 });
      return;
    }

    /* Resize.
       Work in the stamp's own unrotated frame: undo the rotation, do the
       rectangle arithmetic there, then put the rotation back when converting
       the new centre to page space. Doing it directly in page space would need
       the handle's travel decomposed along two rotated axes at every step. */
    const local = rotateVec({ x: p.x - o.cx, y: p.y - o.cy }, -o.rotation);
    // The corner opposite the one being dragged stays put, so it is the anchor.
    const anchor = { x: (-drag.sx * o.w) / 2, y: (-drag.sy * o.h) / 2 };

    let w = Math.max(8, (local.x - anchor.x) * drag.sx);
    let h = Math.max(8, (local.y - anchor.y) * drag.sy);

    // Bitmaps hold their proportions unless Shift asks for a free stretch;
    // text is always proportional, because its box follows the font size.
    const locked = o.kind === 'text' || !e.shiftKey;
    if (locked) {
      const factor = Math.max(w / o.w, h / o.h);
      w = o.w * factor;
      h = o.h * factor;
    }

    const centreLocal = { x: anchor.x + (drag.sx * w) / 2, y: anchor.y + (drag.sy * h) / 2 };
    const spun = rotateVec(centreLocal, o.rotation);

    updateStamp(drag.id, {
      w,
      h,
      cx: o.cx + spun.x,
      cy: o.cy + spun.y,
      ...(o.kind === 'text' ? { fontSize: (o.fontSize ?? o.h) * (h / o.h) } : {}),
    });
  };

  const endDrag = () => { dragRef.current = null; };

  /* ─── Library ──────────────────────────────────────────────────────────── */

  const saveToLibrary = useCallback(async (source: PendingSource | Stamp, label: string) => {
    const record: SavedSignature = {
      id: newId(),
      kind: source.kind,
      label: label.trim() || t('sign.defaultLabel'),
      created: Date.now(),
      aspect: 'aspect' in source ? source.aspect : source.w / source.h,
      text: source.text,
      font: source.font,
      color: source.color,
      strokes: source.strokes,
    };

    if (source.kind === 'image' && source.png) {
      record.png = bytesToBase64(source.png);
    } else if (source.kind === 'ink' && source.strokes?.length) {
      // Strokes are the real record; a PNG rides along so the library can show
      // a thumbnail without re-rasterising every entry on every render.
      const data = rasteriseStrokes(source.strokes, source.color ?? '#000000', INK_PREVIEW_SCALE);
      if (data) record.png = bytesToBase64(await imageDataToPngBytes(data));
    }

    await library.save(record);
  }, [library]);

  /** Load a saved signature back into the matching mode, ready to place. */
  const useSaved = useCallback((saved: SavedSignature) => {
    if (saved.kind === 'text') {
      setMode('type');
      setSignatureText(saved.text ?? '');
      if (saved.font) { setSelectedFont(saved.font); setFontSearch(saved.font); }
      if (saved.color) setSelectedColor(saved.color);
      return;
    }
    if (saved.kind === 'ink' && saved.strokes?.length) {
      setMode('draw');
      setStrokes(saved.strokes);
      if (saved.color) setSelectedColor(saved.color);
      return;
    }
    if (saved.png) {
      const bytes = base64ToBytes(saved.png);
      setMode('image');
      setImported(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { png: bytes, url: pngBytesToUrl(bytes), aspect: saved.aspect };
      });
    }
  }, []);

  /* ─── Apply ────────────────────────────────────────────────────────────── */

  const applyToDocument = async () => {
    if (!currentPdfBytes || !stamps.length) return;
    setIsProcessing(true);
    try {
      const newBytes = await applyStamps(currentPdfBytes, stamps, customFonts);
      setStamps([]);
      setSelectedId(null);
      noteNextChange('Signed');
      // The signed result becomes the new working document, so other tools
      // pick up these signatures instead of the pre-sign file. The effect
      // below re-renders once it lands; calling performRender here too would
      // race it on the same canvas.
      setDocument(new File([newBytes], file?.name || 'signed.pdf', { type: 'application/pdf' }), newBytes);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : t('sign.errApply'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Keep the download link in sync with the shared document, however it got
  // there — signed here, or edited by another tool and carried over.
  useEffect(() => {
    if (!currentPdfBytes) { setCurrentPdfUrl(null); return; }
    const url = URL.createObjectURL(new Blob([currentPdfBytes], { type: 'application/pdf' }));
    setCurrentPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentPdfBytes]);

  // numPages isn't tracked by performRender, so recompute it whenever the
  // document changes (freshly loaded here, or carried over from another tool).
  useEffect(() => {
    if (!currentPdfBytes) { setNumPages(0); return; }
    let cancelled = false;
    pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise.then(pdf => {
      if (!cancelled) setNumPages(pdf.numPages);
    });
    return () => { cancelled = true; };
  }, [currentPdfBytes]);

  useEffect(() => {
    if (currentPdfBytes) performRender(currentPage, visualScale);
  }, [currentPage, performRender, visualScale]);

  // The imported PNG's object URL outlives any single render, so it is revoked
  // only when it is replaced or the page goes away.
  useEffect(() => () => { if (imported) URL.revokeObjectURL(imported.url); }, [imported]);

  const { onWheel: onPreviewWheel } = usePreviewShortcuts({
    enabled: !!file,
    zoom: { value: visualScale, set: setVisualScale, min: 0.25, max: 4, step: 0.2, reset: 1 },
    page: { current: currentPage, total: numPages, set: setCurrentPage },
    hasSelection: !!selected,
    onDelete: () => {
      if (!selected) return;
      setStamps(prev => prev.filter(s => s.id !== selected.id));
      setSelectedId(null);
    },
    onEscape: () => setSelectedId(null),
  });

  // Open with the first page fitted to the stage rather than at a fixed zoom.
  useFitOnLoad({
    key: file && currentPdfBytes ? `${file.name}:${currentPdfBytes.length}` : null,
    stageRef,
    canvasRef: mainCanvasRef,
    scale: visualScale,
    setScale: setVisualScale,
  });

  const pageStamps = stamps.filter(s => s.page === currentPage);

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('sign.title')}</h1>
      </header>

      <div className="workbench">
        <div className="stage" onWheel={onPreviewWheel}>
          {!file ? (
            <EmptyStage
              motif="sign"
              headline={t('sign.emptyHeadline')}
              onFilesSelected={handleFilesSelected}
            />
          ) : (
            <>
              <div
                className="stage-canvas"
                ref={stageRef}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                <div
                  className="canvas-frame"
                  ref={frameRef}
                  onPointerDown={onFramePointerDown}
                  onPointerMove={onFramePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{
                    cursor: pending && !selected ? 'copy' : 'default',
                    ...(pageSize.width ? {
                      width: pageSize.width * visualScale,
                      height: pageSize.height * visualScale,
                    } : {}),
                  }}
                >
                  {/* Carries the previous bitmap, scaled, until the re-render lands. */}
                  <div style={shownScale > 0 ? {
                    transform: `scale(${visualScale / shownScale})`,
                    transformOrigin: '0 0',
                  } : undefined}>
                    <canvas ref={mainCanvasRef} style={{ display: 'block' }} />
                  </div>
                  <canvas ref={bufferCanvasRef} style={{ display: 'none' }} />

                  {pageStamps.map(stamp => (
                    <div
                      key={stamp.id}
                      className={`stamp ${selectedId === stamp.id ? 'selected' : ''}`}
                      style={{
                        left: stamp.cx * visualScale,
                        top: stamp.cy * visualScale,
                        width: stamp.w * visualScale,
                        height: stamp.h * visualScale,
                        transform: stampTransform(stamp),
                        opacity: stamp.opacity,
                      }}
                    >
                      {stamp.kind === 'text' ? (
                        <span
                          className="stamp-text"
                          style={{
                            fontFamily: stamp.font,
                            color: stamp.color,
                            fontSize: (stamp.fontSize ?? stamp.h) * visualScale,
                          }}
                        >
                          {stamp.text}
                        </span>
                      ) : (
                        <img src={stampImage(stamp)} alt="" draggable={false} />
                      )}
                    </div>
                  ))}

                  {/* Selection chrome is a sibling of the stamp rather than a
                      child, so the stamp's flips do not mirror the handles and
                      leave them fighting the cursor they advertise. */}
                  {selected && selected.page === currentPage && (
                    <div
                      className="stamp-chrome"
                      style={{
                        left: selected.cx * visualScale,
                        top: selected.cy * visualScale,
                        width: selected.w * visualScale,
                        height: selected.h * visualScale,
                        transform: `translate(-50%, -50%) rotate(${selected.rotation}deg)`,
                      }}
                    >
                      <span className="stamp-rotate" onPointerDown={startRotate} onPointerMove={onFramePointerMove} onPointerUp={endDrag}>
                        <RotateCw size={11} />
                      </span>
                      {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => (
                        <span
                          key={`${sx}${sy}`}
                          className="stamp-handle"
                          style={{
                            left: sx < 0 ? 0 : '100%',
                            top: sy < 0 ? 0 : '100%',
                            cursor: sx * sy > 0 ? 'nwse-resize' : 'nesw-resize',
                          }}
                          onPointerDown={startResize(sx, sy)}
                          onPointerMove={onFramePointerMove}
                          onPointerUp={endDrag}
                        />
                      ))}
                    </div>
                  )}

                  {/* Ghost of what the next click will drop. */}
                  {isHovering && pending && !dragRef.current && (
                    <div
                      className="stamp stamp-ghost"
                      style={{
                        left: mousePos.x * visualScale,
                        top: mousePos.y * visualScale,
                        // Centred on the cursor, because that is where placeAt
                        // puts the stamp. Without this the ghost hung down and
                        // to the right of the pointer and the signature landed
                        // somewhere other than where it had been previewed.
                        transform: 'translate(-50%, -50%)',
                        width: (pending.kind === 'text'
                          ? measureText(pending.text ?? '', pending.font ?? 'Helvetica', PLACED_HEIGHT.text).w
                          : PLACED_HEIGHT[pending.kind] * pending.aspect) * visualScale,
                        height: (pending.kind === 'text'
                          ? PLACED_HEIGHT.text * 1.25
                          : PLACED_HEIGHT[pending.kind]) * visualScale,
                      }}
                    >
                      {pending.kind === 'text' ? (
                        <span
                          className="stamp-text"
                          style={{
                            fontFamily: pending.font,
                            color: pending.color,
                            fontSize: PLACED_HEIGHT.text * visualScale,
                          }}
                        >
                          {pending.text}
                        </span>
                      ) : (
                        <img src={pending.kind === 'ink' ? inkPreviewUrl ?? '' : pending.url ?? ''} alt="" draggable={false} />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Page navigation belongs under the document it moves through. */}
              <div className="page-nav">
                <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>{t('common.prev')}</button>
                <span className="page-nav-label">
                  {t('common.pageOf', { current: currentPage, total: numPages })}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>{t('common.next')}</button>
              </div>
            </>
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">{t('common.document')}</div>
              {file && <div className="file-name" title={file.name}>{file.name}</div>}
              <div className="zoom-control">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleZoom(-1)} aria-label={t('common.zoomOut')}><ZoomOut size={14} /></button>
                <ValueInput label={t('common.zoom')} suffix="%" min={25} max={400} step={10} width={56}
                value={Math.round(visualScale * 100)}
                onCommit={v => setVisualScale(v / 100)} />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleZoom(1)} aria-label={t('common.zoomIn')}><ZoomIn size={14} /></button>
              </div>
              <FileUploader onFilesSelected={files => {
                setStamps([]);
                setSelectedId(null);
                setCurrentPage(1);
                handleFilesSelected(files);
              }} multiple />
            </div>

            <div className="inspector-group">
              <div className="t-eyebrow">{t('sign.signature')}</div>

              <div className="segmented segmented-block">
                <button onClick={() => setMode('type')} aria-pressed={mode === 'type'}>
                  <Type size={13} /> <span>{t('sign.modeType')}</span>
                </button>
                <button onClick={() => setMode('draw')} aria-pressed={mode === 'draw'}>
                  <PenLine size={13} /> <span>{t('sign.modeDraw')}</span>
                </button>
                <button onClick={() => setMode('image')} aria-pressed={mode === 'image'}>
                  <ImageIcon size={13} /> <span>{t('sign.modeImage')}</span>
                </button>
              </div>

              {mode === 'type' && (
                <>
                  <div className="field">
                    <label htmlFor="sign-name">{t('sign.name')}</label>
                    <input
                      id="sign-name"
                      type="text"
                      className="input signature-preview"
                      placeholder={t('sign.namePlaceholder')}
                      value={signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      style={{ fontFamily: selectedFont }}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="sign-font">{t('fonts.typeface')}</label>
                    <div ref={fontAnchorRef} style={{ display: 'flex', gap: 'var(--s-2)' }}>
                      <div className="input-with-icon">
                        <Search size={13} />
                        <input
                          id="sign-font"
                          onClick={loadSystemFonts}
                          type="text"
                          className="input"
                          placeholder={t('fonts.search')}
                          value={fontSearch}
                          onFocus={() => setShowFontDropdown(true)}
                          onChange={(e) => { setFontSearch(e.target.value); setShowFontDropdown(true); }}
                        />
                      </div>
                      <button className="btn btn-secondary btn-icon" onClick={() => fontInputRef.current?.click()} aria-label={t('fonts.add')}>
                        <Plus size={15} />
                      </button>
                      <input type="file" ref={fontInputRef} hidden accept=".ttf,.otf" onChange={handleFontUpload} />
                    </div>

                    <AnchoredMenu
                      open={showFontDropdown}
                      anchor={fontAnchorRef.current}
                      onClose={() => setShowFontDropdown(false)}
                      className="font-menu"
                    >
                      {filteredFonts.length > 0 ? filteredFonts.map(f => (
                        <button
                          key={f}
                          type="button"
                          className={`font-option ${selectedFont === f ? 'selected' : ''}`}
                          style={{ fontFamily: f }}
                          onClick={() => {
                            setSelectedFont(f);
                            setFontSearch(f);
                            setShowFontDropdown(false);
                          }}
                        >
                          {f.replace('RomanItalic', '').replace('Bold', '')}
                        </button>
                      )) : (
                        <p className="hint" style={{ padding: 'var(--s-2) var(--s-3)' }}>{t('fonts.noneFound')}</p>
                      )}
                      {fontStatus === 'loading' && (
                        <p className="font-menu-note">{t('fonts.loading')}</p>
                      )}
                      {fontStatus === 'ready' && (
                        <p className="font-menu-note">
                          {t('fonts.ready', { total: systemFonts.length })}
                        </p>
                      )}
                      {(fontStatus === 'denied' || fontStatus === 'unavailable') && (
                        <p className="font-menu-note">{t('fonts.denied')}</p>
                      )}
                    </AnchoredMenu>
                  </div>
                </>
              )}

              {mode === 'draw' && (
                <SignaturePad color={selectedColor} onChange={setStrokes} />
              )}

              {mode === 'image' && (
                <div className="field">
                  {imported ? (
                    <>
                      <div className="stamp-preview">
                        <img src={imported.url} alt={t('sign.importedAlt')} />
                      </div>
                      <div className="pair-grid">
                        <button className="btn btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
                          {t('common.replace')}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setImported(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; })}
                        >
                          <X size={13} /> {t('common.clear')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary btn-block" onClick={() => setImportOpen(true)}>
                        <ImageIcon size={15} /> {t('sign.importImage')}
                      </button>
                      <p className="hint">{t('sign.importHint')}</p>
                    </>
                  )}
                </div>
              )}

              {mode !== 'image' && (
                <div className="field">
                  <label>{t('sign.ink')}</label>
                  <div className="swatch-row">
                    <span className="swatch-native">
                      <input
                        type="color"
                        value={selectedColor}
                        onChange={(e) => setSelectedColor(e.target.value)}
                        aria-label={t('sign.inkCustom')}
                      />
                    </span>
                    <div className="swatches">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setSelectedColor(c)}
                          className={`swatch ${selectedColor === c ? 'selected' : ''}`}
                          style={{ background: c }}
                          aria-label={t('sign.inkSwatch', { colour: c })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {pending && (
                <button
                  className="btn btn-ghost btn-block"
                  onClick={() => saveToLibrary(pending, pending.text ?? t(pending.kind === 'ink' ? 'sign.drawnLabel' : 'sign.importedLabel'))}
                >
                  <BookmarkPlus size={15} /> {t('sign.saveForReuse')}
                </button>
              )}
            </div>

            {selected && (
              <div className="inspector-group">
                <div className="t-eyebrow">{t('sign.adjust')}</div>

                <div className="field">
                  <label>{t('sign.size')}</label>
                  <div className="pair-grid">
                    <ValueInput
                      label={t('sign.width')} suffix="pt" min={4} max={2000} step={1} width={62}
                      value={Math.round(selected.w)}
                      onCommit={v => {
                        const factor = v / selected.w;
                        updateStamp(selected.id, {
                          w: v,
                          h: selected.h * factor,
                          ...(selected.kind === 'text'
                            ? { fontSize: (selected.fontSize ?? selected.h) * factor }
                            : {}),
                        });
                      }}
                    />
                    <ValueInput
                      label={t('sign.height')} suffix="pt" min={4} max={2000} step={1} width={62}
                      value={Math.round(selected.h)}
                      onCommit={v => {
                        const factor = v / selected.h;
                        updateStamp(selected.id, {
                          h: v,
                          w: selected.w * factor,
                          ...(selected.kind === 'text'
                            ? { fontSize: (selected.fontSize ?? selected.h) * factor }
                            : {}),
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>{t('sign.rotation')}</label>
                  <div className="pair-grid">
                    <ValueInput
                      label={t('sign.rotation')} suffix="°" min={-180} max={180} step={15} width={62}
                      value={Math.round(selected.rotation)}
                      onCommit={v => updateStamp(selected.id, { rotation: v })}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateStamp(selected.id, { rotation: 0 })}
                      disabled={selected.rotation === 0}
                    >
                      {t('common.reset')}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>{t('sign.flip')}</label>
                  {selected.kind === 'text' ? (
                    <p className="hint">
                      {t('sign.flipTextNote')}
                    </p>
                  ) : (
                    <div className="pair-grid">
                      <button
                        className={`btn btn-secondary btn-sm ${selected.flipX ? 'active' : ''}`}
                        aria-pressed={selected.flipX}
                        onClick={() => updateStamp(selected.id, { flipX: !selected.flipX })}
                      >
                        <FlipHorizontal2 size={13} /> {t('sign.flipX')}
                      </button>
                      <button
                        className={`btn btn-secondary btn-sm ${selected.flipY ? 'active' : ''}`}
                        aria-pressed={selected.flipY}
                        onClick={() => updateStamp(selected.id, { flipY: !selected.flipY })}
                      >
                        <FlipVertical2 size={13} /> {t('sign.flipY')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="stamp-opacity">
                    {t('sign.opacity')} <span className="num">{Math.round(selected.opacity * 100)}%</span>
                  </label>
                  <input
                    id="stamp-opacity"
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(selected.opacity * 100)}
                    onChange={e => updateStamp(selected.id, { opacity: +e.target.value / 100 })}
                  />
                </div>

                <div className="pair-grid">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => saveToLibrary(selected, selected.text ?? t('sign.defaultLabel'))}
                  >
                    <BookmarkPlus size={13} /> {t('common.save')}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      setStamps(prev => prev.filter(s => s.id !== selected.id));
                      setSelectedId(null);
                    }}
                  >
                    <Trash2 size={13} /> {t('common.remove')}
                  </button>
                </div>
              </div>
            )}

            <div className="inspector-group">
              <div className="t-eyebrow">
                {t('sign.saved')}
                {library.items.length > 0 && <span className="count num">{library.items.length}</span>}
              </div>

              {library.loading ? (
                <p className="hint">{t('sign.libraryLoading')}</p>
              ) : library.items.length === 0 ? (
                <p className="hint">
                  {t('sign.libraryEmpty')}
                </p>
              ) : (
                <ul className="sig-library">
                  {library.items.map(item => (
                    <li key={item.id}>
                      <button className="sig-card" onClick={() => useSaved(item)} title={t('sign.useSaved', { label: item.label })}>
                        {item.png ? (
                          <img src={`data:image/png;base64,${item.png}`} alt="" />
                        ) : (
                          <span style={{ fontFamily: item.font, color: item.color }}>{item.text}</span>
                        )}
                      </button>
                      <span className="sig-label" title={item.label}>{item.label}</span>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => library.remove(item.id)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {library.error && <p className="hint hint-danger">{library.error}</p>}
              {!library.persistent && (
                <p className="hint hint-danger">
                  {t('sign.notPersistent')}
                </p>
              )}
              {library.reveal && library.items.length > 0 && (
                <button className="btn btn-ghost btn-sm btn-block" onClick={library.reveal}>
                  <FolderOpen size={13} /> {t('sign.showFolder')}
                </button>
              )}
            </div>

            <div className="inspector-group">
              <div className="t-eyebrow">
                {t('sign.placed')}
                {stamps.length > 0 && <span className="count num">{stamps.length}</span>}
              </div>
              {stamps.length === 0 ? (
                <p className="hint">
                  {pending
                    ? t('sign.placeHint')
                    : t('sign.buildHint')}
                </p>
              ) : (
                <ul className="queue">
                  {stamps.map(stamp => (
                    <li
                      key={stamp.id}
                      className={`queue-item ${selectedId === stamp.id ? 'selected' : ''}`}
                    >
                      <button
                        className="queue-select"
                        onClick={() => { setCurrentPage(stamp.page); setSelectedId(stamp.id); }}
                      >
                        <span className="queue-name" style={{ fontFamily: stamp.font, color: stamp.color }}>
                          {stamp.kind === 'text' ? stamp.text : t(stamp.kind === 'ink' ? 'sign.modeDraw' : 'sign.modeImage')}
                        </span>
                        <span className="queue-index num">p{stamp.page}</span>
                      </button>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => {
                          setStamps(prev => prev.filter(s => s.id !== stamp.id));
                          if (selectedId === stamp.id) setSelectedId(null);
                        }}
                        aria-label={t('sign.removePlaced')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {file && (
            <div className="inspector-action">
              {stamps.length > 0 && (
                <button className="btn btn-primary btn-block" onClick={applyToDocument} disabled={isProcessing}>
                  <Save size={15} /> {isProcessing ? t('sign.applying') : t('sign.apply')}
                </button>
              )}
              {currentPdfBytes && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = currentPdfUrl!; a.download = 'signed.pdf'; a.click(); }}
                >
                  <Download size={15} /> {t('sign.download')}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      <SignatureImportDialog
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onAccept={(png, aspect) => {
          setImported(prev => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { png, url: pngBytesToUrl(png), aspect };
          });
          setImportOpen(false);
        }}
      />
      {isDragging && (
        <div className="drop-veil">
          <span>{t('common.dropToOpen')}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The preview source for a placed bitmap stamp.
 *
 * Ink carries its strokes rather than a bitmap, so a URL is made once and
 * cached on the stamp itself; without the cache this would re-encode a PNG on
 * every render, which at sixty frames of a drag is thousands of encodes.
 */
const inkUrlCache = new Map<string, string>();

function stampImage(stamp: Stamp): string {
  if (stamp.url) return stamp.url;
  if (stamp.kind !== 'ink' || !stamp.strokes?.length) return '';

  const hit = inkUrlCache.get(stamp.id);
  if (hit) return hit;

  const data = rasteriseStrokes(stamp.strokes, stamp.color ?? '#000000', INK_PREVIEW_SCALE);
  if (!data) return '';
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')?.putImageData(data, 0, 0);
  const url = canvas.toDataURL('image/png');
  inkUrlCache.set(stamp.id, url);
  return url;
}
