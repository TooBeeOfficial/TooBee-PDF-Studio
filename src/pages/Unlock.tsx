import { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import PasswordInput from '../components/PasswordInput';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, Unlock as UnlockIcon, ShieldAlert, ShieldCheck, FileUp, CheckCircle2 } from 'lucide-react';
import { usePdf } from '../context/PdfContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

async function renderPageToJpeg(page: pdfjsLib.PDFPageProxy, scale = 2.0) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d')! as any, viewport }).promise;
  return new Promise<{ jpegBytes: Uint8Array; width: number; height: number }>((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('toBlob failed'));
      resolve({ jpegBytes: new Uint8Array(await blob.arrayBuffer()), width: viewport.width / scale, height: viewport.height / scale });
    }, 'image/jpeg', 0.92);
  });
}

export default function Unlock() {
  const { file, pdfBytes, setActivePdf } = usePdf();
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [unlockedBytes, setUnlockedBytes] = useState<Uint8Array | null>(null);
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [unlockedName, setUnlockedName] = useState('unlocked.pdf');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetOutput = () => { setUnlockedBytes(null); setUnlockedUrl(null); setError(null); setSuccess(false); setProgress(0); setTotalPages(0); setCurrentPage(0); };

  // Probe encryption status whenever pdfBytes change
  useEffect(() => {
    if (!pdfBytes || !pdfBytes.length) { setIsEncrypted(null); return; }
    setIsEncrypted(null);
    pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise
      .then(() => setIsEncrypted(false))
      .catch((e: any) => setIsEncrypted(e?.name === 'PasswordException' ? true : false));
  }, [pdfBytes]);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    setActivePdf(f, bytes);
    resetOutput(); setPassword('');
  };

  const unlockPdf = async () => {
    if (!pdfBytes || !password) return;
    setIsProcessing(true); resetOutput();
    try {
      let pdfDoc: pdfjsLib.PDFDocumentProxy;
      try {
        pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0), password }).promise;
      } catch (e: any) {
        if (e?.name === 'PasswordException') { setError('Incorrect password. Please try again.'); return; }
        throw e;
      }
      const n = pdfDoc.numPages;
      setTotalPages(n);
      const newDoc = await PDFDocument.create();
      for (let i = 1; i <= n; i++) {
        const page = await pdfDoc.getPage(i);
        const { jpegBytes, width, height } = await renderPageToJpeg(page, 2.0);
        const jpgImage = await newDoc.embedJpg(jpegBytes);
        const pdfPage = newDoc.addPage([width, height]);
        pdfPage.drawImage(jpgImage, { x: 0, y: 0, width, height });
        setCurrentPage(i); setProgress(Math.round((i / n) * 100));
      }
      pdfDoc.destroy();
      const resultBytes = await newDoc.save();
      setUnlockedBytes(resultBytes);
      setUnlockedUrl(URL.createObjectURL(new Blob([resultBytes], { type: 'application/pdf' })));
      setUnlockedName(`unlocked_${file!.name}`);
      setSuccess(true);
    } catch {
      setError('Failed to unlock PDF. The file may be unsupported or corrupted.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div><h1>Unlock PDF</h1><p>Remove password protection and export an unrestricted copy.</p></div>
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

              {isEncrypted !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: isEncrypted ? 'rgba(208,167,0,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${isEncrypted ? 'rgba(208,167,0,0.25)' : 'rgba(34,197,94,0.25)'}` }}>
                  {isEncrypted
                    ? <><ShieldAlert size={14} color="#d0a700" /><span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Password protected</span></>
                    : <><ShieldCheck size={14} color="#22c55e" /><span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No encryption detected</span></>}
                </div>
              )}

              {isEncrypted && (
                <PasswordInput label="Current Password" value={password} placeholder="Enter the PDF password…"
                  onChange={v => { setPassword(v); setError(null); setSuccess(false); setUnlockedUrl(null); }}
                  onKeyDown={e => e.key === 'Enter' && password && !isProcessing && unlockPdf()} />
              )}

              {isProcessing && <ProgressBar value={progress} label="Decrypting pages…" detail={`${currentPage} / ${totalPages}`} />}
              {error && <StatusBanner type="error" message={error} />}
              {success && <StatusBanner type="success" message="PDF unlocked successfully!" />}

              {isEncrypted && (
                <button className="btn btn-primary" onClick={unlockPdf} disabled={isProcessing || !password} style={{ width: '100%' }}>
                  {isProcessing
                    ? <><span className="spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> Unlocking…</>
                    : <><UnlockIcon size={16} /> Remove Protection</>}
                </button>
              )}
              {isEncrypted === false && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>This PDF has no password protection.</p>}
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {unlockedBytes ? <PdfPreviewer pdfBytes={unlockedBytes} />
            : pdfBytes && pdfBytes.length && !isEncrypted ? <PdfPreviewer pdfBytes={pdfBytes} />
            : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '1rem' }}>
                <ShieldAlert size={48} opacity={0.2} />
                <p style={{ opacity: 0.5 }}>{file ? 'Preview restricted until unlocked' : 'Select a protected PDF to begin'}</p>
              </div>
            )}
          {unlockedUrl && (
            <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <button className="btn btn-primary" onClick={() => { const a = document.createElement('a'); a.href = unlockedUrl!; a.download = unlockedName; a.click(); }} style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <Download size={18} /> Download Unlocked PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
