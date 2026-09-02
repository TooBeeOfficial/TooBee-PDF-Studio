import { create } from 'zustand';

interface DocumentSlice {
  file: File | null;
  bytes: Uint8Array | null;
}

interface ToolState {
  mergeFiles: File[];
  setMergeFiles: (files: File[]) => void;

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

  document: { file: null, bytes: null },
  setDocument: (file, bytes) => set({ document: { file, bytes } }),
}));
