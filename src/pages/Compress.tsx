import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import { Download, Zap, RefreshCw } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

export default function Compress() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: pdfBytes } = doc;
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'simple' | 'aggressive'>('aggressive');

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
      alert(e instanceof Error ? e.message : t('common.errUnsupported'));
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    setDocument(f, bytes);
    setOriginalSize(f.size);
    setCompressedUrl(null);
    setCompressedSize(0);
  };

  const compressPdf = async () => {
    if (!pdfBytes || !file) return;
    setIsProcessing(true);
    try {
      const originalDoc = await PDFDocument.load(pdfBytes.slice(0));
      let finalBytes: Uint8Array;
      if (mode === 'aggressive') {
        const compressedDoc = await PDFDocument.create();
        const copiedPages = await compressedDoc.copyPages(originalDoc, originalDoc.getPageIndices());
        copiedPages.forEach(page => compressedDoc.addPage(page));
        finalBytes = await compressedDoc.save({ useObjectStreams: true });
      } else {
        finalBytes = await originalDoc.save({ useObjectStreams: true });
      }
      setOriginalSize(prev => prev || file.size);
      setCompressedSize(finalBytes.length);
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      setCompressedUrl(URL.createObjectURL(blob));
      // The compressed result becomes the new working document, so other
      // tools pick up the compressed version instead of the original.
      setDocument(new File([finalBytes], file.name, { type: 'application/pdf' }), finalBytes);
    } catch (e) {
      console.error(t('compress.errFailed'), e);
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

  const modes = [
    {
      id: 'simple' as const,
      label: t('compress.simple'),
      icon: Zap,
      hint: t('compress.simpleHint'),
    },
    {
      id: 'aggressive' as const,
      label: t('compress.aggressive'),
      icon: RefreshCw,
      hint: t('compress.aggressiveHint'),
    },
  ];

  const baseSize = originalSize || file?.size || 0;
  const savedPct = compressedSize > 0 && baseSize
    ? Math.round((1 - compressedSize / baseSize) * 100)
    : 0;

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('compress.title')}</h1>
      </header>

      <div className="workbench">
        <div className="stage">
          {pdfBytes ? (
            <PdfPreviewer pdfBytes={pdfBytes} />
          ) : (
            <EmptyStage
              motif="compress"
              headline={t('compress.emptyHeadline')}
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
                <div className="inspector-group">
                  <div className="t-eyebrow">{t('compress.mode')}</div>
                  <div className="choice-list" role="radiogroup" aria-label={t('compress.modeAria')}>
                    {modes.map(m => (
                      <button
                        key={m.id}
                        role="radio"
                        aria-checked={mode === m.id}
                        onClick={() => setMode(m.id)}
                        className={`choice ${mode === m.id ? 'selected' : ''}`}
                      >
                        <span className="choice-title"><m.icon size={14} /> {m.label}</span>
                        <span className="choice-hint">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="inspector-group">
                  <div className="t-eyebrow">{t('common.size')}</div>
                  <dl className="readout">
                    <div>
                      <dt>{t('compress.original')}</dt>
                      <dd className="num">{formatSize(baseSize)}</dd>
                    </div>
                    {compressedSize > 0 && (
                      <>
                        <div>
                          <dt>{t('compress.compressed')}</dt>
                          <dd className="num">{formatSize(compressedSize)}</dd>
                        </div>
                        <div className="readout-total">
                          <dt>{t('compress.savedLabel')}</dt>
                          <dd className="num" style={{ color: savedPct > 0 ? 'var(--ok)' : 'var(--text-dim)' }}>
                            {savedPct}%
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                </div>
              </>
            )}
          </div>

          {file && (
            <div className="inspector-action">
              <button className="btn btn-primary btn-block" onClick={compressPdf} disabled={isProcessing}>
                {isProcessing ? t('compress.compressing') : t('compress.title')}
              </button>
              {compressedUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = compressedUrl!;
                    a.download = `compressed_${file?.name || 'document.pdf'}`;
                    a.click();
                  }}
                >
                  <Download size={15} /> {t('compress.download')}
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
