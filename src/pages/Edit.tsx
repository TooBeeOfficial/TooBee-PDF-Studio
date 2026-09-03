import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ACCEPTED_FILE_EXT } from '../components/FileUploader';
import EmptyStage from '../components/EmptyStage';
import { appendPdf } from '../utils/appendPdf';
import ValueInput from '../components/ValueInput';
import { toPdfFile } from '../utils/fileConverter';
import { useToolStore } from '../store/useToolStore';
import { useSystemFonts } from '../hooks/useSystemFonts';
import { usePreviewShortcuts } from '../hooks/usePreviewShortcuts';
import { useFitOnLoad } from '../hooks/useFitOnLoad';
import { SHAPES, shapeMeta, shapePath, type ShapeKind } from '../utils/shapes';
import {
  Download,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Save,
  Bold,
  Italic,
  ZoomIn,
  ZoomOut,
  FileUp,
  Underline as UnderlineIcon,
  Square,
  Search,
  Plus,
  MousePointer2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface CustomFont {
  name: string;
  bytes: Uint8Array;
  url: string;
}

interface EditElement {
  id: string;
  x: number; // PDF points
  y: number; // PDF points
  width: number; // PDF points
  height: number; // PDF points
  color: string;
  textColor: string;
  text: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  fontFamily: string;
  opacity: number;
  borderRadius: number;
  align: 'left' | 'center' | 'right';
  page: number;
  showBox: boolean;
  isCustomFont?: boolean;

  // ── Shapes ────────────────────────────────────────────────────────────────
  // Absent or 'text' keeps the original text-box behaviour untouched, so every
  // element created before shapes existed still renders and exports the same.
  kind?: ShapeKind;
  strokeColor?: string;
  strokeWidth?: number;
  /** Sides for a polygon, points for a star. */
  points?: number;
  /** Clockwise degrees about the shape's centre. Shapes only. */
  rotation?: number;
  /** Custom path vertices, normalised 0..1 against the element box. */
  path?: { x: number; y: number }[];
}

/** '#rrggbb' to the 0..1 channel triple pdf-lib's rgb() expects. */
function hexToRgb(hex: string) {
  const h = (hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

const PRESET_COLORS = [
  '#ffffff', '#000000', '#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'
];

const SYSTEM_FONTS = [
  'Helvetica', 'Times', 'Courier', 'Arial', 'Verdana', 'Georgia', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Playfair Display'
];

export default function Edit() {
  const { document: sharedDoc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: currentPdfBytes } = sharedDoc;
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  // Scale the bitmap on screen was drawn at; see PdfPreviewer for why.
  const [shownScale, setShownScale] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const [visualScale, setVisualScale] = useState(1);
  const [elements, setElements] = useState<EditElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Styling state (Inheritance source)
  const [activeBgColor, setActiveBgColor] = useState('#ffffff');
  const [activeTextColor, setActiveTextColor] = useState('#000000');
  const [activeText, setActiveText] = useState('New Element');
  const [activeFontSize, setActiveFontSize] = useState(14);
  const [activeAlign, setActiveAlign] = useState<'left' | 'center' | 'right'>('center');
  const [activeBold, setActiveBold] = useState(false);
  const [activeItalic, setActiveItalic] = useState(false);
  const [activeUnderline, setActiveUnderline] = useState(false);
  const [activeFontFamily, setActiveFontFamily] = useState('Helvetica');
  const [activeOpacity, setActiveOpacity] = useState(1);
  const [activeBorderRadius, setActiveBorderRadius] = useState(4);
  const [activeWidth, setActiveWidth] = useState(150); // in points
  const [activeHeight, setActiveHeight] = useState(40); // in points
  const [showBox, setShowBox] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const { systemFonts, status: fontStatus, load: loadSystemFonts } = useSystemFonts();

  // Which tool the next click on the page places. 'text' preserves the old
  // behaviour and stays the default.
  const [activeKind, setActiveKind] = useState<ShapeKind>('select');
  const [activeStrokeColor, setActiveStrokeColor] = useState('#f43f5e');
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(2);
  const [activePoints, setActivePoints] = useState(5);
  const [activeRotation, setActiveRotation] = useState(0);
  // Vertices collected while building a custom path, in page points.
  const [draftPath, setDraftPath] = useState<{ x: number; y: number }[]>([]);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [fontSearch, setFontSearch] = useState('Helvetica');
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string, type: 'move' | 'resize', startX: number, startY: number, initialX: number, initialY: number, initialW: number, initialH: number } | null>(null);

  const sel = elements.find(el => el.id === selectedId);

  // Property Inheritance Logic
  useEffect(() => {
    if (sel) {
      setActiveBgColor(sel.color);
      setActiveTextColor(sel.textColor);
      setActiveText(sel.text);
      setActiveFontSize(sel.fontSize);
      setActiveAlign(sel.align);
      setActiveBold(sel.isBold);
      setActiveItalic(sel.isItalic);
      setActiveUnderline(sel.isUnderline);
      setActiveFontFamily(sel.fontFamily);
      setActiveOpacity(sel.opacity);
      setActiveBorderRadius(sel.borderRadius);
      setActiveWidth(sel.width);
      setActiveHeight(sel.height);
      setShowBox(sel.showBox);
      setFontSearch(sel.fontFamily);
    }
  }, [selectedId, sel]);

  // Built-ins first (these are the ones that survive export), then uploaded
  // files, then everything installed on the machine.
  const allFontFamilies = useMemo(
    () => Array.from(new Set([...SYSTEM_FONTS, ...customFonts.map(f => f.name), ...systemFonts])),
    [customFonts, systemFonts]
  );
  const filteredFonts = useMemo(() => {
    const filtered = allFontFamilies.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()));
    const current = sel ? sel.fontFamily : activeFontFamily;
    return filtered.sort((a, b) => a === current ? -1 : b === current ? 1 : 0);
  }, [allFontFamilies, fontSearch, sel?.fontFamily, activeFontFamily]);

  const renderPage = useCallback(async (pageNum: number, scale: number) => {
    if (!currentPdfBytes || !mainCanvasRef.current) return;
    try {
      if (!pdfDocRef.current) {
        pdfDocRef.current = await pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise;
        setNumPages(pdfDocRef.current.numPages);
      }
      const page = await pdfDocRef.current.getPage(pageNum);
      // Use rotation from the page itself
      const rotation = page.rotate;
      const viewport = page.getViewport({ scale, rotation });

      setPageSize({ width: viewport.width / scale, height: viewport.height / scale });

      const canvas = mainCanvasRef.current;
      const dpr = window.devicePixelRatio || 1;

      // Draw off-screen and blit. Assigning canvas.width clears the bitmap, so
      // rendering straight into the visible canvas flashed the white page.
      const off = document.createElement('canvas');
      off.width = viewport.width * dpr;
      off.height = viewport.height * dpr;
      const offCtx = off.getContext('2d')!;
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // pdf.js throws if a second render starts on the same canvas before the
      // first finishes, so cancel any in-flight render before starting a new one.
      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: offCtx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      if (renderTaskRef.current === task) renderTaskRef.current = null;

      canvas.width = off.width;
      canvas.height = off.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
      setShownScale(scale);
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') console.error(e);
    }
  }, [currentPdfBytes]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    });
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
    if (sel) updateElement(sel.id, { fontFamily: name });
    else setActiveFontFamily(name);
    setFontSearch(name);
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!files.length) return;

    // Adding pages to the end leaves every existing element on the page it was
    // placed on, so annotations are kept rather than discarded.
    if (currentPdfBytes && currentPdfBytes.length && file) {
      try {
        const merged = await appendPdf(currentPdfBytes, files);
        noteNextChange('Added pages');
        pdfDocRef.current = null;
        setDocument(new File([merged], file.name, { type: 'application/pdf' }), merged);
        return;
      } catch (err) {
        console.error('Could not append to the open document', err);
      }
    }

    let f: File;
    try {
      f = await toPdfFile(files[0]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Unsupported file type.');
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    pdfDocRef.current = null;
    setDocument(f, bytes);
    // The effect below re-renders once currentPdfBytes lands; calling renderPage
    // here too would race it on the same canvas (stale closure, duplicate render).
  };

  const updateElement = (id: string, updates: Partial<EditElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const startDragging = (id: string, type: 'move' | 'resize', e: React.PointerEvent) => {
    e.stopPropagation();
    const el = elements.find(x => x.id === id);
    if (!el) return;
    setSelectedId(id);
    dragRef.current = {
      id, type,
      startX: e.clientX, startY: e.clientY,
      initialX: el.x, initialY: el.y,
      initialW: el.width, initialH: el.height
    };
  };

  const handleGlobalPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const { id, type, startX, startY, initialX, initialY, initialW, initialH } = dragRef.current;
    const dx = (e.clientX - startX) / visualScale;
    const dy = (e.clientY - startY) / visualScale;

    if (type === 'move') {
      updateElement(id, { x: initialX + dx, y: initialY + dy });
    } else {
      updateElement(id, { width: Math.max(10, initialW + dx), height: Math.max(10, initialH + dy) });
    }
  };

  const stopDragging = () => { dragRef.current = null; };

  useEffect(() => {
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [visualScale]);

  /** Finishes the custom path being built, turning the draft into an element. */
  const commitDraftPath = () => {
    if (draftPath.length < 3) { setDraftPath([]); return; }
    const xs = draftPath.map(p => p.x);
    const ys = draftPath.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);

    const el: EditElement = {
      id: Math.random().toString(36).slice(2),
      x: minX, y: minY, width: w, height: h,
      color: activeBgColor, textColor: activeTextColor,
      text: activeText, fontSize: activeFontSize,
      isBold: activeBold, isItalic: activeItalic, isUnderline: activeUnderline,
      fontFamily: activeFontFamily, opacity: activeOpacity,
      borderRadius: 0, align: activeAlign, page: currentPage, showBox: true,
      kind: 'path',
      strokeColor: activeStrokeColor,
      strokeWidth: activeStrokeWidth,
      rotation: activeRotation,
      // Normalised so the shape survives being resized later.
      path: draftPath.map(p => ({ x: (p.x - minX) / w, y: (p.y - minY) / h })),
    };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
    setDraftPath([]);
    setActiveKind('select');
  };

  /** Builds a line or arrow from the two points the user clicked. */
  const commitTwoPoint = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
    const w = Math.max(Math.abs(b.x - a.x), 1);
    const h = Math.max(Math.abs(b.y - a.y), 1);
    const el: EditElement = {
      id: Math.random().toString(36).slice(2),
      x: minX, y: minY, width: w, height: h,
      color: activeBgColor, textColor: activeTextColor,
      text: '', fontSize: activeFontSize,
      isBold: false, isItalic: false, isUnderline: false,
      fontFamily: activeFontFamily, opacity: activeOpacity,
      borderRadius: 0, align: 'left', page: currentPage, showBox: false,
      kind: activeKind,
      strokeColor: activeStrokeColor,
      strokeWidth: activeStrokeWidth,
      rotation: activeRotation,
      // Endpoints normalised to the box, so direction survives a later resize.
      path: [
        { x: (a.x - minX) / w, y: (a.y - minY) / h },
        { x: (b.x - minX) / w, y: (b.y - minY) / h },
      ],
    };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
    setActiveKind('select');
  };

  const addElement = () => {
    if (!mainCanvasRef.current) return;

    // Pointer mode: the page is for selecting, not placing.
    if (activeKind === 'select') { setSelectedId(null); return; }

    const point = {
      x: mousePos.x * pageSize.width / 100,
      y: mousePos.y * pageSize.height / 100,
    };

    // Path mode collects vertices instead of placing a shape per click.
    if (activeKind === 'path') {
      setDraftPath(prev => [...prev, point]);
      return;
    }

    // Line and arrow are placed by their two ends: first click sets the start,
    // second sets the end. Dropping a fixed-size diagonal was never what these
    // two shapes mean.
    if (activeKind === 'line' || activeKind === 'arrow') {
      if (draftPath.length === 0) setDraftPath([point]);
      else { commitTwoPoint(draftPath[0], point); setDraftPath([]); }
      return;
    }

    // Calculate top-left based on mouse center
    const x = (mousePos.x * pageSize.width / 100) - (activeWidth / 2);
    const y = (mousePos.y * pageSize.height / 100) - (activeHeight / 2);

    if (activeKind !== 'text') {
      const shape: EditElement = {
        id: Math.random().toString(36).slice(2),
        x, y,
        width: activeWidth, height: activeHeight,
        color: activeBgColor, textColor: activeTextColor,
        // Shapes carry a label like any other element; empty is fine.
        text: activeText, fontSize: activeFontSize,
        isBold: activeBold, isItalic: activeItalic, isUnderline: activeUnderline,
        fontFamily: activeFontFamily, opacity: activeOpacity,
        borderRadius: activeBorderRadius, align: 'left',
        page: currentPage, showBox: true,
        kind: activeKind,
        strokeColor: activeStrokeColor,
        strokeWidth: activeStrokeWidth,
        points: activePoints,
        rotation: activeRotation,
      };
      setElements(prev => [...prev, shape]);
      setSelectedId(shape.id);
      return;
    }

    const el: EditElement = {
      id: Math.random().toString(36).slice(2),
      x, y,
      width: activeWidth, height: activeHeight,
      color: activeBgColor, textColor: activeTextColor,
      text: activeText, fontSize: activeFontSize,
      isBold: activeBold, isItalic: activeItalic, isUnderline: activeUnderline,
      fontFamily: activeFontFamily, opacity: activeOpacity, borderRadius: activeBorderRadius,
      align: activeAlign, page: currentPage, showBox,
      kind: 'text',
      isCustomFont: customFonts.some(f => f.name === activeFontFamily)
    };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  };

  const burnToPdf = async () => {
    if (!currentPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(currentPdfBytes.slice(0));
      // Required before embedFont() will accept anything outside the standard
      // 14 faces. Without it, every uploaded or system font threw here.
      pdfDoc.registerFontkit(fontkit);
      const pages = pdfDoc.getPages();
      for (const el of elements) {
        const page = pages[el.page - 1];
        const { width, height } = page.getSize();
        const rotationAngle = page.getRotation().angle;

        // Shapes are written from the same path generator the preview uses, so
        // the exported result matches what was on screen. A shape then falls
        // through to the text pipeline below, so it can carry a label; only the
        // box-fill step is skipped, because the shape already is the box.
        const isShape = !!el.kind && el.kind !== 'text';
        if (isShape) {
          const meta = shapeMeta(el.kind);
          const d = shapePath(el.kind, el.width, el.height, {
            radius: el.borderRadius,
            points: el.points,
            path: el.path,
            rotation: el.rotation,
          });
          if (d) {
            const stroke = hexToRgb(el.strokeColor || '#000000');
            const fill = hexToRgb(el.color);
            // drawSvgPath treats the anchor as the SVG origin with y running
            // down, so the element's top-left maps to (x, pageHeight - y).
            page.drawSvgPath(d, {
              x: el.x,
              y: height - el.y,
              color: meta.filled && el.showBox ? rgb(fill.r, fill.g, fill.b) : undefined,
              opacity: el.opacity,
              borderColor: rgb(stroke.r, stroke.g, stroke.b),
              borderWidth: el.strokeWidth ?? 2,
              borderOpacity: el.opacity,
            });
          }
          // Nothing further to draw unless the shape has a label on it.
          if (!el.text) continue;
        }

        let font;
        const custom = customFonts.find(f => f.name === el.fontFamily);
        if (custom) font = await pdfDoc.embedFont(custom.bytes);
        else if (el.fontFamily === 'Helvetica') {
          font = el.isBold && el.isItalic ? await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
            : el.isBold ? await pdfDoc.embedFont(StandardFonts.HelveticaBold)
              : el.isItalic ? await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
                : await pdfDoc.embedFont(StandardFonts.Helvetica);
        } else if (el.fontFamily === 'Times') {
          font = el.isBold && el.isItalic ? await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic)
            : el.isBold ? await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
              : el.isItalic ? await pdfDoc.embedFont(StandardFonts.TimesRomanItalic)
                : await pdfDoc.embedFont(StandardFonts.TimesRoman);
        } else if (el.fontFamily === 'Courier') {
          font = el.isBold && el.isItalic ? await pdfDoc.embedFont(StandardFonts.CourierBoldOblique)
            : el.isBold ? await pdfDoc.embedFont(StandardFonts.CourierBold)
              : el.isItalic ? await pdfDoc.embedFont(StandardFonts.CourierOblique)
                : await pdfDoc.embedFont(StandardFonts.Courier);
        } else font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Coordinate transformation based on rotation
        const drawX = el.x;
        const drawY = height - el.y - el.height;

        // A shape has already painted its own fill via drawSvgPath, so the
        // rectangle fill below applies to plain text boxes only.
        if (el.showBox && !isShape) {
          const r = parseInt(el.color.slice(1, 3), 16) / 255;
          const g = parseInt(el.color.slice(3, 5), 16) / 255;
          const b = parseInt(el.color.slice(5, 7), 16) / 255;
          const fillColor = rgb(r, g, b);
          const rad = Math.min(el.borderRadius, el.width / 2, el.height / 2);

          if (rad > 0) {
            // Draw central cross rectangles
            page.drawRectangle({
              x: drawX + rad, y: drawY,
              width: el.width - 2 * rad, height: el.height,
              color: fillColor, opacity: el.opacity,
            });
            page.drawRectangle({
              x: drawX, y: drawY + rad,
              width: el.width, height: el.height - 2 * rad,
              color: fillColor, opacity: el.opacity,
            });
            // Draw four corner circles
            const corners = [
              { cx: drawX + rad, cy: drawY + rad }, // Bottom-left
              { cx: drawX + el.width - rad, cy: drawY + rad }, // Bottom-right
              { cx: drawX + rad, cy: drawY + el.height - rad }, // Top-left
              { cx: drawX + el.width - rad, cy: drawY + el.height - rad } // Top-right
            ];
            for (const c of corners) {
              page.drawCircle({
                x: c.cx, y: c.cy, size: rad,
                color: fillColor, opacity: el.opacity,
              });
            }
          } else {
            page.drawRectangle({
              x: drawX, y: drawY,
              width: el.width, height: el.height,
              color: fillColor, opacity: el.opacity,
            });
          }
        }

        const tr = parseInt(el.textColor.slice(1, 3), 16) / 255;
        const tg = parseInt(el.textColor.slice(3, 5), 16) / 255;
        const tb = parseInt(el.textColor.slice(5, 7), 16) / 255;

        const textWidth = font.widthOfTextAtSize(el.text, el.fontSize);
        let textXOffset = 5;
        if (el.align === 'center') textXOffset = (el.width / 2) - (textWidth / 2);
        if (el.align === 'right') textXOffset = el.width - textWidth - 5;

        // For rotated pages, we draw relative to the box orientation
        const textY = drawY + (el.height / 2) - (el.fontSize / 3);
        page.drawText(el.text, {
          x: drawX + textXOffset,
          y: textY,
          size: el.fontSize, font, color: rgb(tr, tg, tb),
        });

        // pdf-lib has no text-decoration option, so underline is a manually drawn line
        if (el.isUnderline) {
          const underlineY = textY - el.fontSize * 0.12;
          page.drawLine({
            start: { x: drawX + textXOffset, y: underlineY },
            end: { x: drawX + textXOffset + textWidth, y: underlineY },
            thickness: Math.max(1, el.fontSize * 0.06),
            color: rgb(tr, tg, tb),
          });
        }
      }
      const bytes = await pdfDoc.save();
      setElements([]);

      // Force the effect below to reload and re-render the burned document;
      // calling renderPage directly here too would race it on the same canvas.
      pdfDocRef.current = null;
      // The burned result becomes the new working document, so other tools
      // pick up these edits instead of the pre-edit file.
      setDocument(new File([bytes], file?.name || 'edited.pdf', { type: 'application/pdf' }), bytes);
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); }
  };

  const { onWheel: onPreviewWheel } = usePreviewShortcuts({
    enabled: !!file,
    zoom: { value: visualScale, set: setVisualScale, min: 0.25, max: 4, step: 0.2, reset: 1 },
    page: { current: currentPage, total: numPages, set: setCurrentPage },
    hasSelection: !!selectedId,
    onNudge: (dx, dy) => {
      if (!selectedId) return;
      setElements(prev => prev.map(el =>
        el.id === selectedId ? { ...el, x: el.x + dx, y: el.y + dy } : el));
    },
    onDelete: () => {
      if (!selectedId) return;
      setElements(prev => prev.filter(el => el.id !== selectedId));
      setSelectedId(null);
    },
    // Escape backs out of whatever is in progress: first the shape being
    // drawn, then the selection.
    onEscape: () => {
      if (draftPath.length) setDraftPath([]);
      else if (selectedId) setSelectedId(null);
    },
  });

  // Open with the first page fitted to the stage rather than at a fixed zoom.
  useFitOnLoad({
    key: file && currentPdfBytes ? `${file.name}:${currentPdfBytes.length}` : null,
    stageRef,
    canvasRef: mainCanvasRef,
    scale: visualScale,
    setScale: setVisualScale,
  });

  // Keep the download link (and pdf.js source) in sync with the shared document,
  // however it got there — burned here, or edited by another tool and carried over.
  useEffect(() => {
    if (!currentPdfBytes) { setCurrentPdfUrl(null); return; }
    const url = URL.createObjectURL(new Blob([currentPdfBytes], { type: 'application/pdf' }));
    setCurrentPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentPdfBytes]);

  useEffect(() => { if (currentPdfBytes) renderPage(currentPage, visualScale); }, [currentPage, visualScale, renderPage]);

  return (
    <div className="fade-in">
      <header className="view-header">
        <h1>Studio editor</h1>
      </header>

      <div className="workbench">
        <div className="stage">
          {!file ? (
            <EmptyStage
              motif="edit"
              headline={"Add text to a page"}
              onFilesSelected={handleFilesSelected}
            />
          ) : (
            <>
              <div className="stage-canvas" ref={stageRef} onWheel={onPreviewWheel}>
                <div
                  className="canvas-frame"
                  style={pageSize.width ? {
                    width: pageSize.width * visualScale,
                    height: pageSize.height * visualScale,
                  } : undefined}
                >
                  {/* Carries the previous bitmap, scaled, until the re-render lands. */}
                  <div style={shownScale > 0 ? {
                    transform: `scale(${visualScale / shownScale})`,
                    transformOrigin: '0 0',
                  } : undefined}>
                    <canvas ref={mainCanvasRef} onMouseMove={handleMouseMove} onClick={addElement} style={{ display: 'block', cursor: activeKind === 'select' ? 'default' : 'crosshair' }} />
                  </div>
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {isHovering && !selectedId && activeKind === 'text' && (
                      <div style={{
                        position: 'absolute',
                        left: (mousePos.x * (pageSize.width * visualScale) / 100) - (activeWidth * visualScale / 2),
                        top: (mousePos.y * (pageSize.height * visualScale) / 100) - (activeHeight * visualScale / 2),
                        width: activeWidth * visualScale,
                        height: activeHeight * visualScale,
                        background: showBox ? activeBgColor : 'transparent',
                        color: activeTextColor,
                        opacity: activeOpacity * 0.6,
                        borderRadius: `${activeBorderRadius}px`,
                        border: '1px dashed var(--amber)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: activeAlign === 'center' ? 'center' : activeAlign === 'left' ? 'flex-start' : 'flex-end',
                        textAlign: activeAlign,
                        padding: '0 0.75rem',
                        fontSize: activeFontSize * visualScale,
                        fontWeight: activeBold ? 'bold' : 'normal',
                        fontStyle: activeItalic ? 'italic' : 'normal',
                        textDecoration: activeUnderline ? 'underline' : 'none',
                        fontFamily: activeFontFamily,
                        zIndex: 10
                      }}>
                        {activeText}
                      </div>
                    )}
                    {elements.filter(e => e.page === currentPage).map(el => {
                      const isShape = !!el.kind && el.kind !== 'text';
                      const meta = shapeMeta(el.kind || 'text');
                      const w = el.width * visualScale;
                      const h = el.height * visualScale;
                      return (
                        <div key={el.id}
                          onPointerDown={(e) => startDragging(el.id, 'move', e)}
                          style={{
                            position: 'absolute',
                            left: el.x * visualScale,
                            top: el.y * visualScale,
                            width: w,
                            height: h,
                            background: isShape ? 'transparent' : (el.showBox ? el.color : 'transparent'),
                            color: el.textColor,
                            opacity: el.opacity,
                            borderRadius: isShape ? 0 : `${el.borderRadius}px`,
                            border: selectedId === el.id ? '1px solid var(--amber)' : '1px solid transparent',
                            pointerEvents: 'all',
                            cursor: 'move',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: el.align === 'center' ? 'center' : el.align === 'left' ? 'flex-start' : 'flex-end',
                            textAlign: el.align,
                            padding: '0 0.75rem',
                            fontSize: el.fontSize * visualScale,
                            fontWeight: el.isBold ? 'bold' : 'normal',
                            fontStyle: el.isItalic ? 'italic' : 'normal',
                            textDecoration: el.isUnderline ? 'underline' : 'none',
                            fontFamily: el.fontFamily
                          }}>
                          {isShape && (
                            /* Same path generator burnToPdf uses, so the preview
                               and the exported PDF cannot drift apart. Sits
                               behind the label rather than instead of it. */
                            <svg
                              width={w}
                              height={h}
                              style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible', pointerEvents: 'none' }}
                            >
                              <path
                                d={shapePath(el.kind!, w, h, {
                                  radius: el.borderRadius * visualScale,
                                  points: el.points,
                                  path: el.path,
                                  rotation: el.rotation,
                                })}
                                fill={meta.filled && el.showBox ? el.color : 'none'}
                                stroke={el.strokeColor || '#000000'}
                                strokeWidth={(el.strokeWidth ?? 2) * visualScale}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                          {el.text && (
                            <span style={{ position: 'relative', width: '100%', textAlign: el.align }}>
                              {el.text}
                            </span>
                          )}
                          {selectedId === el.id && (
                            <div
                              onPointerDown={(e) => startDragging(el.id, 'resize', e)}
                              className="resize-handle"
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Rubber band between the placed start point and the cursor. */}
                    {(activeKind === 'line' || activeKind === 'arrow') && draftPath.length === 1 && (
                      <svg
                        width={pageSize.width * visualScale}
                        height={pageSize.height * visualScale}
                        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                      >
                        <line
                          x1={draftPath[0].x * visualScale}
                          y1={draftPath[0].y * visualScale}
                          x2={mousePos.x * pageSize.width / 100 * visualScale}
                          y2={mousePos.y * pageSize.height / 100 * visualScale}
                          stroke="var(--amber)"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                        <circle
                          cx={draftPath[0].x * visualScale}
                          cy={draftPath[0].y * visualScale}
                          r={3}
                          fill="var(--amber)"
                        />
                      </svg>
                    )}

                    {/* Vertices placed so far while building a custom path. */}
                    {activeKind === 'path' && draftPath.length > 0 && (
                      <svg
                        width={pageSize.width * visualScale}
                        height={pageSize.height * visualScale}
                        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                      >
                        <polyline
                          points={draftPath.map(p => `${p.x * visualScale},${p.y * visualScale}`).join(' ')}
                          fill="none"
                          stroke="var(--amber)"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                        {draftPath.map((p, i) => (
                          <circle key={i} cx={p.x * visualScale} cy={p.y * visualScale} r={3}
                            fill="var(--amber)" />
                        ))}
                      </svg>
                    )}
                  </div>
                </div>
              </div>

              {activeKind === 'path' && (
                <div className="path-bar">
                  <span className="hint">
                    Click the page to add points · <span className="num">{draftPath.length}</span> placed
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={commitDraftPath} disabled={draftPath.length < 3}>
                    Close shape
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraftPath([])} disabled={!draftPath.length}>
                    Clear
                  </button>
                </div>
              )}

              {(activeKind === 'line' || activeKind === 'arrow') && (
                <div className="path-bar">
                  <span className="hint">
                    {draftPath.length === 0
                      ? `Click where the ${activeKind} starts.`
                      : `Click where the ${activeKind} ends.`}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraftPath([])} disabled={!draftPath.length}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Page navigation belongs under the document it moves through. */}
              {numPages > 1 && (
                <div className="page-nav">
                  <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>Prev</button>
                  <span className="page-nav-label">
                    Page <span className="num">{currentPage}</span> of <span className="num">{numPages}</span>
                  </span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>Next</button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">Document</div>
              {file && <div className="file-name" title={file.name}>{file.name}</div>}
              <div className="zoom-control">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setVisualScale(s => Math.max(0.25, s - 0.2))} aria-label="Zoom out"><ZoomOut size={14} /></button>
                <ValueInput label="Zoom" suffix="%" min={25} max={400} step={10} width={56}
                  value={Math.round(visualScale * 100)}
                  onCommit={v => setVisualScale(v / 100)} />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setVisualScale(s => Math.min(4, s + 0.2))} aria-label="Zoom in"><ZoomIn size={14} /></button>
              </div>
              <button className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
                <FileUp size={15} /> Add PDF
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    setElements([]);
                    setCurrentPage(1);
                    handleFilesSelected(Array.from(e.target.files));
                  }
                }}
                style={{ display: 'none' }}
                accept={ACCEPTED_FILE_EXT}
                multiple
              />
            </div>

            <div className="inspector-group">
              <div className="t-eyebrow">Tool</div>
              <div className="shape-palette" role="radiogroup" aria-label="Shape tool">
                {SHAPES.map(sh => (
                  <button
                    key={sh.kind}
                    role="radio"
                    aria-checked={activeKind === sh.kind}
                    title={sh.label}
                    aria-label={sh.label}
                    className={`shape-tool ${activeKind === sh.kind ? 'selected' : ''}`}
                    onClick={() => { setActiveKind(sh.kind); setDraftPath([]); }}
                  >
                    {sh.kind === 'select'
                      ? <MousePointer2 size={15} />
                      : sh.kind === 'text'
                      ? <span className="shape-tool-glyph">A</span>
                      : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d={shapePath(sh.kind, 20, 20, { radius: 4, points: 5, path: [
                              { x: 0, y: 0.1 }, { x: 1, y: 0 }, { x: 0.8, y: 1 }, { x: 0.1, y: 0.7 },
                            ] })}
                            transform="translate(2 2)"
                            fill={shapeMeta(sh.kind).filled ? 'currentColor' : 'none'}
                            fillOpacity={0.25}
                            stroke="currentColor"
                            strokeWidth={1.5}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                  </button>
                ))}
              </div>
              <p className="hint">
                {activeKind === 'select'
                  ? 'Click a shape to select and edit it.'
                  : activeKind === 'path'
                  ? 'Click the page to place points, then close the shape.'
                  : `Click the page to place ${shapeMeta(activeKind).label.toLowerCase()}.`}
              </p>
            </div>

            {((activeKind !== 'text' && activeKind !== 'select') || (sel && sel.kind && sel.kind !== 'text')) && (
              <div className="inspector-group">
                <div className="t-eyebrow">Shape</div>

                <div className="field">
                  <label>Stroke</label>
                  <div className="swatch-row">
                    <span className="swatch-native">
                      <input type="color"
                        value={sel?.strokeColor ?? activeStrokeColor}
                        onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { strokeColor: v }); setActiveStrokeColor(v); }}
                        aria-label="Custom stroke colour" />
                      <span style={{ background: sel?.strokeColor ?? activeStrokeColor }} />
                    </span>
                    <div className="swatches">
                      {PRESET_COLORS.map(c => (
                        <button key={`st-${c}`}
                          onClick={() => { updateElement(sel?.id || '', { strokeColor: c }); setActiveStrokeColor(c); }}
                          className={`swatch ${(sel?.strokeColor ?? activeStrokeColor) === c ? 'selected' : ''}`}
                          style={{ background: c }} aria-label={`Stroke ${c}`} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="field">
                  <div className="range-head">
                    <label htmlFor="edit-stroke">Stroke width</label>
                    <ValueInput label="Stroke width" min={0} max={40} width={52}
                      value={sel?.strokeWidth ?? activeStrokeWidth}
                      onCommit={v => { updateElement(sel?.id || '', { strokeWidth: v }); setActiveStrokeWidth(v); }} />
                  </div>
                  <input id="edit-stroke" type="range" min="0" max="20"
                    value={sel?.strokeWidth ?? activeStrokeWidth}
                    onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { strokeWidth: v }); setActiveStrokeWidth(v); }} />
                </div>

                <div className="field">
                  <div className="range-head">
                    <label htmlFor="edit-rotation">Rotation</label>
                    <ValueInput label="Rotation" suffix="°" min={0} max={359} width={58}
                      value={sel?.rotation ?? activeRotation}
                      onCommit={v => { updateElement(sel?.id || '', { rotation: v }); setActiveRotation(v); }} />
                  </div>
                  <input id="edit-rotation" type="range" min="0" max="359"
                    value={sel?.rotation ?? activeRotation}
                    onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { rotation: v }); setActiveRotation(v); }} />
                  <div className="control-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                    {[0, 45, 90, 180, 270].map(deg => (
                      <button
                        key={deg}
                        className={`btn btn-secondary btn-sm ${(sel?.rotation ?? activeRotation) === deg ? 'active' : ''}`}
                        onClick={() => { updateElement(sel?.id || '', { rotation: deg }); setActiveRotation(deg); }}
                      >
                        <span className="num">{deg}°</span>
                      </button>
                    ))}
                  </div>
                </div>

                {shapeMeta((sel?.kind ?? activeKind) as ShapeKind).hasPoints && (
                  <div className="field">
                    <div className="range-head">
                      <label htmlFor="edit-points">Points</label>
                      <ValueInput label="Points" min={3} max={12} width={52}
                      value={sel?.points ?? activePoints}
                      onCommit={v => { updateElement(sel?.id || '', { points: Math.round(v) }); setActivePoints(Math.round(v)); }} />
                    </div>
                    <input id="edit-points" type="range" min="3" max="12"
                      value={sel?.points ?? activePoints}
                      onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { points: v }); setActivePoints(v); }} />
                  </div>
                )}
              </div>
            )}

            <div className="inspector-group">
              <div className="t-eyebrow">Text</div>

              <div className="field">
                <label htmlFor="edit-text">Content</label>
                <textarea
                  id="edit-text"
                  className="input"
                  value={sel ? sel.text : activeText}
                  onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { text: v }); setActiveText(v); }}
                  placeholder="Enter text"
                  style={{ height: 'auto', minHeight: '60px', padding: 'var(--s-2)', resize: 'vertical', lineHeight: 1.45 }}
                />
              </div>

              <div className="field" style={{ position: 'relative' }}>
                <label htmlFor="edit-font">Typeface</label>
                <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                  <div className="input-with-icon">
                    <Search size={13} />
                    <input
                      id="edit-font"
                      onClick={loadSystemFonts}
                      type="text"
                      className="input"
                      value={fontSearch}
                      onFocus={() => setShowFontDropdown(true)}
                      onChange={e => setFontSearch(e.target.value)}
                      placeholder="Search fonts"
                    />
                  </div>
                  <button className="btn btn-secondary btn-icon" onClick={() => fontInputRef.current?.click()} aria-label="Add a font file">
                    <Plus size={15} />
                  </button>
                  <input type="file" ref={fontInputRef} hidden accept=".ttf,.otf" onChange={handleFontUpload} />
                </div>
                <AnimatePresence>
                  {showFontDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      className="font-menu"
                    >
                      {filteredFonts.map(f => (
                        <button
                          key={f}
                          type="button"
                          className={`font-option ${(sel ? sel.fontFamily : activeFontFamily) === f ? 'selected' : ''}`}
                          style={{ fontFamily: f }}
                          onClick={() => { updateElement(sel?.id || '', { fontFamily: f }); setActiveFontFamily(f); setFontSearch(f); setShowFontDropdown(false); }}
                        >
                          {f}
                        </button>
                      ))}
                      {fontStatus === 'loading' && (
                        <p className="font-menu-note">Reading installed fonts…</p>
                      )}
                      {fontStatus === 'ready' && (
                        <p className="font-menu-note">
                          <span className="num">{systemFonts.length}</span> fonts installed on this machine
                        </p>
                      )}
                      {(fontStatus === 'denied' || fontStatus === 'unavailable') && (
                        <p className="font-menu-note">Installed fonts could not be read. Upload a font file with +.</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                {showFontDropdown && <div className="menu-scrim" onClick={() => setShowFontDropdown(false)} />}
              </div>

              <div className="field">
                <label>Style</label>
                <div className="control-grid">
                  <button className={`btn btn-secondary btn-sm ${(sel ? sel.isBold : activeBold) ? 'active' : ''}`} aria-pressed={sel ? sel.isBold : activeBold} aria-label="Bold" onClick={() => { const v = !(sel ? sel.isBold : activeBold); setActiveBold(v); if (sel) updateElement(sel.id, { isBold: v }); }}><Bold size={13} /></button>
                  <button className={`btn btn-secondary btn-sm ${(sel ? sel.isItalic : activeItalic) ? 'active' : ''}`} aria-pressed={sel ? sel.isItalic : activeItalic} aria-label="Italic" onClick={() => { const v = !(sel ? sel.isItalic : activeItalic); setActiveItalic(v); if (sel) updateElement(sel.id, { isItalic: v }); }}><Italic size={13} /></button>
                  <button className={`btn btn-secondary btn-sm ${(sel ? sel.isUnderline : activeUnderline) ? 'active' : ''}`} aria-pressed={sel ? sel.isUnderline : activeUnderline} aria-label="Underline" onClick={() => { const v = !(sel ? sel.isUnderline : activeUnderline); setActiveUnderline(v); if (sel) updateElement(sel.id, { isUnderline: v }); }}><UnderlineIcon size={13} /></button>
                  <button className={`btn btn-secondary btn-sm ${(sel ? sel.align === 'left' : activeAlign === 'left') ? 'active' : ''}`} aria-pressed={sel ? sel.align === 'left' : activeAlign === 'left'} aria-label="Align left" onClick={() => { setActiveAlign('left'); if (sel) updateElement(sel.id, { align: 'left' }); }}><AlignLeft size={13} /></button>
                  <button className={`btn btn-secondary btn-sm ${(sel ? sel.align === 'center' : activeAlign === 'center') ? 'active' : ''}`} aria-pressed={sel ? sel.align === 'center' : activeAlign === 'center'} aria-label="Align centre" onClick={() => { setActiveAlign('center'); if (sel) updateElement(sel.id, { align: 'center' }); }}><AlignCenter size={13} /></button>
                  <button className={`btn btn-secondary btn-sm ${(sel ? sel.align === 'right' : activeAlign === 'right') ? 'active' : ''}`} aria-pressed={sel ? sel.align === 'right' : activeAlign === 'right'} aria-label="Align right" onClick={() => { setActiveAlign('right'); if (sel) updateElement(sel.id, { align: 'right' }); }}><AlignRight size={13} /></button>
                </div>
              </div>

              <div className="field">
                <div className="range-head">
                  <label htmlFor="edit-size">Size</label>
                  <ValueInput label="Text size" suffix="px" min={4} max={400} width={58}
                      value={sel ? sel.fontSize : activeFontSize}
                      onCommit={v => { updateElement(sel?.id || '', { fontSize: v }); setActiveFontSize(v); }} />
                </div>
                <input id="edit-size" type="range" min="8" max="72" value={sel ? sel.fontSize : activeFontSize} onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { fontSize: v }); setActiveFontSize(v); }} />
              </div>
            </div>

            <div className="inspector-group">
              <div className="t-eyebrow">Appearance</div>

              <div className="field">
                <label>Background</label>
                <div className="swatch-row">
                  <span className="swatch-native">
                    <input type="color" value={sel ? sel.color : activeBgColor} onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { color: v }); setActiveBgColor(v); }} aria-label="Custom background colour" />
                    <span style={{ background: sel ? sel.color : activeBgColor }} />
                  </span>
                  <div className="swatches">
                    {PRESET_COLORS.map(c => (
                      <button key={`bg-${c}`} onClick={() => { updateElement(sel?.id || '', { color: c }); setActiveBgColor(c); }}
                        className={`swatch ${(sel ? sel.color : activeBgColor) === c ? 'selected' : ''}`}
                        style={{ background: c }} aria-label={`Background ${c}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Text colour</label>
                <div className="swatch-row">
                  <span className="swatch-native">
                    <input type="color" value={sel ? sel.textColor : activeTextColor} onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { textColor: v }); setActiveTextColor(v); }} aria-label="Custom text colour" />
                    <span style={{ background: sel ? sel.textColor : activeTextColor }} />
                  </span>
                  <div className="swatches">
                    {PRESET_COLORS.map(c => (
                      <button key={`tx-${c}`} onClick={() => { updateElement(sel?.id || '', { textColor: c }); setActiveTextColor(c); }}
                        className={`swatch ${(sel ? sel.textColor : activeTextColor) === c ? 'selected' : ''}`}
                        style={{ background: c }} aria-label={`Text colour ${c}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
                <div className="field">
                  <div className="range-head">
                    <label htmlFor="edit-opacity">Opacity</label>
                    <ValueInput label="Opacity" suffix="%" min={0} max={100} step={5} width={58}
                      value={Math.round((sel ? sel.opacity : activeOpacity) * 100)}
                      onCommit={v => { const o = v / 100; updateElement(sel?.id || '', { opacity: o }); setActiveOpacity(o); }} />
                  </div>
                  <input id="edit-opacity" type="range" min="0" max="1" step="0.1" value={sel ? sel.opacity : activeOpacity} onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { opacity: v }); setActiveOpacity(v); }} />
                </div>
                <div className="field">
                  <div className="range-head">
                    <label htmlFor="edit-radius">Radius</label>
                    <ValueInput label="Corner radius" min={0} max={200} width={52}
                      value={sel ? sel.borderRadius : activeBorderRadius}
                      onCommit={v => { updateElement(sel?.id || '', { borderRadius: v }); setActiveBorderRadius(v); }} />
                  </div>
                  <input id="edit-radius" type="range" min="0" max="40" value={sel ? sel.borderRadius : activeBorderRadius} onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { borderRadius: v }); setActiveBorderRadius(v); }} />
                </div>
              </div>

              <button
                className={`btn btn-secondary btn-block ${(sel ? sel.showBox : showBox) ? 'active' : ''}`}
                aria-pressed={sel ? sel.showBox : showBox}
                onClick={() => { const v = !(sel ? sel.showBox : showBox); setShowBox(v); if (sel) updateElement(sel.id, { showBox: v }); }}
              >
                <Square size={14} /> {(sel ? sel.showBox : showBox) ? 'Hide box' : 'Show box'}
              </button>
            </div>

            <div className="inspector-group">
              <div className="t-eyebrow">
                Layers
                {elements.length > 0 && <span className="count num">{elements.length}</span>}
              </div>
              {elements.length === 0 ? (
                <p className="hint">Click the page to add a text box.</p>
              ) : (
                <ul className="queue">
                  {elements.map(el => (
                    <li key={el.id} className={`queue-item ${selectedId === el.id ? 'selected' : ''}`}>
                      <button className="queue-name queue-select" onClick={() => setSelectedId(el.id)}>
                        {el.kind && el.kind !== 'text'
                          ? shapeMeta(el.kind).label
                          : (el.text || 'Empty text box')}
                      </button>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => setElements(p => p.filter(x => x.id !== el.id))}
                        aria-label="Delete layer"
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
              <button className="btn btn-primary btn-block" onClick={burnToPdf} disabled={isProcessing}>
                <Save size={15} /> {isProcessing ? 'Applying…' : 'Apply changes'}
              </button>
              {currentPdfUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = currentPdfUrl; a.download = 'edited.pdf'; a.click(); }}
                >
                  <Download size={15} /> Save edited PDF
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
