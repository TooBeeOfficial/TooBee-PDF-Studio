import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import { Download, Minimize2, Eye, Zap, RefreshCw, FileUp } from 'lucide-react';
import { usePdf } from '../context/PdfContext';

export default function Compress() {
  const { file, pdfBytes: originalBytes, setActivePdf } = usePdf();
  const [compressedBytes, setCompressedBytes] = useState<Uint8Array | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'simple' | 'aggressive'>('aggressive');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    setActivePdf(f, bytes);
    setCompressedUrl(null);
    setCompressedBytes(null);
    setCompressedSize(0);
  };

  const compressPdf = async () => {
    if (!originalBytes) return;
    setIsProcessing(true);
    try {
      const originalDoc = await PDFDocument.load(originalBytes.slice(0));
      let finalBytes: Uint8Array;
      if (mode === 'aggressive') {
        const compressedDoc = await PDFDocument.create();
        const copiedPages = await compressedDoc.copyPages(originalDoc, originalDoc.getPageIndices());
        copiedPages.forEach(page => compressedDoc.addPage(page));
        finalBytes = await compressedDoc.save({ useObjectStreams: true });
      } else {
        finalBytes = await originalDoc.save({ useObjectStreams: true });
      }
      setCompressedBytes(finalBytes);
      setCompressedSize(finalBytes.length);
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      setCompressedUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error('Compression failed', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Compress PDF</h1>
          <p>Optimize your file for web delivery and email sharing without losing quality.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {file && (
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={18} /> Select New PDF
            </button>
          )}
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.length) { setCompressedBytes(null); setCompressedUrl(null); setCompressedSize(0); handleFilesSelected(Array.from(e.target.files)); } }} style={{ display: 'none' }} accept=".pdf" />
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <>
              <div className="card glass">
                <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Optimization Mode</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(['simple', 'aggressive'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', padding: '1rem', height: 'auto', gap: '0.25rem', border: mode === m ? '1px solid var(--accent)' : '1px solid transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                          {m === 'simple' ? <Zap size={14} /> : <RefreshCw size={14} />} {m === 'simple' ? 'Simple' : 'Aggressive'}
                        </div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: 'normal', lineHeight: '1.2' }}>
                          {m === 'simple' ? 'Lossless structural cleanup. Fast and safest for any document.' : 'Reconstructs file binary to strip all bloat. Maximum reduction.'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={compressPdf} disabled={isProcessing} style={{ width: '100%', height: '44px' }}>
                  {isProcessing ? 'Optimizing...' : 'Start Optimization'}
                </button>
              </div>
              <div className="card glass">
                <h3 style={{ fontSize: '0.65rem', marginBottom: '1rem', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>FILE DETAILS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Original:</span>
                    <span>{formatSize(file.size)}</span>
                  </div>
                  {compressedSize > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)', fontSize: '0.85rem' }}>
                        <span>Optimized:</span><span>{formatSize(compressedSize)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.85rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                        <span>Saved:</span><span>{Math.round((1 - compressedSize / file.size) * 100)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {(compressedBytes || originalBytes) ? (
            <PdfPreviewer pdfBytes={compressedBytes || originalBytes} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: '1rem' }}>
              <Eye size={48} opacity={0.2} /><p>Select a PDF to see the preview</p>
            </div>
          )}
          {compressedUrl && (
            <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <button className="btn btn-primary" onClick={() => { const a = document.createElement('a'); a.href = compressedUrl!; a.download = `compressed_${file?.name || 'document.pdf'}`; a.click(); }} style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <Download size={18} /> Download Optimized PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
