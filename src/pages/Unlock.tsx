import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import PasswordInput from '../components/PasswordInput';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, Unlock as UnlockIcon, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

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
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: pdfBytes } = doc;
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

    // Adding a file while one is open puts its pages on the end of the stack
    // instead of discarding the document being worked on.
    if (pdfBytes && pdfBytes.length && file) {
      try {
        const merged = await appendPdf(pdfBytes, newFiles);
        noteNextChange(t('common.addedPages'));
        setDocument(new File([merged], file.name, { type: 'application/pdf' }), merged);
        return;
      } catch (err) {
        console.error('Could not append to the open document', err);
      }
    }

    let f: File;
    try {
      f = await toPdfFile(newFiles[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.errUnsupported'));
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    setDocument(f, bytes);
    resetOutput(); setPassword('');
  };

  const unlockPdf = async () => {
    if (!pdfBytes || !password || !file) return;
    setIsProcessing(true); resetOutput();
    try {
      let pdfDoc: pdfjsLib.PDFDocumentProxy;
      try {
        pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0), password }).promise;
      } catch (e: any) {
        if (e?.name === 'PasswordException') { setError(t('unlock.errPassword')); return; }
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
      setUnlockedName(`unlocked_${file.name}`);
      setSuccess(true);
      // The unlocked copy becomes the new working document, so other tools
      // can continue on it directly instead of the still-encrypted original.
      setDocument(new File([resultBytes], file.name, { type: 'application/pdf' }), resultBytes);
    } catch {
      setError('Could not unlock this PDF. It may be damaged or in an unsupported format.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('unlock.title')}</h1>
      </header>

      <div className="workbench">
        <div className="stage">
          {unlockedBytes ? <PdfPreviewer pdfBytes={unlockedBytes} />
            : pdfBytes && pdfBytes.length && !isEncrypted ? <PdfPreviewer pdfBytes={pdfBytes} />
            : (
              <EmptyStage
                motif="unlock"
                headline={t('unlock.emptyHeadline')}
                onFilesSelected={handleFilesSelected}
              />
            )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">{t('common.document')}</div>
              {file && <div className="file-name" title={file.name}>{file.name}</div>}
              <FileUploader onFilesSelected={handleFilesSelected} multiple />
            </div>

            {file && (
              <>
                {isEncrypted !== null && (
                  <div className={`note ${isEncrypted ? '' : 'note-ok'}`}>
                    {isEncrypted
                      ? <><ShieldAlert size={14} /><span>{t('unlock.protected')}</span></>
                      : <><ShieldCheck size={14} /><span>{t('unlock.notProtected')}</span></>}
                  </div>
                )}

                {isEncrypted && (
                  <div className="inspector-group">
                    <div className="t-eyebrow">{t('unlock.password')}</div>
                    <PasswordInput
                      label={t('unlock.currentPassword')}
                      value={password}
                      placeholder={t('unlock.passwordPlaceholder')}
                      onChange={v => { setPassword(v); setError(null); setSuccess(false); setUnlockedUrl(null); }}
                      onKeyDown={e => e.key === 'Enter' && password && !isProcessing && unlockPdf()}
                    />
                  </div>
                )}

                {isProcessing && (
                  <ProgressBar value={progress} label={t('unlock.unlocking')} detail={`${currentPage} / ${totalPages}`} />
                )}
                {error && <StatusBanner type="error" message={error} />}
                {success && <StatusBanner type="success" message="Unlocked. Save the file below." />}

                {isEncrypted === false && (
                  <p className="hint">{t('unlock.nothingToRemove')}</p>
                )}
              </>
            )}
          </div>

          {file && isEncrypted && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={unlockPdf}
                disabled={isProcessing || !password}
              >
                {isProcessing
                  ? <><span className="spinner" /> {t('unlock.unlocking2')}</>
                  : <><UnlockIcon size={15} /> {t('unlock.title')}</>}
              </button>
              {unlockedUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = unlockedUrl!; a.download = unlockedName; a.click(); }}
                >
                  <Download size={15} /> {t('unlock.download')}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      {isDragging && (
        <div className="drop-veil">
          <span>{t('common.dropToOpen')}</span>
        </div>
      )}
    </div>
  );
}
