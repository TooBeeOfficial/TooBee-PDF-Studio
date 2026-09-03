import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { ACCEPTED_FILE_EXT } from '../components/FileUploader';
import EmptyStage from '../components/EmptyStage';
import ValueInput from '../components/ValueInput';
import StatusBanner from '../components/StatusBanner';
import ProgressBar from '../components/ProgressBar';
import { Download, FileImage, ZoomIn, ZoomOut, FileUp, Package } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { usePreviewShortcuts } from '../hooks/usePreviewShortcuts';
import { toPdfFile } from '../utils/fileConverter';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ImageResult { url: string; page: number; }

export default function Convert() {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        noteNextChange('Added pages');
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
      setError(e instanceof Error ? e.message : 'Unsupported file type.');
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
      setError('Could not convert this PDF. It may be encrypted or damaged.');
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
    <div className="fade-in">
      <header className="view-header">
        <h1>PDF to image</h1>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          {images.length > 0 && (
            <div className="zoom-control">
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setVisualScale(p => Math.max(0.4, p - 0.2))}
                aria-label="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <ValueInput label="Zoom" suffix="%" min={40} max={300} step={10} width={56}
                value={Math.round(visualScale * 100)}
                onCommit={v => setVisualScale(v / 100)} />
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setVisualScale(p => Math.min(3, p + 0.2))}
                aria-label="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
          {file && (
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={15} /> Add PDF
            </button>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={e => { if (e.target.files?.length) handleFilesSelected(Array.from(e.target.files)); }}
            style={{ display: 'none' }}
            accept={ACCEPTED_FILE_EXT}
            multiple
          />
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
                    <img src={img.url} alt={`Page ${img.page}`} loading="lazy" />
                    <figcaption>
                      <span className="hint">Page <span className="num">{img.page}</span></span>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadSingle(img)}>
                        <Download size={13} /> Save
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : (
            <EmptyStage
              motif="convert"
              headline={"Turn pages into images"}
              onFilesSelected={handleFilesSelected}
            />
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            {file && (
              <>
                <div className="inspector-group">
                  <div className="t-eyebrow">Document</div>
                  <div className="file-name" title={file.name}>{file.name}</div>
                </div>

                <div className="inspector-group">
                  <div className="t-eyebrow">Format</div>
                  <div className="segmented" role="group" aria-label="Image format">
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
                  <div className="t-eyebrow">Resolution</div>
                  <div className="segmented" role="group" aria-label="Image resolution">
                    {([2, 3] as const).map(s => (
                      <button
                        key={s}
                        aria-pressed={scale === s}
                        onClick={() => { setScale(s); revokeImages(images); setImages([]); setSuccess(false); }}
                      >
                        {s === 2 ? 'Standard' : 'High'} <span className="num">{s}×</span>
                      </button>
                    ))}
                  </div>
                  <p className="hint">High doubles the file size of each image.</p>
                </div>

                {isProcessing && (
                  <ProgressBar value={progress} label="Converting" detail={`${currentPage} / ${totalPages || '?'}`} />
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
                  ? <><span className="spinner" /> Converting…</>
                  : <><FileImage size={15} /> Convert to images</>}
              </button>
              {images.length > 0 && (
                <button className="btn btn-secondary btn-block" onClick={downloadAllAsZip} disabled={isZipping}>
                  {isZipping
                    ? <><span className="spinner" /> Building ZIP…</>
                    : <><Package size={15} /> Save all as ZIP</>}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
