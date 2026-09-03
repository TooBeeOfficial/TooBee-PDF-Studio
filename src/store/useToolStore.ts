import { create } from 'zustand';

interface DocumentSlice {
  file: File | null;
  bytes: Uint8Array | null;
}

/**
 * One step in the session's working history.
 *
 * Entries are derived by observing changes to `document`, never by calling into
 * the tools themselves — see useDocumentLedger(). That keeps the PDF pipeline
 * untouched: no operation function has to know the ledger exists.
 */
export interface LedgerEntry {
  id: string;
  /** Route the document changed under, e.g. '/compress'. */
  route: string;
  /** Short label for what happened, e.g. 'Compressed'. */
  label: string;
  /** Optional measured result, e.g. '-76%' or '8 pages'. Set in mono. */
  detail?: string;
  bytes: number;
}

interface ToolState {
  mergeFiles: File[];
  setMergeFiles: (files: File[]) => void;

  /**
   * Label for the next document change, when the route alone would name it
   * wrongly — appending a file while on /compress is "Added pages", not
   * "Compressed". Consumed and cleared by the ledger watcher.
   */
  pendingNote: string | null;
  noteNextChange: (label: string | null) => void;

  /** Chronological history of the working document this session. */
  ledger: LedgerEntry[];
  pushLedger: (entry: LedgerEntry) => void;
  clearLedger: () => void;

  // The single "working document" shared by every tool. Loading a file in any
  // tool sets this; an operation that produces a new version of that same
  // document (rotate, compress, unlock, extract, burn edits, sign, merge)
  // writes its result back here too, so switching tools shows the latest
  // edit instead of the original file, even if it was never downloaded/saved.
  document: DocumentSlice;
  setDocument: (file: File | null, bytes: Uint8Array | null) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  mergeFiles: [],
  setMergeFiles: (files) => set({ mergeFiles: files }),

  pendingNote: null,
  noteNextChange: (label) => set({ pendingNote: label }),

  ledger: [],
  pushLedger: (entry) => set((s) => ({ ledger: [...s.ledger, entry] })),
  clearLedger: () => set({ ledger: [] }),

  document: { file: null, bytes: null },
  setDocument: (file, bytes) => set({ document: { file, bytes } }),
}));
