import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import { Download, RotateCw, Eye, ArrowLeft, ArrowRight, RefreshCw, Trash2, LayoutGrid } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PageData {
  id: string;
  thumb: string;
  pdfIndex: number;
}

export default function Rotate() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: currentPdfBytes } = doc;
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [stageView, setStageView] = useState<'pages' | 'preview'>('pages');
  const [pages, setPages] = useState<PageData[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const generateAllThumbnails = async (bytes: Uint8Array, initialPages: PageData[]) => {
    setIsGeneratingThumbs(true);
    try {
      const dataCopy = bytes.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;

      const newPages = [...initialPages];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          newPages[i - 1].thumb = canvas.toDataURL('image/jpeg', 0.6);
          // We update state incrementally so UI doesn't block entirely
          setPages([...newPages]);
        }
      }
    } catch (e) {
      console.error("Failed to generate thumbnails", e);
    } finally {
      setIsGeneratingThumbs(false);
    }
  };

  const generateSingleThumbnail = async (bytes: Uint8Array, pdfIndex: number, gridIndex: number) => {
    try {
      const dataCopy = bytes.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pdfIndex + 1);
      const viewport = page.getViewport({ scale: 0.4 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        const newThumbUrl = canvas.toDataURL('image/jpeg', 0.6);
        setPages(prev => {
          const updated = [...prev];
          updated[gridIndex].thumb = newThumbUrl;
          return updated;
        });
      }
    } catch (e) {
      console.error("Failed to regenerate single thumbnail", e);
    }
  };

  const handleFilesSelected = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Adding a file while one is open puts its pages on the end of the stack.
    // The effect below rebuilds the thumbnail grid from the merged document.
    if (currentPdfBytes && currentPdfBytes.length && file) {
      try {
        const merged = await appendPdf(currentPdfBytes, newFiles);
        noteNextChange(t('common.addedPages'));
        setPages([]);
        setDocument(new File([merged], file.name, { type: 'application/pdf' }), merged);
        return;
      } catch (err) {
        console.error('Could not append to the open document', err);
      }
    }

    let selectedFile: File;
    try {
      selectedFile = await toPdfFile(newFiles[0]);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.errUnsupported'));
      return;
    }
    setHasChanges(false);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      const pdfDoc = await PDFDocument.load(uint8Array);
      const totalPages = pdfDoc.getPageCount();

      const initialPages = Array.from({ length: totalPages }, (_, i) => ({
        id: crypto.randomUUID(),
        thumb: '',
        pdfIndex: i
      }));
      setPages(initialPages);
      setDocument(selectedFile, uint8Array);

      const blob = new Blob([uint8Array], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));
      await generateAllThumbnails(uint8Array, initialPages);
    } catch (e) {
      console.error('Failed to load PDF', e);
    }
  };

  // If a document is already loaded (e.g. edited in another tool) but this
  // page hasn't generated thumbnails for it yet, do so now.
  useEffect(() => {
    if (currentPdfBytes && currentPdfBytes.length && pages.length === 0 && !isGeneratingThumbs) {
      PDFDocument.load(currentPdfBytes.slice(0)).then(pdfDoc => {
        const totalPages = pdfDoc.getPageCount();
        const initialPages = Array.from({ length: totalPages }, (_, i) => ({
          id: crypto.randomUUID(),
          thumb: '',
          pdfIndex: i
        }));
        setPages(initialPages);
        setCurrentPdfUrl(URL.createObjectURL(new Blob([currentPdfBytes], { type: 'application/pdf' })));
        generateAllThumbnails(currentPdfBytes, initialPages);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPdfBytes]);

  const applyLiveReorder = async (newPages: PageData[]) => {
    if (!currentPdfBytes || !file || newPages.length === 0) return;
    setIsProcessing(true);
    try {
      const originalPdf = await PDFDocument.load(currentPdfBytes);
      const newPdf = await PDFDocument.create();

      // newPages is the visually ordered array.
      // its pdfIndex property holds the index in the CURRENT currentPdfBytes.
      const newOrder = newPages.map(p => p.pdfIndex);
      const copiedPages = await newPdf.copyPages(originalPdf, newOrder);
      copiedPages.forEach(page => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      setDocument(new File([newPdfBytes], file.name, { type: 'application/pdf' }), newPdfBytes);
      setHasChanges(true);
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));

      // Now update the pdfIndex to match the new currentPdfBytes array index
      const updatedPages = newPages.map((p, i) => ({ ...p, pdfIndex: i }));
      setPages(updatedPages);
    } catch (error) {
      console.error("Error applying live reorder:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const movePage = (currentIndex: number, direction: 'left' | 'right') => {
    const newPages = [...pages];
    if (direction === 'left' && currentIndex > 0) {
      [newPages[currentIndex - 1], newPages[currentIndex]] = [newPages[currentIndex], newPages[currentIndex - 1]];
    } else if (direction === 'right' && currentIndex < newPages.length - 1) {
      [newPages[currentIndex + 1], newPages[currentIndex]] = [newPages[currentIndex], newPages[currentIndex + 1]];
    }
    setPages(newPages);
    applyLiveReorder(newPages);
  };

  const rotateSinglePage = async (gridIndex: number) => {
    if (!currentPdfBytes || !file) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(currentPdfBytes);
      const pdfPages = pdfDoc.getPages();
      const targetIndex = pages[gridIndex].pdfIndex;
      const page = pdfPages[targetIndex];
      page.setRotation(degrees(page.getRotation().angle + 90));

      const newPdfBytes = await pdfDoc.save();
      setDocument(new File([newPdfBytes], file.name, { type: 'application/pdf' }), newPdfBytes);
      setHasChanges(true);
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));
      await generateSingleThumbnail(newPdfBytes, targetIndex, gridIndex);
    } catch (error) {
      console.error("Error rotating single page:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const deletePage = async (gridIndex: number) => {
    if (!currentPdfBytes || !file || pages.length <= 1) return;
    setIsProcessing(true);
    try {
      const newPages = [...pages];
      newPages.splice(gridIndex, 1);

      const newOrder = newPages.map(p => p.pdfIndex);
      const originalPdf = await PDFDocument.load(currentPdfBytes);
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(originalPdf, newOrder);
      copiedPages.forEach(page => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      setDocument(new File([newPdfBytes], file.name, { type: 'application/pdf' }), newPdfBytes);
      setHasChanges(true);
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      setCurrentPdfUrl(URL.createObjectURL(blob));

      const updatedPages = newPages.map((p, i) => ({ ...p, pdfIndex: i }));
      setPages(updatedPages);
    } catch (e) {
      console.error("Error deleting page", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('rotate.title')}</h1>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          {file && (
            <div className="segmented" role="group" aria-label={t('rotate.stageAria')}>
              <button aria-pressed={stageView === 'pages'} onClick={() => setStageView('pages')}>
                <LayoutGrid size={14} /> Pages
              </button>
              <button aria-pressed={stageView === 'preview'} onClick={() => setStageView('preview')}>
                <Eye size={14} /> Preview
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="workbench">
        <div className="stage">
          {!file ? (
            <EmptyStage
              motif="rotate"
              headline={t('rotate.emptyHeadline')}
              onFilesSelected={handleFilesSelected}
            />
          ) : stageView === 'preview' ? (
            currentPdfBytes ? (
              <PdfPreviewer pdfBytes={currentPdfBytes} />
            ) : (
              <div className="empty">
                <Eye size={32} strokeWidth={1.5} />
                <p>{t('rotate.loading')}</p>
              </div>
            )
          ) : (
            <div className="stage-scroll">
              <div className="page-grid">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={(e) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex === null || draggedIndex === index) return;
                      const newPages = [...pages];
                      const draggedItem = newPages[draggedIndex];
                      newPages.splice(draggedIndex, 1);
                      newPages.splice(index, 0, draggedItem);
                      setPages(newPages);
                      setDraggedIndex(index);
                    }}
                    onDrop={(e) => { e.preventDefault(); setDraggedIndex(null); applyLiveReorder(pages); }}
                    className={`page-tile ${draggedIndex === index ? 'dragging' : ''}`}
                  >
                    <div className="page-thumb">
                      <span className="page-number num">{index + 1}</span>
                      {page.thumb ? (
                        <img src={page.thumb} alt={`Page ${index + 1}`} draggable={false} />
                      ) : (
                        <span className="spinner" />
                      )}
                    </div>

                    <div className="page-actions">
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => movePage(index, 'left')}
                        disabled={index === 0}
                        aria-label={`Move page ${index + 1} earlier`}
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => rotateSinglePage(index)}
                        aria-label={`Rotate page ${index + 1}`}
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => deletePage(index)}
                        disabled={pages.length <= 1}
                        aria-label={`Delete page ${index + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => movePage(index, 'right')}
                        disabled={index === pages.length - 1}
                        aria-label={`Move page ${index + 1} later`}
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">{t('common.document')}</div>
              {file && (<>
                <div className="file-name" title={file.name}>{file.name}</div>
                <p className="hint">
                  <span className="num">{pages.length}</span> {t('common.pagesLabel', { count: pages.length })}
                  {isGeneratingThumbs && ` · ${t('rotate.loadingPreviews')}`}
                </p>
              </>)}
              <FileUploader onFilesSelected={handleFilesSelected} multiple />
            </div>

            {file && (
              <>
                <div className="inspector-group">
                  <div className="t-eyebrow">{t('rotate.wholeDocument')}</div>
                  <button
                    className="btn btn-secondary btn-block"
                    disabled={isProcessing}
                    onClick={async () => {
                      if (!currentPdfBytes || !file) return;
                      setIsProcessing(true);
                      const pdfDoc = await PDFDocument.load(currentPdfBytes);
                      pdfDoc.getPages().forEach(page => page.setRotation(degrees(page.getRotation().angle + 90)));
                      const bytes = await pdfDoc.save();
                      setDocument(new File([bytes], file.name, { type: 'application/pdf' }), bytes);
                      setHasChanges(true);
                      const blob = new Blob([bytes.buffer], { type: 'application/pdf' });
                      setCurrentPdfUrl(URL.createObjectURL(blob));

                      // Regenerate all thumbnails
                      const updatedPages = pages.map(p => ({ ...p, thumb: '' }));
                      setPages(updatedPages);
                      await generateAllThumbnails(bytes, updatedPages);

                      setIsProcessing(false);
                    }}
                  >
                    <RefreshCw size={15} className={isProcessing ? 'spin' : ''} /> {t('rotate.rotateAll')}
                  </button>
                </div>

                <p className="hint">{t('rotate.dragHint')}</p>
              </>
            )}
          </div>

          {hasChanges && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = currentPdfUrl!;
                  a.download = `modified_${file?.name || 'document.pdf'}`;
                  a.click();
                }}
              >
                <Download size={15} /> {t('rotate.save')}
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
