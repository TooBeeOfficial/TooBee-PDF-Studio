import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import StatusBanner from '../components/StatusBanner';
import { Download } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

export default function Extract() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: sourceBytes } = doc;
  const [pages, setPages] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);


  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;

    // Adding a file while one is open puts its pages on the end of the stack
    // instead of discarding the document being worked on.
    if (sourceBytes && sourceBytes.length && file) {
      try {
        const merged = await appendPdf(sourceBytes, newFiles);
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
    setError(null);
    const bytes = new Uint8Array(await f.arrayBuffer());
    setDocument(f, bytes);
    setExtractedUrl(null);
    setPages('');
  };

  const extractPages = async () => {
    if (!sourceBytes || !pages || !file) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(sourceBytes.slice(0));
      const newPdf = await PDFDocument.create();
      const pageIndices = pages.split(',').map(p => parseInt(p.trim()) - 1).filter(p => !isNaN(p) && p >= 0 && p < pdfDoc.getPageCount());
      if (!pageIndices.length) throw new Error(t('extract.errInvalid'));
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => newPdf.addPage(page));
      const bytes = await newPdf.save();
      setExtractedUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      setError(null);
      // The extracted subset becomes the new working document, so other
      // tools continue from these pages instead of the full original.
      setDocument(new File([bytes], file.name, { type: 'application/pdf' }), bytes);
    } catch {
      setError('No pages matched. Enter page numbers separated by commas, like 1, 3, 5.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('extract.title')}</h1>
      </header>

      <div className="workbench">
        <div className="stage">
          {sourceBytes ? (
            <PdfPreviewer pdfBytes={sourceBytes} />
          ) : (
            <EmptyStage
              motif="extract"
              headline={t('extract.emptyHeadline')}
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
                <div className="field">
                  <label htmlFor="extract-pages">{t('extract.pagesToKeep')}</label>
                  <input
                    id="extract-pages"
                    type="text"
                    className="input input-mono"
                    value={pages}
                    onChange={e => setPages(e.target.value)}
                    placeholder={t('extract.rangePlaceholder')}
                  />
                  <p className="hint">{t('extract.rangeHint')}</p>
                </div>

                {error && <StatusBanner type="error" message={error} />}
              </>
            )}
          </div>

          {file && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={extractPages}
                disabled={isProcessing || !pages}
              >
                {isProcessing ? t('extract.extracting') : 'Extract pages'}
              </button>
              {extractedUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = extractedUrl!; a.download = 'extracted_pages.pdf'; a.click(); }}
                >
                  <Download size={15} /> {t('extract.download')}
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
