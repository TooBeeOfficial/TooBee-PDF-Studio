import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText, ZoomIn, ZoomOut } from 'lucide-react';
import './PdfPreviewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PageInfo {
  num: number;
  /** natural CSS width at base RENDER_SCALE (before DPI multiply) */
  cssWidth: number;
  cssHeight: number;
}

interface Props {
  pdfBytes: Uint8Array | null;
}

// Base scale for rendering
const BASE_RENDER_SCALE = 1.0;

// ─── Per-page canvas component ─────────────────────────────────────────────────
interface PageProps {
  pageInfo: PageInfo;
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  zoom: number;
}

function PdfPage({ pageInfo, pdfDoc, zoom }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastRenderedZoom = useRef<number>(0);
  const [loading, setLoading] = useState(true);

  const renderPage = useCallback(async () => {
    // Only re-render if zoom has significantly changed or never rendered
    if (Math.abs(lastRenderedZoom.current - zoom) < 0.05) return;
    lastRenderedZoom.current = zoom;

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const page = await pdfDoc.getPage(pageInfo.num);
      const dpi = window.devicePixelRatio || 1;
      // Multiply base scale by current zoom and DPI
      const viewport = page.getViewport({ scale: BASE_RENDER_SCALE * zoom * dpi });

      // Physical pixel size
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      // CSS display size
      canvas.style.width = `${pageInfo.cssWidth * zoom}px`;
      canvas.style.height = `${pageInfo.cssHeight * zoom}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
      setLoading(false);
    } catch (e) {
      console.error(`Failed to render page ${pageInfo.num}`, e);
      setLoading(false);
    }
  }, [pdfDoc, pageInfo, zoom]);

  // Lazy-render via IntersectionObserver
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          renderPage();
        }
      },
      { threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [renderPage]);

  // Re-render when zoom changes if already visible
  useEffect(() => {
    renderPage();
  }, [zoom, renderPage]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: pageInfo.cssWidth * zoom,
        height: pageInfo.cssHeight * zoom,
        background: '#fff',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        borderRadius: '3px',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.1s ease-out, height 0.1s ease-out',
      }}
    >
      {loading && (
        <div className="page-shimmer">
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Page {pageInfo.num}</span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
        }}
      />

      {!loading && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            right: 8,
            fontSize: '0.65rem',
            color: '#64748b',
            background: 'rgba(248,250,252,0.85)',
            padding: '1px 6px',
            borderRadius: '99px',
          }}
        >
          {pageInfo.num}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function PdfPreviewer({ pdfBytes }: Props) {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.5);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pdfBytes) {
      setPages([]);
      setPdfDoc(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setError(null);
      try {
        const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
        if (cancelled) { doc.destroy(); return; }

        const infos: PageInfo[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: BASE_RENDER_SCALE });
          infos.push({
            num: i,
            cssWidth: vp.width,
            cssHeight: vp.height,
          });
        }

        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setPages(infos);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load PDF');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.min(4, Math.max(0.25, prev + delta)));
    }
  };

  if (!pdfBytes) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', gap: '1rem',
      }}>
        <FileText size={48} style={{ opacity: 0.2 }} />
        <p style={{ fontSize: '0.9rem', opacity: 0.5 }}>No document loaded</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#f43f5e', fontSize: '0.85rem', padding: '1rem', textAlign: 'center',
      }}>
        ⚠ {error}
      </div>
    );
  }

  if (!pdfDoc) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spin" style={{ width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      
      {/* Zoom Controls Overlay */}
      <div style={{ 
        position: 'absolute', 
        top: '1rem', 
        right: '1.5rem', 
        zIndex: 10, 
        display: 'flex', 
        gap: '0.5rem', 
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(8px)',
        padding: '0.4rem 0.75rem',
        borderRadius: '0.75rem',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
      }}>
        <button 
          onClick={() => setZoom(prev => Math.max(0.25, prev - 0.2))}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: zoom <= 0.25 ? 0.3 : 1 }}
        >
          <ZoomOut size={16} />
        </button>
        <span style={{ fontSize: '0.75rem', color: 'white', minWidth: '40px', textAlign: 'center', fontWeight: 'bold' }}>{Math.round(zoom * 100)}%</span>
        <button 
          onClick={() => setZoom(prev => Math.min(4, prev + 0.2))}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: zoom >= 4 ? 0.3 : 1 }}
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <div
        ref={containerRef}
        onWheel={handleWheel}
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '4rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          backgroundColor: 'var(--bg-secondary)',
          boxSizing: 'border-box',
          scrollBehavior: 'smooth'
        }}
      >
        {pages.map(p => (
          <PdfPage key={`${p.num}-${pdfBytes.length}`} pageInfo={p} pdfDoc={pdfDoc} zoom={zoom} />
        ))}
      </div>
    </div>
  );
}
