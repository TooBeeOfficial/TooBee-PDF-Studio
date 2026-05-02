import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileUploader from '../components/FileUploader';
import { Download, Type, Clipboard, FileText, Search } from 'lucide-react';
import { motion } from 'framer-motion';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function ExtractText() {
  const [file, setFile] = useState<File | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const selectedFile = newFiles[0];
    setFile(selectedFile);
    setParagraphs([]);
    
    setIsProcessing(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;
      
      const allParagraphs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        let lastY;
        let currentParagraph = "";
        
        for (const item of textContent.items as any[]) {
          if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 10) {
            if (currentParagraph.trim()) allParagraphs.push(currentParagraph.trim());
            currentParagraph = "";
          }
          currentParagraph += item.str + " ";
          lastY = item.transform[5];
        }
        if (currentParagraph.trim()) allParagraphs.push(currentParagraph.trim());
      }
      setParagraphs(allParagraphs);
    } catch (e) {
      console.error("Text extraction failed", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const downloadAllText = () => {
    const text = paragraphs.join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace('.pdf', '')}_text.txt`;
    a.click();
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Extract All Text</h1>
          <p>Extract every paragraph from your document with high precision.</p>
        </div>
        {paragraphs.length > 0 && (
          <button className="btn btn-primary" onClick={downloadAllText}>
            <Download size={18} /> Download .TXT
          </button>
        )}
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '2rem', overflow: 'hidden' }}>
        <div style={{ width: '350px' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div className="card glass">
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Document Analysis</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>File:</span>
                  <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Paragraphs:</span>
                  <span>{paragraphs.length}</span>
                </div>
              </div>
              <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Text is organized by structural blocks and vertical spacing.
              </p>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem' }}>
          {isProcessing && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={48} className="spin" style={{ color: 'var(--accent)', marginBottom: '1rem' }} />
              <p>Analyzing text structures...</p>
            </div>
          )}

          {paragraphs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {paragraphs.map((p, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  transition={{ delay: i * 0.01 }}
                  className="card" 
                  style={{ position: 'relative', background: 'var(--bg-secondary)' }}
                >
                  <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-primary)', paddingRight: '2rem' }}>{p}</p>
                  <button 
                    onClick={() => copyToClipboard(p, i)} 
                    style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: copiedIndex === i ? 'var(--success)' : 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    {copiedIndex === i ? <ShieldCheck size={18} /> : <Clipboard size={18} />}
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          {!file && !isProcessing && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}>
              <FileText size={100} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShieldCheck({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
  );
}
