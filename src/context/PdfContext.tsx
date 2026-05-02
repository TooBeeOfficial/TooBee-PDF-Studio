import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface PdfState {
  file: File | null;
  pdfBytes: Uint8Array | null;
}

interface PdfContextValue extends PdfState {
  setActivePdf: (file: File, bytes: Uint8Array) => void;
  clearPdf: () => void;
}

const PdfContext = createContext<PdfContextValue | null>(null);

export function PdfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PdfState>({ file: null, pdfBytes: null });

  const setActivePdf = useCallback((file: File, bytes: Uint8Array) => {
    setState({ file, pdfBytes: bytes });
  }, []);

  const clearPdf = useCallback(() => {
    setState({ file: null, pdfBytes: null });
  }, []);

  return (
    <PdfContext.Provider value={{ ...state, setActivePdf, clearPdf }}>
      {children}
    </PdfContext.Provider>
  );
}

export function usePdf() {
  const ctx = useContext(PdfContext);
  if (!ctx) throw new Error('usePdf must be used within PdfProvider');
  return ctx;
}
