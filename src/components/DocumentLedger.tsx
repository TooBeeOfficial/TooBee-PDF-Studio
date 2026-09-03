import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToolStore, type LedgerEntry } from '../store/useToolStore';

/**
 * The document ledger.
 *
 * TooBee already chains tools: `useToolStore.document` carries the working
 * document from one tool to the next, so you can compress, then rotate, then
 * protect without re-opening the file. Nothing in the interface has ever said
 * so, which means people almost certainly re-open the file between tools.
 * This surfaces the chain.
 *
 * It is derived entirely by *observing* the store — no tool calls into it, and
 * no PDF-handling function is modified. The route the document changed under
 * tells us which operation produced the change.
 */

const ROUTE_LABELS: Record<string, string> = {
  '/merge': 'Merged',
  '/split': 'Split',
  '/compress': 'Compressed',
  '/rotate': 'Rotated',
  '/extract': 'Extracted pages',
  '/extract-folder': 'Extracted to folder',
  '/edit': 'Edited',
  '/sign': 'Signed',
  '/protect': 'Protected',
  '/unlock': 'Unlocked',
  '/convert': 'Converted',
};

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024, units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

function signedPercent(from: number, to: number) {
  if (!from || !to || from === to) return undefined;
  const pct = Math.round((1 - to / from) * 100);
  if (pct === 0) return undefined;
  return pct > 0 ? `−${pct}%` : `+${Math.abs(pct)}%`;
}

/**
 * Watches the working document and appends a ledger entry whenever it changes.
 * Rendered once, inside the router. Renders nothing itself.
 */
export function DocumentLedgerWatcher() {
  const location = useLocation();
  const file = useToolStore(s => s.document.file);
  const bytes = useToolStore(s => s.document.bytes);
  const pushLedger = useToolStore(s => s.pushLedger);
  const clearLedger = useToolStore(s => s.clearLedger);
  const noteNextChange = useToolStore(s => s.noteNextChange);

  // Previous observation, so we can tell "opened a new file" from "a tool
  // produced a new version of the file already loaded".
  const prev = useRef<{ name: string | null; size: number }>({ name: null, size: 0 });

  useEffect(() => {
    const size = bytes?.length ?? 0;
    const name = file?.name ?? null;

    if (!file || !size) {
      prev.current = { name: null, size: 0 };
      return;
    }
    if (name === prev.current.name && size === prev.current.size) return;

    const isNewDocument = prev.current.name === null || name !== prev.current.name;
    const route = location.pathname;
    // A page may have told us what it just did, when the route would mislabel it.
    const note = useToolStore.getState().pendingNote;
    if (note) noteNextChange(null);

    // Merge rewrites the name to merged.pdf, so a name change there is still an
    // operation rather than someone opening an unrelated file.
    const treatAsOperation = !isNewDocument || route === '/merge';

    const entry: LedgerEntry = treatAsOperation
      ? {
          id: `${Date.now()}-${size}`,
          route,
          label: note ?? ROUTE_LABELS[route] ?? 'Changed',
          detail: signedPercent(prev.current.size, size) ?? formatSize(size),
          bytes: size,
        }
      : {
          id: `${Date.now()}-${size}`,
          route,
          label: 'Opened',
          detail: formatSize(size),
          bytes: size,
        };

    if (!treatAsOperation) clearLedger();
    pushLedger(entry);
    prev.current = { name, size };
  }, [file, bytes, location.pathname, pushLedger, clearLedger, noteNextChange]);

  return null;
}

/** The visible panel, pinned in the rail below the navigation. */
export default function DocumentLedger() {
  const file = useToolStore(s => s.document.file);
  const bytes = useToolStore(s => s.document.bytes);
  const ledger = useToolStore(s => s.ledger);
  const setDocument = useToolStore(s => s.setDocument);
  const clearLedger = useToolStore(s => s.clearLedger);
  const { t } = useTranslation();

  if (!file) return null;

  const size = bytes?.length ?? file.size;
  // Newest first: the current state of the document is the most useful line.
  const steps = [...ledger].reverse();

  return (
    <section className="ledger" aria-label={t('ledger.title')}>
      <div className="ledger-head">
        <span className="t-eyebrow">{t('ledger.title')}</span>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => { setDocument(null, null); clearLedger(); }}
          aria-label={t('ledger.close')}
        >
          <X size={13} />
        </button>
      </div>

      <div className="ledger-doc">
        <FileText size={13} />
        <span className="ledger-name" title={file.name}>{file.name}</span>
      </div>
      <div className="ledger-size num">{formatSize(size)}</div>

      {steps.length > 0 && (
        <ol className="ledger-steps">
          {steps.map((step, i) => (
            <li key={step.id} className={i === 0 ? 'current' : ''}>
              <span className="ledger-label">{step.label}</span>
              {step.detail && <span className="ledger-detail num">{step.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
