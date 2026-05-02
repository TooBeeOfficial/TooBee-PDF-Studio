import { useState, useEffect, useRef } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import { Download, RotateCw, Eye, ArrowLeft, ArrowRight, RefreshCw, Trash2, FileUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePdf } from '../context/PdfContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function Rotate() {
  const { file: ctxFile, pdfBytes: ctxBytes, setActivePdf } = usePdf();
  const [file, setFile] = useState<File | null>(null);
  const [currentPdfBytes, setCurrentPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const generateAllThumbnails = async (bytes: Uint8Array) => {
    setIsGeneratingThumbs(true);
    try {
      const dataCopy = bytes.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      
      const newThumbs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 }); 
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          newThumbs.push(canvas.toDataURL('image/jpeg', 0.6));
        }
      }
      setThumbnails(newThumbs);
    } catch (e) {
      console.error("Failed to generate thumbnails", e);
    } finally {
      setIsGeneratingThumbs(false);
    }
  };

  const generateSingleThumbnail = async (bytes: Uint8Array, pageIndex: number) => {
    try {
      const dataCopy = bytes.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 0.4 }); 
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        const newThumbUrl = canvas.toDataURL('image/jpeg', 0.6);
        setThumbnails(prev => {
          const updated = [...prev];
          updated[pageIndex] = newThumbUrl;
          return updated;
        });
      }
    } catch (e) {
      console.error("Failed to regenerate single thumbnail", e);
    }
  };

  const handleFilesSelected = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const selectedFile = newFiles[0];
    setFile(selectedFile);
    setHasChanges(false);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      setActivePdf(selectedFile, uint8Array);
      setCurrentPdfBytes(uint8Array);
      const pdfDoc = await PDFDocument.load(uint8Array);
      const totalPages = pdfDoc.getPageCount();
      setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));
      const blob = new Blob([uint8Array], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));
      await generateAllThumbnails(uint8Array);
    } catch (e) {
      console.error('Failed to load PDF', e);
    }
  };

  // Seed from context when component mounts (if a file was loaded on another page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ctxFile && ctxBytes && ctxBytes.length && !file) {
      setFile(ctxFile);
      setHasChanges(false);
      setCurrentPdfBytes(ctxBytes);
      PDFDocument.load(ctxBytes.slice(0)).then(pdfDoc => {
        const n = pdfDoc.getPageCount();
        setPageOrder(Array.from({ length: n }, (_, i) => i + 1));
        setCurrentPdfUrl(URL.createObjectURL(new Blob([ctxBytes!], { type: 'application/pdf' })));
        generateAllThumbnails(ctxBytes!);
      });
    }
  }, []); // only on mount

  const applyLiveReorder = async (newOrder: number[]) => {
    if (!currentPdfBytes || newOrder.length === 0) return;
    setIsProcessing(true);
    try {
      const originalPdf = await PDFDocument.load(currentPdfBytes);
      const newPdf = await PDFDocument.create();
      const indices = newOrder.map(pageNum => pageNum - 1);
      const copiedPages = await newPdf.copyPages(originalPdf, indices);
      copiedPages.forEach(page => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      setCurrentPdfBytes(newPdfBytes);
      setHasChanges(true);
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));
      setThumbnails(prev => newOrder.map(pageNum => prev[pageNum - 1]));
      setPageOrder(Array.from({ length: newOrder.length }, (_, i) => i + 1));
    } catch (error) {
      console.error("Error applying live reorder:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const movePage = (currentIndex: number, direction: 'left' | 'right') => {
    const newOrder = [...pageOrder];
    if (direction === 'left' && currentIndex > 0) {
      [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
    } else if (direction === 'right' && currentIndex < newOrder.length - 1) {
      [newOrder[currentIndex + 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex + 1]];
    }
    setPageOrder(newOrder);
    applyLiveReorder(newOrder);
  };

  const rotateSinglePage = async (gridIndex: number) => {
    if (!currentPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(currentPdfBytes);
      const pages = pdfDoc.getPages();
      const targetIndex = pageOrder[gridIndex] - 1;
      const page = pages[targetIndex];
      page.setRotation(degrees(page.getRotation().angle + 90));

      const newPdfBytes = await pdfDoc.save();
      setCurrentPdfBytes(newPdfBytes);
      setHasChanges(true);
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));
      await generateSingleThumbnail(newPdfBytes, targetIndex);
    } catch (error) {
      console.error("Error rotating single page:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const deletePage = async (gridIndex: number) => {
    if (!currentPdfBytes || pageOrder.length <= 1) return;
    setIsProcessing(true);
    try {
      const newOrder = [...pageOrder];
      newOrder.splice(gridIndex, 1);
      
      const originalPdf = await PDFDocument.load(currentPdfBytes);
      const newPdf = await PDFDocument.create();
      const indices = newOrder.map(pageNum => pageNum - 1);
      const copiedPages = await newPdf.copyPages(originalPdf, indices);
      copiedPages.forEach(page => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      setCurrentPdfBytes(newPdfBytes);
      setHasChanges(true);
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));
      
      const newThumbnails = [...thumbnails];
      newThumbnails.splice(pageOrder[gridIndex] - 1, 1);
      setThumbnails(newThumbnails);
      
      setPageOrder(Array.from({ length: newOrder.length }, (_, i) => i + 1));
    } catch (e) {
      console.error("Error deleting page", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Rotate & Reorder</h1>
          <p>Visually organize your document. Drag pages to move them or click to rotate.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
                handleFilesSelected(Array.from(e.target.files));
              }
            }} 
            style={{ display: 'none' }} 
            accept=".pdf"
          />
          {file && (
            <button className="btn btn-secondary" onClick={async () => {
              if (!currentPdfBytes) return;
              setIsProcessing(true);
              const pdfDoc = await PDFDocument.load(currentPdfBytes);
              pdfDoc.getPages().forEach(page => page.setRotation(degrees(page.getRotation().angle + 90)));
              const bytes = await pdfDoc.save();
              setCurrentPdfBytes(bytes);
              setHasChanges(true);
              const blob = new Blob([bytes.buffer], { type: 'application/pdf' });
              setCurrentPdfUrl(URL.createObjectURL(blob));
              await generateAllThumbnails(bytes);
              setIsProcessing(false);
            }}>
              <RefreshCw size={18} className={isProcessing ? 'spin' : ''} /> Rotate All 90°
            </button>
          )}
          {hasChanges && (
            <button className="btn btn-primary" onClick={() => {
              const a = document.createElement('a');
              a.href = currentPdfUrl!;
              a.download = `modified_${file?.name || 'document.pdf'}`;
              a.click();
            }}>
              <Download size={18} /> Download
            </button>
          )}
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          
          {file && (
            <div className="card glass">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{file.name}</h3>
                {isGeneratingThumbs && <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Loading...</span>}
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
                gap: '1rem', 
              }}>
                <AnimatePresence>
                  {pageOrder.map((pageNum, index) => (
                    <motion.div 
                      key={`pos-${pageNum}`}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      draggable
                      onDragStart={(e) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedIndex === null || draggedIndex === index) return;
                        const newOrder = [...pageOrder];
                        const draggedItem = newOrder[draggedIndex];
                        newOrder.splice(draggedIndex, 1);
                        newOrder.splice(index, 0, draggedItem);
                        setPageOrder(newOrder);
                        setDraggedIndex(index);
                      }}
                      onDrop={(e) => { e.preventDefault(); setDraggedIndex(null); applyLiveReorder(pageOrder); }}
                      className="card"
                      style={{ 
                        padding: '0.5rem', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.5rem',
                        cursor: 'grab',
                        opacity: draggedIndex === index ? 0.5 : 1,
                        background: 'var(--bg-primary)'
                      }}
                    >
                      <div style={{ height: '160px', backgroundColor: '#e2e8f0', position: 'relative', borderRadius: '0.4rem', overflow: 'hidden' }}>
                        <span style={{ position: 'absolute', top: '0.4rem', left: '0.4rem', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', zIndex: 10 }}>P{pageNum}</span>
                        {thumbnails[pageNum - 1] ? (
                          <img src={thumbnails[pageNum - 1]} alt={`P${pageNum}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>...</div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn btn-secondary" onClick={() => movePage(index, 'left')} disabled={index === 0} style={{ padding: '0.25rem' }}><ArrowLeft size={13} /></button>
                        <button className="btn btn-secondary" onClick={() => rotateSinglePage(index)} style={{ padding: '0.25rem', color: 'var(--accent)' }}><RotateCw size={13} /></button>
                        <button className="btn btn-secondary" onClick={() => deletePage(index)} style={{ padding: '0.25rem', color: '#f43f5e' }}><Trash2 size={13} /></button>
                        <button className="btn btn-secondary" onClick={() => movePage(index, 'right')} disabled={index === pageOrder.length - 1} style={{ padding: '0.25rem' }}><ArrowRight size={13} /></button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {currentPdfBytes ? (
            <PdfPreviewer pdfBytes={currentPdfBytes} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: '1rem' }}>
              <Eye size={48} opacity={0.2} />
              <p>Select a PDF to see the preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
