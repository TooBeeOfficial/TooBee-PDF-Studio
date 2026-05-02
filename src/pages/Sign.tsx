import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import { Download, PenTool, Trash2, Save, FileUp, ZoomIn, ZoomOut, Search, Plus, Palette } from 'lucide-react';
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
  const [file, setFile] = useState<File | null>(null);
  const [currentPdfBytes, setCurrentPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [signatureText, setSignatureText] = useState("");
  const [selectedFont, setSelectedFont] = useState("Helvetica");
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [visualScale, setVisualScale] = useState(1.5);
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  // Custom Font state
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [fontSearch, setFontSearch] = useState('Helvetica');
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allFontFamilies = useMemo(() => {
    const customNames = customFonts.map(f => f.name);
    return [...SYSTEM_FONTS, ...customNames];
  }, [customFonts]);

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
      
      const buffer = bufferCanvasRef.current;
      if (!buffer) return;
      const ctx = buffer.getContext('2d');
      if (ctx) {
        buffer.width = viewport.width;
        buffer.height = viewport.height;
        buffer.style.width = `${viewport.width / dpi}px`;
        buffer.style.height = `${viewport.height / dpi}px`;
        await page.render({ canvasContext: ctx, viewport }).promise;
        
        const main = mainCanvasRef.current;
        if (main) {
          main.width = buffer.width;
          main.height = buffer.height;
          main.style.width = buffer.style.width;
          main.style.height = buffer.style.height;
          main.getContext('2d')?.drawImage(buffer, 0, 0);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [currentPdfBytes]);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const selectedFile = newFiles[0];
    setFile(selectedFile);
    const buffer = await selectedFile.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    setCurrentPdfBytes(uint8Array);
    const blob = new Blob([uint8Array], { type: 'application/pdf' });
    setCurrentPdfUrl(URL.createObjectURL(blob));
    const pdf = await pdfjsLib.getDocument({ data: uint8Array.slice(0) }).promise;
    setNumPages(pdf.numPages);
    performRender(1, visualScale);
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

  const applySignatures = async () => {
    if (!currentPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(currentPdfBytes.slice(0));
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
      setCurrentPdfBytes(newBytes);
      setCurrentPdfUrl(URL.createObjectURL(new Blob([newBytes.buffer], { type: 'application/pdf' })));
      setSignatures([]);
      performRender(currentPage, visualScale);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (currentPdfBytes) performRender(currentPage, visualScale);
  }, [currentPage, performRender, visualScale]);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Sign PDF</h1>
          <p>Digital signature with custom typefaces and colors.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="btn-group glass" style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', borderRadius: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => handleZoom(-0.2)}><ZoomOut size={18} /></button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', minWidth: '55px', justifyContent: 'center', fontSize: '0.85rem' }}>{Math.round(visualScale * 100)}%</span>
            <button className="btn btn-secondary" onClick={() => handleZoom(0.2)}><ZoomIn size={18} /></button>
          </div>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={18} /> Select New PDF
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
            accept=".pdf"
          />
          {signatures.length > 0 && <button className="btn btn-primary" onClick={applySignatures} disabled={isProcessing}><Save size={18} /> Finalize</button>}
          {currentPdfBytes && <button className="btn btn-secondary" onClick={() => { const a = document.createElement('a'); a.href = currentPdfUrl!; a.download = 'signed.pdf'; a.click(); }}><Download size={18} /> Download</button>}
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <div className="card glass" style={{ padding: '1rem' }}>
            <h3 style={{ fontSize: '0.65rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>SIGNATURE IDENTITY</h3>
            <input 
              type="text" 
              placeholder="Type name..." 
              value={signatureText} 
              onChange={(e) => setSignatureText(e.target.value)} 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '1rem', fontSize: '1.15rem', fontFamily: selectedFont, textAlign: 'center' }} 
            />
            
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search fonts..."
                    value={fontSearch}
                    onFocus={() => setShowFontDropdown(true)}
                    onChange={(e) => { setFontSearch(e.target.value); setShowFontDropdown(true); }}
                    style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', borderRadius: '0.4rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'white', fontSize: '0.85rem' }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                </div>
                <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={() => fontInputRef.current?.click()}>
                  <Plus size={18} />
                </button>
                <input type="file" ref={fontInputRef} hidden accept=".ttf,.otf" onChange={handleFontUpload} />
              </div>

              <AnimatePresence>
                {showFontDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  >
                    {filteredFonts.length > 0 ? filteredFonts.map(f => (
                      <div
                        key={f}
                        onClick={() => {
                          setSelectedFont(f);
                          setFontSearch(f);
                          setShowFontDropdown(false);
                        }}
                        style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: f, borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: selectedFont === f ? 'rgba(99,102,241,0.2)' : 'transparent' }}
                      >
                        {f.replace('RomanItalic', '').replace('Bold', '')}
                      </div>
                    )) : (
                      <div style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', opacity: 0.5 }}>No fonts found</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {showFontDropdown && <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowFontDropdown(false)} />}
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-primary)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Palette size={12} /> INK COLOR
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
                  <input 
                    type="color" 
                    value={selectedColor} 
                    onChange={(e) => setSelectedColor(e.target.value)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} 
                  />
                  <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: selectedColor }} />
                </div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.2rem' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setSelectedColor(c)}
                      style={{ width: '100%', aspectRatio: '1', borderRadius: '3px', background: c, border: selectedColor === c ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="card glass" style={{ flex: 1, overflowY: 'auto', minHeight: '150px' }}>
            <h3 style={{ fontSize: '0.75rem', marginBottom: '1rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>PLACED SIGNATURES</h3>
            {signatures.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.5, marginTop: '1rem' }}>No signatures placed yet.</p>}
            {signatures.map(sig => (
              <div key={sig.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.625rem', borderRadius: '0.35rem', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontFamily: sig.font, color: sig.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{sig.text}</span>
                <button onClick={() => setSignatures(prev => prev.filter(s => s.id !== sig.id))} style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }} onWheel={handleWheelZoom}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center', flexShrink: 0 }}>
                <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>Prev</button>
                <span style={{ fontSize: '0.85rem' }}>Page {currentPage} of {numPages}</span>
                <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>Next</button>
              </div>
              
              <div style={{ flex: 1, overflow: 'auto', position: 'relative', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', padding: '2rem' }} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
                <div style={{ position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', cursor: signatureText ? 'none' : 'default', height: 'fit-content' }}>
                  <canvas ref={mainCanvasRef} onMouseMove={handleMouseMove} onClick={handleCanvasClick} style={{ display: 'block' }} />
                  <canvas ref={bufferCanvasRef} style={{ display: 'none' }} />
                  
                  {isHovering && signatureText && (
                    <div style={{ position: 'absolute', left: `${mousePos.x}%`, top: `${mousePos.y}%`, color: selectedColor, pointerEvents: 'none', fontSize: `${24 * visualScale}px`, fontFamily: selectedFont, transform: 'translate(-50%, -50%)', opacity: 0.5, whiteSpace: 'nowrap', zIndex: 100 }}>{signatureText}</div>
                  )}
                  
                  {signatures.filter(s => s.page === currentPage).map(sig => (
                    <div key={sig.id} style={{ position: 'absolute', left: `${sig.x}%`, top: `${sig.y}%`, color: sig.color, pointerEvents: 'none', fontSize: `${24 * visualScale}px`, fontFamily: sig.font, transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap', zIndex: 50 }}>{sig.text}</div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
