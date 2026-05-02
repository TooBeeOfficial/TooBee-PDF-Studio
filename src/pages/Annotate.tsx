import { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import { Download, Type, Highlighter, Trash2, Save, FileUp } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface Annotation {
  id: string;
  type: 'text' | 'highlight';
  x: number; // percentage
  y: number; // percentage
  text?: string;
  color: string;
  page: number;
}

export default function Annotate() {
  const [file, setFile] = useState<File | null>(null);
  const [currentPdfBytes, setCurrentPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tool, setTool] = useState<'text' | 'highlight'>('text');
  const [color, setColor] = useState('#ffff00');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colors = ['#ffff00', '#00ff00', '#ff0000', '#0000ff', '#ffffff', '#000000'];

  const performRender = useCallback(async (pageNum: number) => {
    if (!currentPdfBytes) return;
    try {
      const pdf = await pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise;
      const page = await pdf.getPage(pageNum);
      const dpi = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: 1.5 * dpi });
      
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
    setCurrentPdfUrl(URL.createObjectURL(new Blob([uint8Array], { type: 'application/pdf' })));
    const pdf = await pdfjsLib.getDocument({ data: uint8Array.slice(0) }).promise;
    setNumPages(pdf.numPages);
    performRender(1);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 100;
    const ny = ((e.clientY - rect.top) / rect.height) * 100;

    let text = "";
    if (tool === 'text') {
      text = prompt("Enter your comment:") || "";
      if (!text) return;
    }

    const newAnn: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      type: tool, x: nx, y: ny, text, color, page: currentPage
    };
    setAnnotations(prev => [...prev, newAnn]);
  };

  const applyAnnotations = async () => {
    if (!currentPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(currentPdfBytes.slice(0));
      const pages = pdfDoc.getPages();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      for (const ann of annotations) {
        const page = pages[ann.page - 1];
        const { width, height } = page.getSize();
        const px = (ann.x / 100) * width;
        const py = height - ((ann.y / 100) * height);
        const r = parseInt(ann.color.slice(1, 3), 16) / 255;
        const g = parseInt(ann.color.slice(3, 5), 16) / 255;
        const b = parseInt(ann.color.slice(5, 7), 16) / 255;

        if (ann.type === 'text') {
          page.drawText(ann.text!, { x: px, y: py - 12, size: 12, font, color: rgb(r, g, b) });
        } else {
          page.drawRectangle({ x: px - 10, y: py - 10, width: 60, height: 20, color: rgb(r, g, b), opacity: 0.4 });
        }
      }
      const newBytes = await pdfDoc.save();
      setCurrentPdfBytes(newBytes);
      setCurrentPdfUrl(URL.createObjectURL(new Blob([newBytes.buffer], { type: 'application/pdf' })));
      setAnnotations([]);
      performRender(currentPage);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (currentPdfBytes) performRender(currentPage);
  }, [currentPage, performRender]);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Annotate PDF</h1>
          <p>Highlight sections or add comments.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {file && (
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={18} /> Select New PDF
            </button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => {
              if (e.target.files?.length) {
                setAnnotations([]);
                setCurrentPage(1);
                handleFilesSelected(Array.from(e.target.files));
              }
            }} 
            style={{ display: 'none' }} 
            accept=".pdf"
          />
          {annotations.length > 0 && <button className="btn btn-primary" onClick={applyAnnotations} disabled={isProcessing}><Save size={18} /> Apply</button>}
          {currentPdfBytes && <button className="btn btn-secondary" onClick={() => { const a = document.createElement('a'); a.href = currentPdfUrl!; a.download = 'annotated.pdf'; a.click(); }}><Download size={18} /> Download</button>}
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '2rem', overflow: 'hidden' }}>
        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card glass">
            <h3 style={{ fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>TOOLS</h3>
            <button className={`btn ${tool === 'text' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTool('text')} style={{ width: '100%', marginBottom: '0.5rem' }}><Type size={16} /> Text</button>
            <button className={`btn ${tool === 'highlight' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTool('highlight')} style={{ width: '100%' }}><Highlighter size={16} /> Highlight</button>
          </div>
          <div className="card glass">
            <h3 style={{ fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>COLOR</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: c, border: color === c ? '2px solid white' : '1px solid var(--border-color)', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Prev</button>
                <span>{currentPage} / {numPages}</span>
                <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}>Next</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', position: 'relative', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', padding: '2rem' }}>
                <div style={{ position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', cursor: 'crosshair', height: 'fit-content' }}>
                  <canvas ref={mainCanvasRef} onClick={handleCanvasClick} style={{ display: 'block' }} />
                  <canvas ref={bufferCanvasRef} style={{ display: 'none' }} />
                  {annotations.filter(a => a.page === currentPage).map(a => (
                    <div key={a.id} style={{ position: 'absolute', left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%, -50%)', color: a.color, background: a.type === 'highlight' ? `${a.color}66` : 'transparent', padding: '2px 5px', fontSize: '12px', pointerEvents: 'none', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {a.text}
                    </div>
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