import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';
import { PDFDocument } from 'pdf-lib';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import StatusBanner from '../components/StatusBanner';
import { Download, Plus, Trash2, FileStack } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

interface SplitRule { id: string; name: string; range: string; }
interface SplitResult { name: string; url: string; }

export default function Split() {
  const { t } = useTranslation();
  const { dropProps, isDragging } = useFileDrop(files => {
                setResults([]);
                handleFilesSelected(files);
              });
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: pdfBytes } = doc;
  const [numPages, setNumPages] = useState(0);
  const [rules, setRules] = useState<SplitRule[]>([{ id: '1', name: 'Split 1', range: '1' }]);
  const [results, setResults] = useState<SplitResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : t('common.errUnsupported'));
      return;
    }
    setError(null);
    const bytes = new Uint8Array(await f.arrayBuffer());
    setDocument(f, bytes);
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
    if (!pdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
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
      setError(newResults.length ? null : t('split.errNoPages'));
    } catch {
      setError(t('split.errFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const activeRules = rules.filter(r => r.range.trim()).length;

  return (
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('split.title')}</h1>
      </header>

      <div className="workbench">
        <div className="stage">
          {results.length > 0 ? (
            <div className="stage-scroll">
              <div className="result-grid">
                {results.map((res, i) => (
                  <div key={i} className="result-card">
                    <div className="tool-icon"><FileStack size={18} /></div>
                    <h3>{res.name}</h3>
                    <p className="hint">{t('split.readyToSave')}</p>
                    <button
                      className="btn btn-secondary btn-block"
                      onClick={() => { const a = document.createElement('a'); a.href = res.url; a.download = `${res.name}.pdf`; a.click(); }}
                    >
                      <Download size={14} /> Save
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : pdfBytes ? (
            <PdfPreviewer pdfBytes={pdfBytes} />
          ) : (
            <EmptyStage
              motif="split"
              headline={t('split.emptyHeadline')}
              onFilesSelected={handleFilesSelected}
            />
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            <div className="inspector-group">
              <div className="t-eyebrow">{t('common.document')}</div>
              {file && (<>
                <div className="file-name" title={file.name}>{file.name}</div>
                {numPages > 0 && (
                  <p className="hint"><span className="num">{numPages}</span> {t('common.pagesLabel', { count: numPages })}</p>
                )}
              </>)}
              <FileUploader onFilesSelected={files => {
                setResults([]);
                handleFilesSelected(files);
              }} multiple />
            </div>

            {file && (
              <>
                <div className="inspector-group">
                  <div className="t-eyebrow">{t('split.outputFiles')}</div>
                  <div className="rule-list">
                    {rules.map((rule, i) => (
                      <div key={rule.id} className="rule">
                        <div className="rule-head">
                          <span className="queue-index num">{i + 1}</span>
                          <input
                            type="text"
                            className="input"
                            placeholder={t('split.fileName')}
                            aria-label={`File name for output ${i + 1}`}
                            value={rule.name}
                            onChange={e => updateRule(rule.id, 'name', e.target.value)}
                          />
                          <button
                            className="btn btn-danger btn-icon btn-sm"
                            onClick={() => removeRule(rule.id)}
                            aria-label={`Remove output ${i + 1}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <input
                          type="text"
                          className="input input-mono"
                          placeholder={t('split.rangePlaceholder')}
                          aria-label={`Page range for output ${i + 1}`}
                          value={rule.range}
                          onChange={e => updateRule(rule.id, 'range', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-secondary btn-block" onClick={addRule}>
                    <Plus size={15} /> {t('split.addAnother')}
                  </button>
                  <p className="hint">{t('split.rangeHint')}</p>
                </div>

                {error && <StatusBanner type="error" message={error} />}
              </>
            )}
          </div>

          {file && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={executeSplits}
                disabled={isProcessing || activeRules === 0}
              >
                {isProcessing
                  ? t('split.splitting')
                  : activeRules === 1 ? 'Split into 1 file' : `Split into ${activeRules} files`}
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
