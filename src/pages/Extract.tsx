import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { ACCEPTED_FILE_EXT } from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import StatusBanner from '../components/StatusBanner';
import { Download, FileUp } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

export default function Extract() {
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: sourceBytes } = doc;
  const [pages, setPages] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;

    // Adding a file while one is open puts its pages on the end of the stack
    // instead of discarding the document being worked on.
    if (sourceBytes && sourceBytes.length && file) {
      try {
        const merged = await appendPdf(sourceBytes, newFiles);
        noteNextChange('Added pages');
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
      setError(e instanceof Error ? e.message : 'That file type cannot be opened.');
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
      if (!pageIndices.length) throw new Error('Invalid page numbers');
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
    <div className="fade-in">
      <header className="view-header">
        <h1>Extract pages</h1>
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
      </header>

      <div className="workbench">
        <div className="stage">
          {sourceBytes ? (
            <PdfPreviewer pdfBytes={sourceBytes} />
          ) : (
            <EmptyStage
              motif="extract"
              headline={"Pull out specific pages"}
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

                <div className="field">
                  <label htmlFor="extract-pages">Pages to keep</label>
                  <input
                    id="extract-pages"
                    type="text"
                    className="input input-mono"
                    value={pages}
                    onChange={e => setPages(e.target.value)}
                    placeholder="1, 3, 5"
                  />
                  <p className="hint">Separate page numbers with commas.</p>
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
                {isProcessing ? 'Extracting…' : 'Extract pages'}
              </button>
              {extractedUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = extractedUrl!; a.download = 'extracted_pages.pdf'; a.click(); }}
                >
                  <Download size={15} /> Save extracted PDF
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
