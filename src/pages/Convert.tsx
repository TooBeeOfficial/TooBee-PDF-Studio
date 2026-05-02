import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import FileUploader from '../components/FileUploader';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, FileImage, Layers, ZoomIn, ZoomOut, FileUp, Package } from 'lucide-react';
import { usePdf } from '../context/PdfContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ImageResult { url: string; page: number; }

export default function Convert() {
  const { file, setActivePdf } = usePdf();
  const [images, setImages] = useState<ImageResult[]>([]);
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [scale, setScale] = useState<2 | 3>(2);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [visualScale, setVisualScale] = useState(1);
  const [isZipping, setIsZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokeImages = (imgs: ImageResult[]) => imgs.forEach(img => URL.revokeObjectURL(img.url));

  const handleFilesSelected = (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    // Convert doesn't need pdfBytes in context, just the File for re-reading
    setActivePdf(f, new Uint8Array());
    revokeImages(images);
    setImages([]); setError(null); setSuccess(false); setProgress(0); setCurrentPage(0); setTotalPages(0);
  };

  const convertPdfToImages = async () => {
    if (!file) return;
    revokeImages(images);
    setImages([]); setError(null); setSuccess(false); setProgress(0); setCurrentPage(0); setIsProcessing(true);
    try {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const n = pdf.numPages;
      setTotalPages(n);
      const results: ImageResult[] = [];
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      for (let i = 1; i <= n; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')! as any, viewport }).promise;
        const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), mime, format === 'jpg' ? 0.92 : undefined));
        results.push({ url: URL.createObjectURL(blob), page: i });
        setCurrentPage(i); setProgress(Math.round((i / n) * 100));
        await new Promise(r => setTimeout(r, 0));
      }
      pdf.destroy();
      setImages(results); setSuccess(true);
    } catch {
      setError('Conversion failed. The PDF may be encrypted or corrupted.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSingle = (img: ImageResult) => {
    const a = document.createElement('a');
    a.href = img.url; a.download = `page_${String(img.page).padStart(3, '0')}.${format}`; a.click();
  };

  const downloadAllAsZip = async () => {
    if (!images.length || !file) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(file.name.replace(/\.pdf$/i, ''))!;
      for (const img of images) {
        const ab = await (await fetch(img.url)).arrayBuffer();
        folder.file(`page_${String(img.page).padStart(3, '0')}.${format}`, ab);
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${file.name.replace(/\.pdf$/i, '')}_images.zip`; a.click();
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div><h1>PDF to Image</h1><p>Convert every page of your PDF into high-resolution images.</p></div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {file && <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={18} /> Select New PDF</button>}
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.length) handleFilesSelected(Array.from(e.target.files)); }} style={{ display: 'none' }} accept=".pdf" />
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', borderRadius: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <button className="btn btn-secondary" onClick={() => setVisualScale(p => Math.max(0.4, p - 0.2))}><ZoomOut size={16} /></button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', minWidth: '50px', justifyContent: 'center', fontSize: '0.82rem' }}>{Math.round(visualScale * 100)}%</span>
              <button className="btn btn-secondary" onClick={() => setVisualScale(p => Math.min(3, p + 0.2))}><ZoomIn size={16} /></button>
            </div>
          )}
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <h3 style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Format</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['png', 'jpg'] as const).map(f => (
                    <button key={f} className={`btn ${format === f ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setFormat(f); revokeImages(images); setImages([]); setSuccess(false); }}
                      style={{ flex: 1, textTransform: 'uppercase', fontSize: '0.8rem', border: format === f ? '1px solid var(--accent)' : '1px solid transparent' }}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Quality</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {([2, 3] as const).map(s => (
                    <button key={s} className={`btn ${scale === s ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setScale(s); revokeImages(images); setImages([]); setSuccess(false); }}
                      style={{ flex: 1, fontSize: '0.8rem', border: scale === s ? '1px solid var(--accent)' : '1px solid transparent' }}>
                      {s === 2 ? 'Standard (2×)' : 'High (3×)'}
                    </button>
                  ))}
                </div>
              </div>
              {isProcessing && <ProgressBar value={progress} label="Converting…" detail={`${currentPage} / ${totalPages || '?'} pages`} />}
              {error && <StatusBanner type="error" message={error} />}
              {success && <StatusBanner type="success" message={`${images.length} image${images.length !== 1 ? 's' : ''} ready!`} />}
              <button className="btn btn-primary" onClick={convertPdfToImages} disabled={isProcessing} style={{ width: '100%' }}>
                {isProcessing
                  ? <><span className="spin" style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> {currentPage}/{totalPages || '…'} pages…</>
                  : <><FileImage size={16} /> Convert to Images</>}
              </button>
              {images.length > 0 && (
                <button className="btn btn-secondary" onClick={downloadAllAsZip} disabled={isZipping} style={{ width: '100%' }}>
                  {isZipping
                    ? <><span className="spin" style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'currentColor', borderRadius: '50%' }} /> Building ZIP…</>
                    : <><Package size={16} /> Download All as ZIP</>}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
          onWheel={e => { if (e.ctrlKey) { e.preventDefault(); setVisualScale(p => Math.min(3, Math.max(0.4, p + (e.deltaY > 0 ? -0.1 : 0.1)))); } }}>
          {images.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(240 * visualScale)}px, 1fr))`, gap: `${1.25 * visualScale}rem`, padding: '1.5rem' }}>
              {images.map(img => (
                <div key={img.page} className="card glass" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <img src={img.url} alt={`Page ${img.page}`} style={{ width: '100%', borderRadius: '0.35rem', border: '1px solid var(--border-color)', display: 'block' }} loading="lazy" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Page {img.page}</span>
                    <button className="btn btn-secondary" onClick={() => downloadSingle(img)} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Download size={13} /> Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', opacity: 0.25 }}>
              <Layers size={72} style={{ marginBottom: '1rem' }} /><p>Converted images will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
