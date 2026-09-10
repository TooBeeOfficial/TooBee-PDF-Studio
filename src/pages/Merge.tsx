import { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import StatusBanner from '../components/StatusBanner';
import { Download, Trash2, FileUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { useToolStore } from '../store/useToolStore';
import { normalizeToPdf } from '../utils/fileConverter';

export default function Merge() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { mergeFiles: files, setMergeFiles: setFiles, setDocument } = useToolStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [mergedBytes, setMergedBytes] = useState<Uint8Array | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
    };
  }, [mergedPdfUrl]);

  // Keep the preview in sync with the queue automatically, instead of requiring
  // an explicit "merge" click just to see what the combined document looks like.
  useEffect(() => {
    if (files.length === 0) {
      setMergedBytes(null);
      setMergedPdfUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsProcessing(true);
      try {
        const mergedPdf = await PDFDocument.create();
        for (const file of files) {
          try {
            const buffer = await normalizeToPdf(file);
            const pdf = await PDFDocument.load(buffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
          } catch (err) {
            console.warn(`Could not process file ${file.name}`, err);
          }
        }
        if (cancelled) return;
        const bytes = await mergedPdf.save();
        setMergedBytes(bytes);
        setMergedPdfUrl(URL.createObjectURL(new Blob([bytes.buffer], { type: 'application/pdf' })));
        setMergeError(null);
        // The merged result becomes the new working document, so other tools
        // (rotate, protect, ...) continue from it without a manual re-upload.
        setDocument(new File([bytes], 'merged.pdf', { type: 'application/pdf' }), bytes);
      } catch (e) {
        if (cancelled) return;
        console.error('Merge failed', e);
        setMergeError(t('merge.fail'));
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [files, t, setDocument]);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles([...files, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('merge.title')}</h1>
        {files.length > 0 && (
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={15} /> {t('common.addMore')}
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
          multiple
        />
      </header>

      <div className="workbench">
        <div className="stage">
          {mergedBytes ? (
            <PdfPreviewer pdfBytes={mergedBytes} />
          ) : (
            <EmptyStage
              motif="merge"
              headline={t('merge.preview')}
              onFilesSelected={handleFilesSelected} multiple
            />
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">
                {t('merge.queue')}
                {files.length > 0 && <span className="count num">{files.length}</span>}
              </div>

              {files.length === 0 ? (
                <p className="hint">{t('merge.empty')}</p>
              ) : (
                <ol className="queue">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="queue-item">
                      <span className="queue-index num">{i + 1}</span>
                      <span className="queue-name" title={f.name}>{f.name}</span>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => removeFile(i)}
                        aria-label={`Remove ${f.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              {isProcessing && (
                <p className="hint" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                  <span className="spinner" />
                  {t('common.processing')}
                </p>
              )}
              {mergeError && <StatusBanner type="error" message={mergeError} />}
            </div>

            <div className="inspector-group">
              <FileUploader onFilesSelected={handleFilesSelected} multiple={true} />
            </div>
          </div>

          {mergedPdfUrl && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = mergedPdfUrl!;
                  a.download = "merged_studio.pdf";
                  a.click();
                }}
              >
                <Download size={15} /> {t('merge.downloadMerged')}
              </button>
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
