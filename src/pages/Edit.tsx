import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import {
  Download, AlignLeft, AlignCenter, AlignRight,
  Trash2, Save, Bold, Italic, Type as TypeIcon,
  ZoomIn, ZoomOut, FileUp, Underline as UnderlineIcon,
  Palette, Ghost, Square, Layers as LayersIcon,
  Maximize2, MoveDiagonal, Search, Plus
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
}

const PRESET_COLORS = [
  '#ffffff', '#000000', '#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'
];

const SYSTEM_FONTS = [
  'Helvetica', 'Times', 'Courier', 'Arial', 'Verdana', 'Georgia', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Playfair Display'
];

export default function Edit() {
  const [file, setFile] = useState<File | null>(null);
  const [currentPdfBytes, setCurrentPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const [visualScale, setVisualScale] = useState(1.5);
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
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [fontSearch, setFontSearch] = useState('Helvetica');
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
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

  const allFontFamilies = useMemo(() => [...SYSTEM_FONTS, ...customFonts.map(f => f.name)], [customFonts]);
  const filteredFonts = useMemo(() => {
    const filtered = allFontFamilies.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()));
    const current = sel ? sel.fontFamily : activeFontFamily;
    return filtered.sort((a, b) => a === current ? -1 : b === current ? 1 : 0);
  }, [allFontFamilies, fontSearch, sel?.fontFamily, activeFontFamily]);

  const renderPage = useCallback(async (pageNum: number, scale: number, bytes?: Uint8Array) => {
    const data = bytes || currentPdfBytes;
    if (!data || !mainCanvasRef.current) return;
    try {
      if (!pdfDocRef.current || bytes) {
        if (pdfDocRef.current) await pdfDocRef.current.destroy();
        pdfDocRef.current = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
        setNumPages(pdfDocRef.current.numPages);
      }
      const page = await pdfDocRef.current.getPage(pageNum);
      // Use rotation from the page itself
      const rotation = page.rotate;
      const viewport = page.getViewport({ scale, rotation });

      setPageSize({ width: viewport.width / scale, height: viewport.height / scale });

      const canvas = mainCanvasRef.current;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      ctx.resetTransform();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) { console.error(e); }
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
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    setCurrentPdfBytes(bytes);
    setCurrentPdfUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    pdfDocRef.current = null;
    setFile(files[0]);
    renderPage(1, visualScale);
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

  const addElement = () => {
    if (!mainCanvasRef.current) return;
    // Calculate top-left based on mouse center
    const x = (mousePos.x * pageSize.width / 100) - (activeWidth / 2);
    const y = (mousePos.y * pageSize.height / 100) - (activeHeight / 2);

    const el: EditElement = {
      id: Math.random().toString(36).slice(2),
      x, y,
      width: activeWidth, height: activeHeight,
      color: activeBgColor, textColor: activeTextColor,
      text: activeText, fontSize: activeFontSize,
      isBold: activeBold, isItalic: activeItalic, isUnderline: activeUnderline,
      fontFamily: activeFontFamily, opacity: activeOpacity, borderRadius: activeBorderRadius,
      align: activeAlign, page: currentPage, showBox,
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
      const pages = pdfDoc.getPages();
      for (const el of elements) {
        const page = pages[el.page - 1];
        const { width, height } = page.getSize();
        const rotationAngle = page.getRotation().angle;

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

        if (el.showBox) {
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
        page.drawText(el.text, {
          x: drawX + textXOffset,
          y: drawY + (el.height / 2) - (el.fontSize / 3),
          size: el.fontSize, font, color: rgb(tr, tg, tb),
        });
      }
      const bytes = await pdfDoc.save();
      setCurrentPdfBytes(bytes);
      setCurrentPdfUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      setElements([]);

      // Force reload the new document
      pdfDocRef.current = null;
      renderPage(currentPage, visualScale, bytes);
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); }
  };

  useEffect(() => { if (currentPdfBytes) renderPage(currentPage, visualScale); }, [currentPage, visualScale, renderPage]);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div><h1>Studio Editor</h1><p>High-precision document markup engine.</p></div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="btn-group glass" style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', borderRadius: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setVisualScale(s => Math.max(0.25, s - 0.2))}><ZoomOut size={18} /></button>
            <span style={{ minWidth: '50px', textAlign: 'center', fontSize: '0.85rem' }}>{Math.round(visualScale * 100)}%</span>
            <button className="btn btn-secondary" onClick={() => setVisualScale(s => Math.min(4, s + 0.2))}><ZoomIn size={18} /></button>
          </div>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={18} /> Select New PDF
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
            accept=".pdf"
          />
          <button className="btn btn-primary" onClick={burnToPdf} disabled={isProcessing}><Save size={18} /> Burn Changes</button>
          {currentPdfUrl && <button className="btn btn-secondary" onClick={() => { const a = document.createElement('a'); a.href = currentPdfUrl; a.download = 'edited.pdf'; a.click(); }}><Download size={18} /> Download</button>}
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden' }}>
        <div style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {/* Properties Panel */}
          <div className="card glass" style={{ flexShrink: 0 }}>
            <h3 style={{ fontSize: '0.65rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>TEXT & TYPOGRAPHY</h3>
            <textarea
              value={sel ? sel.text : activeText}
              onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { text: v }); setActiveText(v); }}
              placeholder="Enter text..."
              style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '0.5rem', fontSize: '0.85rem', resize: 'none', minHeight: '60px', marginBottom: '1rem' }}
            />

            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="text" value={fontSearch} onFocus={() => setShowFontDropdown(true)} onChange={e => setFontSearch(e.target.value)} placeholder="Search fonts..." style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '0.4rem', fontSize: '0.85rem' }} />
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                </div>
                <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={() => fontInputRef.current?.click()}><Plus size={18} /></button>
                <input type="file" ref={fontInputRef} hidden accept=".ttf,.otf" onChange={handleFontUpload} />
              </div>
              <AnimatePresence>
                {showFontDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', marginTop: '0.4rem', maxHeight: '160px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  >
                    {filteredFonts.map(f => (
                      <div key={f} onClick={() => { updateElement(sel?.id || '', { fontFamily: f }); setActiveFontFamily(f); setFontSearch(f); setShowFontDropdown(false); }} style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontFamily: f, fontSize: '0.85rem', background: (sel ? sel.fontFamily : activeFontFamily) === f ? 'rgba(99,102,241,0.2)' : 'transparent' }}>{f}</div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {showFontDropdown && <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowFontDropdown(false)} />}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.3rem', marginBottom: '1rem' }}>
              <button className={`btn btn-secondary ${(sel ? sel.isBold : activeBold) ? 'active' : ''}`} onClick={() => { const v = !(sel ? sel.isBold : activeBold); setActiveBold(v); if (sel) updateElement(sel.id, { isBold: v }); }} style={{ padding: '0.5rem' }}><Bold size={14} /></button>
              <button className={`btn btn-secondary ${(sel ? sel.isItalic : activeItalic) ? 'active' : ''}`} onClick={() => { const v = !(sel ? sel.isItalic : activeItalic); setActiveItalic(v); if (sel) updateElement(sel.id, { isItalic: v }); }} style={{ padding: '0.5rem' }}><Italic size={14} /></button>
              <button className={`btn btn-secondary ${(sel ? sel.isUnderline : activeUnderline) ? 'active' : ''}`} onClick={() => { const v = !(sel ? sel.isUnderline : activeUnderline); setActiveUnderline(v); if (sel) updateElement(sel.id, { isUnderline: v }); }} style={{ padding: '0.5rem' }}><UnderlineIcon size={14} /></button>
              <button className={`btn btn-secondary ${(sel ? sel.align === 'left' : activeAlign === 'left') ? 'active' : ''}`} onClick={() => { setActiveAlign('left'); if (sel) updateElement(sel.id, { align: 'left' }); }} style={{ padding: '0.5rem' }}><AlignLeft size={14} /></button>
              <button className={`btn btn-secondary ${(sel ? sel.align === 'center' : activeAlign === 'center') ? 'active' : ''}`} onClick={() => { setActiveAlign('center'); if (sel) updateElement(sel.id, { align: 'center' }); }} style={{ padding: '0.5rem' }}><AlignCenter size={14} /></button>
              <button className={`btn btn-secondary ${(sel ? sel.align === 'right' : activeAlign === 'right') ? 'active' : ''}`} onClick={() => { setActiveAlign('right'); if (sel) updateElement(sel.id, { align: 'right' }); }} style={{ padding: '0.5rem' }}><AlignRight size={14} /></button>
            </div>

            <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>TEXT SIZE</span>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{sel ? sel.fontSize : activeFontSize}px</span>
              </div>
              <input type="range" min="8" max="72" value={sel ? sel.fontSize : activeFontSize} onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { fontSize: v }); setActiveFontSize(v); }} style={{ width: '100%' }} />
            </div>
          </div>

          <div className="card glass" style={{ flexShrink: 0 }}>
            <h3 style={{ fontSize: '0.65rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>APPEARANCE ENGINE</h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Ghost size={12} /> BACKGROUND</div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input type="color" value={sel ? sel.color : activeBgColor} onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { color: v }); setActiveBgColor(v); }} style={{ width: '32px', height: '32px', background: 'none', border: 'none', cursor: 'pointer' }} />
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.2rem' }}>
                  {PRESET_COLORS.map(c => <button key={`bg-${c}`} onClick={() => { updateElement(sel?.id || '', { color: c }); setActiveBgColor(c); }} style={{ width: '100%', aspectRatio: '1', borderRadius: '3px', background: c, border: (sel ? sel.color : activeBgColor) === c ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />)}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><TypeIcon size={12} /> TEXT COLOR</div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input type="color" value={sel ? sel.textColor : activeTextColor} onChange={e => { const v = e.target.value; updateElement(sel?.id || '', { textColor: v }); setActiveTextColor(v); }} style={{ width: '32px', height: '32px', background: 'none', border: 'none', cursor: 'pointer' }} />
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.2rem' }}>
                  {PRESET_COLORS.map(c => <button key={`tx-${c}`} onClick={() => { updateElement(sel?.id || '', { textColor: c }); setActiveTextColor(c); }} style={{ width: '100%', aspectRatio: '1', borderRadius: '3px', background: c, border: (sel ? sel.textColor : activeTextColor) === c ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />)}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>OPACITY</div>
                <input type="range" min="0" max="1" step="0.1" value={sel ? sel.opacity : activeOpacity} onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { opacity: v }); setActiveOpacity(v); }} style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>RADIUS</div>
                <input type="range" min="0" max="40" value={sel ? sel.borderRadius : activeBorderRadius} onChange={e => { const v = +e.target.value; updateElement(sel?.id || '', { borderRadius: v }); setActiveBorderRadius(v); }} style={{ width: '100%' }} />
              </div>
            </div>

            <button className={`btn btn-secondary ${(sel ? sel.showBox : showBox) ? 'active' : ''}`} onClick={() => { const v = !(sel ? sel.showBox : showBox); setShowBox(v); if (sel) updateElement(sel.id, { showBox: v }); }} style={{ width: '100%', height: '36px', fontSize: '0.75rem' }}>
              <Square size={14} /> {(sel ? sel.showBox : showBox) ? 'Hide Box' : 'Show Box'}
            </button>
          </div>

          <div className="card glass" style={{ flexShrink: 0 }}>
            <h3 style={{ fontSize: '0.65rem', marginBottom: '1rem', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>LAYER STACK</h3>
            {elements.map(el => (
              <div key={el.id} onClick={() => setSelectedId(el.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.4rem', background: selectedId === el.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', marginBottom: '0.4rem', border: '1px solid', borderColor: selectedId === el.id ? 'var(--accent)' : 'transparent' }}>
                <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.text}</span>
                <Trash2 size={14} style={{ color: '#f43f5e' }} onClick={() => setElements(p => p.filter(x => x.id !== el.id))} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'auto', position: 'relative', display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div style={{ position: 'relative', height: 'fit-content', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <canvas ref={mainCanvasRef} onMouseMove={handleMouseMove} onClick={addElement} style={{ display: 'block', cursor: 'crosshair' }} />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {isHovering && !selectedId && (
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
                    border: '2px dashed #f43f5e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: activeAlign === 'center' ? 'center' : activeAlign === 'left' ? 'flex-start' : 'flex-end',
                    textAlign: activeAlign,
                    padding: '0 0.75rem',
                    fontSize: activeFontSize * visualScale,
                    fontWeight: activeBold ? 'bold' : 'normal',
                    fontStyle: activeItalic ? 'italic' : 'normal',
                    fontFamily: activeFontFamily,
                    zIndex: 10,
                    boxShadow: '0 0 20px rgba(244, 63, 94, 0.2)',
                    backdropFilter: 'blur(4px)'
                  }}>
                    {activeText}
                  </div>
                )}
                {elements.filter(e => e.page === currentPage).map(el => (
                  <div key={el.id}
                    onPointerDown={(e) => startDragging(el.id, 'move', e)}
                    style={{
                      position: 'absolute',
                      left: el.x * visualScale,
                      top: el.y * visualScale,
                      width: el.width * visualScale,
                      height: el.height * visualScale,
                      background: el.showBox ? el.color : 'transparent',
                      color: el.textColor,
                      opacity: el.opacity,
                      borderRadius: `${el.borderRadius}px`,
                      border: selectedId === el.id ? '2px solid #f43f5e' : '1px solid rgba(255,255,255,0.1)',
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
                      fontFamily: el.fontFamily,
                      boxShadow: selectedId === el.id ? '0 0 15px rgba(244, 63, 94, 0.4)' : 'none'
                    }}>
                    {el.text}
                    {selectedId === el.id && (
                      <div
                        onPointerDown={(e) => startDragging(el.id, 'resize', e)}
                        className="resize-handle"
                        style={{ position: 'absolute', bottom: -6, right: -6, width: 12, height: 12, background: 'var(--accent)', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid white', zIndex: 10 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}