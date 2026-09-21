import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

/**
 * The window's own bar.
 *
 * Electron's frame is switched off in electron/main.ts — the title, the logo
 * and the minimize, maximize and close buttons a native frame would draw are
 * this component's job instead. It only renders inside Electron: a browser
 * tab already has its own chrome, and window.ipcRenderer isn't present there.
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const ipc = (window as any).ipcRenderer;
    if (!ipc) return;

    ipc.invoke('window:isMaximized').then(setMaximized).catch(() => {});
    const unsubscribe = ipc.on('window:maximized-changed', (value: boolean) => setMaximized(value));

    return () => unsubscribe?.();
  }, []);

  if (!(window as any).ipcRenderer) return null;

  const minimize = () => { void (window as any).ipcRenderer.invoke('window:minimize'); };
  const toggleMaximize = () => { void (window as any).ipcRenderer.invoke('window:toggleMaximize'); };
  const close = () => { void (window as any).ipcRenderer.invoke('window:close'); };

  return (
    <div className="titlebar" onDoubleClick={toggleMaximize}>
      <div className="titlebar-brand">
        <img className="titlebar-logo" src="./titlebar-logo.svg" alt="" />
        <span className="titlebar-title">TooBee PDF Studio</span>
      </div>

      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn" aria-label="Minimize" onClick={minimize}>
          <Minus size={14} />
        </button>
        <button type="button" className="titlebar-btn" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={toggleMaximize}>
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button type="button" className="titlebar-btn titlebar-btn-close" aria-label="Close" onClick={close}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
