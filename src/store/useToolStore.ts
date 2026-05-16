import { create } from 'zustand';

interface ToolState {
  mergeFiles: File[];
  setMergeFiles: (files: File[]) => void;
  
  splitFile: File | null;
  setSplitFile: (file: File | null) => void;
  
  compressFile: File | null;
  setCompressFile: (file: File | null) => void;

  convertFile: File | null;
  setConvertFile: (file: File | null) => void;

  rotateFile: File | null;
  setRotateFile: (file: File | null) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  mergeFiles: [],
  setMergeFiles: (files) => set({ mergeFiles: files }),
  
  splitFile: null,
  setSplitFile: (file) => set({ splitFile: file }),
  
  compressFile: null,
  setCompressFile: (file) => set({ compressFile: file }),

  convertFile: null,
  setConvertFile: (file) => set({ convertFile: file }),

  rotateFile: null,
  setRotateFile: (file) => set({ rotateFile: file }),
}));
