import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, FolderDown, Layers } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

function zeroPad(n: number, total: number) {
  return String(n).padStart(Math.max(String(total).length, 3), '0');
}

export default function ExtractToFolder() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: pdfBytes } = doc;
  const [totalPages, setTotalPages] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState('pages.zip');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [prefix, setPrefix] = useState('page');

  const resetOutput = () => { setZipUrl(null); setError(null); setSuccess(false); setProgress(0); setCurrentPage(0); };

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
    resetOutput();
    try {
      const pdfDoc = await PDFDocument.load(bytes.slice(0));
      setTotalPages(pdfDoc.getPageCount());
    } catch {
      setError(t('extractFolder.errRead'));
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
      setError('Could not extract the pages. The PDF may be encrypted or damaged.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('extractFolder.title')}</h1>
      </header>

      <div className="workbench">
        <div className="stage">
          {pdfBytes ? (
            <PdfPreviewer pdfBytes={pdfBytes} />
          ) : (
            <EmptyStage
              motif="extract"
              headline={t('extractFolder.emptyHeadline')}
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
                {totalPages > 0 && (
                  <div className="note">
                    <Layers size={14} />
                    <span>
                      <span className="num">{totalPages}</span> page{totalPages !== 1 ? 's' : ''} in,{' '}
                      <span className="num">{totalPages}</span> PDF{totalPages !== 1 ? 's' : ''} out
                    </span>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="etf-prefix">{t('extractFolder.prefix')}</label>
                  <input
                    id="etf-prefix"
                    type="text"
                    className="input"
                    value={prefix}
                    onChange={e => setPrefix(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') || 'page')}
                    placeholder={t('extractFolder.prefixPlaceholder')}
                  />
                  {totalPages > 0 && (
                    <p className="hint mono-hint">
                      {prefix}_{zeroPad(1, totalPages)}.pdf … {prefix}_{zeroPad(totalPages, totalPages)}.pdf
                    </p>
                  )}
                </div>

                <div className="inspector-group">
                  <div className="t-eyebrow">{t('extractFolder.savesAs')}</div>
                  <div className="note">
                    <FolderDown size={14} />
                    <span className="mono-hint truncate">{file.name.replace(/\.pdf$/i, '')}_pages.zip</span>
                  </div>
                </div>

                {isProcessing && (
                  <ProgressBar value={progress} label={t('extractFolder.splitting')} detail={`${currentPage} / ${totalPages}`} />
                )}
                {error && <StatusBanner type="error" message={error} />}
                {success && <StatusBanner type="success" message={`${totalPages} pages extracted.`} />}
              </>
            )}
          </div>

          {file && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={extractAll}
                disabled={isProcessing || totalPages === 0}
              >
                {isProcessing
                  ? <><span className="spinner" /> {t('extractFolder.extractingLabel')} <span className="num">{currentPage}/{totalPages}</span>…</>
                  : <><FolderDown size={15} /> {success ? t('extractFolder.again') : t('extractFolder.extractAll')}</>}
              </button>
              {zipUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = zipUrl!; a.download = zipName; a.click(); }}
                >
                  <Download size={15} /> {t('extractFolder.saveZip')}
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
