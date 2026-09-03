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
import { Download, Trash2, Save, FileUp, ZoomIn, ZoomOut, Search, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PRESET_COLORS = [
  '#ffffff', '#000000', '#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'
];

const SYSTEM_FONTS = [
  'Helvetica', 'TimesRomanItalic', 'CourierBold', 'Arial', 'Verdana', 'Georgia', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins'
];

interface CustomFont {
  name: string;
  bytes: Uint8Array;
  url: string;
}

interface Signature {
  id: string;
  x: number; // percentage
  y: number; // percentage
  text: string;
  page: number;
  font: string;
  color: string;
  isCustom?: boolean;
}

export default function Sign() {
  const { document: sharedDoc, setDocument } = useToolStore();
  const { file, bytes: currentPdfBytes } = sharedDoc;
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [signatureText, setSignatureText] = useState("");
  const [selectedFont, setSelectedFont] = useState("Helvetica");
  const [selectedColor, setSelectedColor] = useState("#000000");
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
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  // Custom Font state
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const { systemFonts, status: fontStatus, load: loadSystemFonts } = useSystemFonts();
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [fontSearch, setFontSearch] = useState('Helvetica');
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      alert(e instanceof Error ? e.message : 'Unsupported file type.');
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

  const handleZoom = (delta: number) => {
    setVisualScale(prev => {
      const next = Math.min(4, Math.max(0.25, prev + delta));
      return next;
    });
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      handleZoom(delta);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    });
  };

  const handleCanvasClick = () => {
    if (!signatureText) return;
    const newSig: Signature = {
      id: Math.random().toString(36).substr(2, 9),
      x: mousePos.x, y: mousePos.y, text: signatureText, page: currentPage, 
      font: selectedFont,
      color: selectedColor,
      isCustom: customFonts.some(f => f.name === selectedFont)
    };
    setSignatures(prev => [...prev, newSig]);
  };

  const { onWheel: onPreviewWheel } = usePreviewShortcuts({
    enabled: !!file,
    zoom: { value: visualScale, set: setVisualScale, min: 0.25, max: 4, step: 0.2, reset: 1 },
    page: { current: currentPage, total: numPages, set: setCurrentPage },
  });

  // Open with the first page fitted to the stage rather than at a fixed zoom.
  useFitOnLoad({
    key: file && currentPdfBytes ? `${file.name}:${currentPdfBytes.length}` : null,
    stageRef,
    canvasRef: mainCanvasRef,
    scale: visualScale,
    setScale: setVisualScale,
  });

  const applySignatures = async () => {
    if (!currentPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(currentPdfBytes.slice(0));
      // Required before embedFont() will accept anything outside the standard
      // 14 faces. Without it, every uploaded font threw here.
      pdfDoc.registerFontkit(fontkit);
      const pages = pdfDoc.getPages();
      for (const sig of signatures) {
        const page = pages[sig.page - 1];
        const { width, height } = page.getSize();
        const px = (sig.x / 100) * width;
        const py = height - ((sig.y / 100) * height);
        
        let font;
        const custom = customFonts.find(f => f.name === sig.font);
        if (custom) {
          font = await pdfDoc.embedFont(custom.bytes);
        } else if (sig.font === "TimesRomanItalic") font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
        else if (sig.font === "CourierBold") font = await pdfDoc.embedFont(StandardFonts.CourierBold);
        else font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        const r = parseInt(sig.color.slice(1, 3), 16) / 255;
        const g = parseInt(sig.color.slice(3, 5), 16) / 255;
        const b = parseInt(sig.color.slice(5, 7), 16) / 255;

        page.drawText(sig.text, { x: px, y: py - 15, size: 24, font, color: rgb(r, g, b) });
      }
      const newBytes = await pdfDoc.save();
      setSignatures([]);
      // The signed result becomes the new working document, so other tools
      // pick up these signatures instead of the pre-sign file. The effect
      // below re-renders once it lands; calling performRender here too would
      // race it on the same canvas.
      setDocument(new File([newBytes], file?.name || 'signed.pdf', { type: 'application/pdf' }), newBytes);
    } catch (e) {
      console.error(e);
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

  return (
    <div className="fade-in">
      <header className="view-header">
        <h1>Sign</h1>
      </header>

      <div className="workbench">
        <div className="stage" onWheel={onPreviewWheel}>
          {!file ? (
            <EmptyStage
              motif="sign"
              headline={"Sign a document"}
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
                  style={{
                    cursor: signatureText ? 'none' : 'default',
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
                    <canvas ref={mainCanvasRef} onMouseMove={handleMouseMove} onClick={handleCanvasClick} style={{ display: 'block' }} />
                  </div>
                  <canvas ref={bufferCanvasRef} style={{ display: 'none' }} />

                  {isHovering && signatureText && (
                    <div style={{ position: 'absolute', left: `${mousePos.x}%`, top: `${mousePos.y}%`, color: selectedColor, pointerEvents: 'none', fontSize: `${24 * visualScale}px`, fontFamily: selectedFont, transform: 'translate(-50%, -50%)', opacity: 0.5, whiteSpace: 'nowrap', zIndex: 100 }}>{signatureText}</div>
                  )}

                  {signatures.filter(s => s.page === currentPage).map(sig => (
                    <div key={sig.id} style={{ position: 'absolute', left: `${sig.x}%`, top: `${sig.y}%`, color: sig.color, pointerEvents: 'none', fontSize: `${24 * visualScale}px`, fontFamily: sig.font, transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap', zIndex: 50 }}>{sig.text}</div>
                  ))}
                </div>
              </div>

              {/* Page navigation belongs under the document it moves through. */}
              <div className="page-nav">
                <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>Prev</button>
                <span className="page-nav-label">
                  Page <span className="num">{currentPage}</span> of <span className="num">{numPages}</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>Next</button>
              </div>
            </>
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">Document</div>
              {file && <div className="file-name" title={file.name}>{file.name}</div>}
              <div className="zoom-control">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleZoom(-0.2)} aria-label="Zoom out"><ZoomOut size={14} /></button>
                <ValueInput label="Zoom" suffix="%" min={25} max={400} step={10} width={56}
                value={Math.round(visualScale * 100)}
                onCommit={v => setVisualScale(v / 100)} />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleZoom(0.2)} aria-label="Zoom in"><ZoomIn size={14} /></button>
              </div>
              <button className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
                <FileUp size={15} /> Add PDF
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    setSignatures([]);
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
              <div className="t-eyebrow">Signature</div>

              <div className="field">
                <label htmlFor="sign-name">Name</label>
                <input
                  id="sign-name"
                  type="text"
                  className="input signature-preview"
                  placeholder="Type a name"
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  style={{ fontFamily: selectedFont }}
                />
              </div>

              <div className="field" style={{ position: 'relative' }}>
                <label htmlFor="sign-font">Typeface</label>
                <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                  <div className="input-with-icon">
                    <Search size={13} />
                    <input
                      id="sign-font"
                      onClick={loadSystemFonts}
                      type="text"
                      className="input"
                      placeholder="Search fonts"
                      value={fontSearch}
                      onFocus={() => setShowFontDropdown(true)}
                      onChange={(e) => { setFontSearch(e.target.value); setShowFontDropdown(true); }}
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
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
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
                        <p className="hint" style={{ padding: 'var(--s-2) var(--s-3)' }}>No fonts found</p>
                      )}
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
                <label>Ink</label>
                <div className="swatch-row">
                  <span className="swatch-native">
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      aria-label="Custom ink colour"
                    />
                    <span style={{ background: selectedColor }} />
                  </span>
                  <div className="swatches">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        className={`swatch ${selectedColor === c ? 'selected' : ''}`}
                        style={{ background: c }}
                        aria-label={`Ink ${c}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="inspector-group">
              <div className="t-eyebrow">
                Placed
                {signatures.length > 0 && <span className="count num">{signatures.length}</span>}
              </div>
              {signatures.length === 0 ? (
                <p className="hint">Click the page to place a signature.</p>
              ) : (
                <ul className="queue">
                  {signatures.map(sig => (
                    <li key={sig.id} className="queue-item">
                      <span className="queue-name" style={{ fontFamily: sig.font, color: sig.color }}>{sig.text}</span>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => setSignatures(prev => prev.filter(s => s.id !== sig.id))}
                        aria-label={`Remove signature ${sig.text}`}
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
              {signatures.length > 0 && (
                <button className="btn btn-primary btn-block" onClick={applySignatures} disabled={isProcessing}>
                  <Save size={15} /> {isProcessing ? 'Applying…' : 'Apply signatures'}
                </button>
              )}
              {currentPdfBytes && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = currentPdfUrl!; a.download = 'signed.pdf'; a.click(); }}
                >
                  <Download size={15} /> Save signed PDF
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
