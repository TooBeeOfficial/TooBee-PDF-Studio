import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, FolderDown, FileUp, Eye, FileText, Layers } from 'lucide-react';
import { usePdf } from '../context/PdfContext';

function zeroPad(n: number, total: number) {
  return String(n).padStart(Math.max(String(total).length, 3), '0');
}

export default function ExtractToFolder() {
  const { file, pdfBytes, setActivePdf } = usePdf();
  const [totalPages, setTotalPages] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState('pages.zip');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [prefix, setPrefix] = useState('page');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetOutput = () => { setZipUrl(null); setError(null); setSuccess(false); setProgress(0); setCurrentPage(0); };

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    setActivePdf(f, bytes);
    resetOutput();
    try {
      const doc = await PDFDocument.load(bytes.slice(0));
      setTotalPages(doc.getPageCount());
    } catch {
      setError('Could not read this PDF. It may be encrypted or corrupted.');
    }
  };

  const extractAll = async () => {
    if (!pdfBytes || !file) return;
    setIsProcessing(true); resetOutput();
    try {
      const sourceDoc = await PDFDocument.load(pdfBytes.slice(0));
      const n = sourceDoc.getPageCount();
      setTotalPages(n);
      const zip = new JSZip();
      const folder = zip.folder(file.name.replace(/\.pdf$/i, ''))!;
      for (let i = 0; i < n; i++) {
        const pageDoc = await PDFDocument.create();
        const [copied] = await pageDoc.copyPages(sourceDoc, [i]);
        pageDoc.addPage(copied);
        folder.file(`${prefix}_${zeroPad(i + 1, n)}.pdf`, await pageDoc.save());
        setCurrentPage(i + 1);
        setProgress(Math.round(((i + 1) / n) * 100));
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      setZipUrl(URL.createObjectURL(blob));
      setZipName(`${file.name.replace(/\.pdf$/i, '')}_pages.zip`);
      setSuccess(true);
    } catch (e: any) {
      setError('Failed to extract pages. The PDF may be encrypted or corrupted.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Extract to Folder</h1>
          <p>Split every page into its own PDF and download them as a ZIP archive.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {file && <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={18} /> Select New PDF</button>}
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.length) handleFilesSelected(Array.from(e.target.files)); }} style={{ display: 'none' }} accept=".pdf" />
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <h3 style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>
              {totalPages > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(208,167,0,0.08)', border: '1px solid rgba(208,167,0,0.2)' }}>
                  <Layers size={14} color="var(--accent)" />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{totalPages} page{totalPages !== 1 ? 's' : ''} — will create {totalPages} individual PDF{totalPages !== 1 ? 's' : ''}</span>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>File name prefix</label>
                <input type="text" value={prefix} onChange={e => setPrefix(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') || 'page')} placeholder="page"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                {totalPages > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'block', opacity: 0.7 }}>{prefix}_{zeroPad(1, totalPages)}.pdf … {prefix}_{zeroPad(totalPages, totalPages)}.pdf</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <FolderDown size={14} />
                <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name.replace(/\.pdf$/i, '')}_pages.zip</span>
              </div>
              {isProcessing && <ProgressBar value={progress} label="Splitting pages…" detail={`${currentPage} / ${totalPages}`} />}
              {error && <StatusBanner type="error" message={error} />}
              {success && <StatusBanner type="success" message={`All ${totalPages} pages extracted — ZIP ready!`} />}
              <button className="btn btn-primary" onClick={extractAll} disabled={isProcessing || totalPages === 0} style={{ width: '100%' }}>
                {isProcessing
                  ? <><span className="spin" style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> Extracting {currentPage}/{totalPages}…</>
                  : <><FolderDown size={16} /> {success ? 'Re-extract All Pages' : 'Extract All Pages to ZIP'}</>}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {pdfBytes ? <PdfPreviewer pdfBytes={pdfBytes} /> : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '1rem' }}>
              <Eye size={48} opacity={0.2} /><p>Select a PDF to preview</p>
            </div>
          )}
          {pdfBytes && totalPages > 0 && !zipUrl && !isProcessing && (
            <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10, background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(8px)', padding: '0.4rem 0.85rem', borderRadius: '0.65rem', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
              <FileText size={13} />{totalPages} page{totalPages !== 1 ? 's' : ''}
            </div>
          )}
          {zipUrl && (
            <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <button className="btn btn-primary" onClick={() => { const a = document.createElement('a'); a.href = zipUrl!; a.download = zipName; a.click(); }} style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <Download size={18} /> Download ZIP ({totalPages} files)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
