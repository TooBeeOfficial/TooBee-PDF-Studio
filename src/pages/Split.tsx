import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import { Download, Scissors, Plus, Trash2, FileStack, FileUp, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePdf } from '../context/PdfContext';

interface SplitRule { id: string; name: string; range: string; }
interface SplitResult { name: string; url: string; }

export default function Split() {
  const { file, setActivePdf } = usePdf();
  const [numPages, setNumPages] = useState(0);
  const [rules, setRules] = useState<SplitRule[]>([{ id: '1', name: 'Split 1', range: '1' }]);
  const [results, setResults] = useState<SplitResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    setActivePdf(f, bytes);
    setResults([]);
    const pdfDoc = await PDFDocument.load(bytes.slice(0));
    setNumPages(pdfDoc.getPageCount());
  };

  const addRule = () => setRules([...rules, { id: Math.random().toString(36).substr(2, 9), name: `Split ${rules.length + 1}`, range: '' }]);
  const removeRule = (id: string) => setRules(rules.filter(r => r.id !== id));
  const updateRule = (id: string, field: keyof SplitRule, value: string) => setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));

  const parseRange = (rangeStr: string, max: number) => {
    const indices: number[] = [];
    rangeStr.split(',').forEach(part => {
      if (part.includes('-')) {
        const [s, e] = part.split('-').map(p => parseInt(p.trim()));
        if (!isNaN(s) && !isNaN(e)) for (let i = Math.max(1, s); i <= Math.min(e, max); i++) indices.push(i - 1);
      } else {
        const v = parseInt(part.trim());
        if (!isNaN(v) && v >= 1 && v <= max) indices.push(v - 1);
      }
    });
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  };

  const executeSplits = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer);
      const newResults: SplitResult[] = [];
      for (const rule of rules) {
        if (!rule.range.trim()) continue;
        const indices = parseRange(rule.range, numPages);
        if (!indices.length) continue;
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, indices);
        copiedPages.forEach(page => newPdf.addPage(page));
        const bytes = await newPdf.save();
        newResults.push({ name: rule.name || 'Split Result', url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) });
      }
      setResults(newResults);
    } catch {
      alert('Error during splitting. Check your page ranges.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div>
          <h1>Advanced Multi-Split</h1>
          <p>Define multiple split rules to carve your document into exactly the files you need.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {file && <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={18} /> Select New PDF</button>}
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.length) { setResults([]); handleFilesSelected(Array.from(e.target.files)); } }} style={{ display: 'none' }} accept=".pdf" />
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div className="card glass">
              <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Split Operations</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <AnimatePresence>
                    {rules.map(rule => (
                      <motion.div key={rule.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                        className="card" style={{ padding: '1rem', backgroundColor: 'var(--bg-primary)' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <input type="text" placeholder="File Name" value={rule.name} onChange={e => updateRule(rule.id, 'name', e.target.value)}
                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', borderRadius: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                          <button onClick={() => removeRule(rule.id)} className="btn btn-secondary" style={{ padding: '0.5rem', color: '#f43f5e' }}><Trash2 size={16} /></button>
                        </div>
                        <input type="text" placeholder="Page range (e.g. 1-3, 5)" value={rule.range} onChange={e => updateRule(rule.id, 'range', e.target.value)}
                          style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', borderRadius: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <button className="btn btn-secondary" onClick={addRule} style={{ width: '100%', borderStyle: 'dashed' }}><Plus size={18} /> Add Another Split Rule</button>
                  <button className="btn btn-primary" onClick={executeSplits} disabled={isProcessing || !rules.length} style={{ width: '100%', marginTop: '1rem' }}>
                    {isProcessing ? 'Processing...' : `Generate ${rules.length} Split Files`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
          {results.length > 0 ? (
            <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
              {results.map((res, i) => (
                <div key={i} className="card tool-card fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-primary)', cursor: 'default' }}>
                  <div className="tool-icon" style={{ width: '40px', height: '40px', backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}><FileStack size={20} /></div>
                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{res.name}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ready for download</p>
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => { const a = document.createElement('a'); a.href = res.url; a.download = `${res.name}.pdf`; a.click(); }}>
                    <Download size={16} /> Download
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '1rem' }}>
              {file ? <Scissors size={48} opacity={0.2} /> : <Eye size={48} opacity={0.2} />}
              <p style={{ opacity: 0.5 }}>{file ? 'Define split rules to generate files' : 'Select a PDF to begin splitting'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
