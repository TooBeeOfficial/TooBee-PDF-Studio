import { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import StatusBanner from '../components/StatusBanner';
import { Download, Layers, Trash2, Eye, FileUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToolStore } from '../store/useToolStore';
import { normalizeToPdf } from '../utils/fileConverter';

export default function Merge() {
  const { t } = useTranslation();
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
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>{t('merge.title')}</h1>
          <p>{t('merge.desc')}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {files.length > 0 && (
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={18} /> {t('common.addMore')}
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
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <div className="card glass">
            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>{t('merge.queue')}</h3>
            {files.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>{t('merge.empty')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="nav-item" style={{ justifyContent: 'space-between', padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'var(--bg-primary)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{f.name}</span>
                    <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}

            {isProcessing && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                {t('common.processing')}
              </p>
            )}
            {mergeError && <div style={{ marginTop: '1rem' }}><StatusBanner type="error" message={mergeError} /></div>}
          </div>

          <div className="card glass" style={{ borderStyle: 'dashed' }}>
             <FileUploader onFilesSelected={handleFilesSelected} multiple={true} />
          </div>
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {mergedBytes ? (
            <PdfPreviewer pdfBytes={mergedBytes} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: '1rem' }}>
              {isProcessing
                ? <span className="spin" style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                : <Eye size={48} opacity={0.2} />}
              <p>{isProcessing ? t('common.processing') : t('merge.preview')}</p>
            </div>
          )}
          {mergedPdfUrl && (
            <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = mergedPdfUrl!;
                  a.download = "merged_studio.pdf";
                  a.click();
                }}
                style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
              >
                <Download size={18} /> {t('merge.downloadMerged')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
