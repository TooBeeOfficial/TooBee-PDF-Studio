import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import FileUploader from '../components/FileUploader';
import EmptyStage from '../components/EmptyStage';
import ValueInput from '../components/ValueInput';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, FileImage, ZoomIn, ZoomOut, Package } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { usePreviewShortcuts } from '../hooks/usePreviewShortcuts';
import { toPdfFile } from '../utils/fileConverter';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ImageResult { url: string; page: number; }

export default function Convert() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: docBytes } = doc;
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

  const { onWheel: onPreviewWheel } = usePreviewShortcuts({
    enabled: images.length > 0,
    zoom: { value: visualScale, set: setVisualScale, min: 0.4, max: 3, step: 0.2, reset: 1 },
  });

  const revokeImages = (imgs: ImageResult[]) => imgs.forEach(img => URL.revokeObjectURL(img.url));

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;

    // Adding a file while one is open puts its pages on the end of the stack.
    if (docBytes && docBytes.length && file) {
      try {
        const merged = await appendPdf(docBytes, newFiles);
        noteNextChange(t('common.addedPages'));
        setDocument(new File([merged], file.name, { type: 'application/pdf' }), merged);
        revokeImages(images);
        setImages([]); setError(null); setSuccess(false); setProgress(0); setCurrentPage(0); setTotalPages(0);
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
      setError(t('convert.errConvert'));
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
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('convert.title')}</h1>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          {images.length > 0 && (
            <div className="zoom-control">
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setVisualScale(p => Math.max(0.4, p - 0.2))}
                aria-label={t('common.zoomOut')}
              >
                <ZoomOut size={14} />
              </button>
              <ValueInput label={t('common.zoom')} suffix="%" min={40} max={300} step={10} width={56}
                value={Math.round(visualScale * 100)}
                onCommit={v => setVisualScale(v / 100)} />
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setVisualScale(p => Math.min(3, p + 0.2))}
                aria-label={t('common.zoomIn')}
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="workbench">
        <div
          className="stage"
          onWheel={onPreviewWheel}
        >
          {images.length > 0 ? (
            <div className="stage-scroll">
              <div
                className="image-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(200 * visualScale)}px, 1fr))`,
                }}
              >
                {images.map(img => (
                  <figure key={img.page} className="image-card">
                    <img src={img.url} alt={t('convert.pageAlt', { page: img.page })} loading="lazy" />
                    <figcaption>
                      <span className="hint">{t('convert.page')} <span className="num">{img.page}</span></span>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadSingle(img)}>
                        <Download size={13} /> {t('common.save')}
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : (
            <EmptyStage
              motif="convert"
              headline={t('convert.emptyHeadline')}
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
                  <div className="t-eyebrow">{t('common.format')}</div>
                  <div className="segmented" role="group" aria-label={t('convert.formatAria')}>
                    {(['png', 'jpg'] as const).map(f => (
                      <button
                        key={f}
                        aria-pressed={format === f}
                        onClick={() => { setFormat(f); revokeImages(images); setImages([]); setSuccess(false); }}
                        style={{ textTransform: 'uppercase' }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="inspector-group">
                  <div className="t-eyebrow">{t('convert.resolution')}</div>
                  <div className="segmented" role="group" aria-label={t('convert.resolutionAria')}>
                    {([2, 3] as const).map(s => (
                      <button
                        key={s}
                        aria-pressed={scale === s}
                        onClick={() => { setScale(s); revokeImages(images); setImages([]); setSuccess(false); }}
                      >
                        {s === 2 ? t('convert.resStandard') : t('convert.resHigh')} <span className="num">{s}×</span>
                      </button>
                    ))}
                  </div>
                  <p className="hint">{t('convert.resolutionHint')}</p>
                </div>

                {isProcessing && (
                  <ProgressBar value={progress} label={t('convert.converting')} detail={`${currentPage} / ${totalPages || '?'}`} />
                )}
                {error && <StatusBanner type="error" message={error} />}
                {success && (
                  <StatusBanner
                    type="success"
                    message={`${images.length} image${images.length !== 1 ? 's' : ''} ready.`}
                  />
                )}
              </>
            )}
          </div>

          {file && (
            <div className="inspector-action">
              <button className="btn btn-primary btn-block" onClick={convertPdfToImages} disabled={isProcessing}>
                {isProcessing
                  ? <><span className="spinner" /> {t('convert.converting2')}</>
                  : <><FileImage size={15} /> {t('convert.convert')}</>}
              </button>
              {images.length > 0 && (
                <button className="btn btn-secondary btn-block" onClick={downloadAllAsZip} disabled={isZipping}>
                  {isZipping
                    ? <><span className="spinner" /> {t('convert.buildingZip')}</>
                    : <><Package size={15} /> {t('convert.saveZip')}</>}
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
