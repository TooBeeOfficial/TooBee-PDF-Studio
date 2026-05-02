import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import { Download, FileOutput, Eye, FileUp } from 'lucide-react';
import { usePdf } from '../context/PdfContext';

export default function Extract() {
  const { file, pdfBytes: sourceBytes, setActivePdf } = usePdf();
  const [pages, setPages] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [extractedBytes, setExtractedBytes] = useState<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    setActivePdf(f, bytes);
    setExtractedUrl(null);
    setExtractedBytes(null);
    setPages('');
  };

  const extractPages = async () => {
    if (!sourceBytes || !pages) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(sourceBytes.slice(0));
      const newPdf = await PDFDocument.create();
      const pageIndices = pages.split(',').map(p => parseInt(p.trim()) - 1).filter(p => !isNaN(p) && p >= 0 && p < pdfDoc.getPageCount());
      if (!pageIndices.length) throw new Error('Invalid page numbers');
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => newPdf.addPage(page));
      const bytes = await newPdf.save();
      setExtractedBytes(bytes);
      setExtractedUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch {
      alert('Error extracting pages. Check your page numbers (e.g. 1, 3, 5)');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Extract Pages</h1>
          <p>Create a new PDF containing only the specific pages you need.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {file && <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={18} /> Select New PDF</button>}
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.length) { setExtractedBytes(null); setExtractedUrl(null); handleFilesSelected(Array.from(e.target.files)); } }} style={{ display: 'none' }} accept=".pdf" />
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div className="card glass">
              <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Page Numbers (e.g. 1, 2, 5)</label>
                <input type="text" value={pages} onChange={e => setPages(e.target.value)} placeholder="e.g. 1, 3, 4"
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <button className="btn btn-primary" onClick={extractPages} disabled={isProcessing || !pages} style={{ width: '100%' }}>
                {isProcessing ? 'Extracting...' : 'Extract Pages'}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {(extractedBytes || sourceBytes) ? (
            <PdfPreviewer pdfBytes={extractedBytes || sourceBytes} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: '1rem' }}>
              <Eye size={48} opacity={0.2} /><p>Select a PDF to see the preview</p>
            </div>
          )}
          {extractedUrl && (
            <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <button className="btn btn-primary" onClick={() => { const a = document.createElement('a'); a.href = extractedUrl!; a.download = 'extracted_pages.pdf'; a.click(); }} style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <Download size={18} /> Download Extracted PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
