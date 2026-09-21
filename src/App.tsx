import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutGrid, FileStack, Scissors, Minimize2,
  RotateCw, Edit3, PenTool,
  Lock, FileOutput, Image, FolderDown, Settings,
  Sun, Moon, Gauge, X,
  Unlock as UnlockIcon
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsModal from './components/SettingsModal';
import TitleBar from './components/TitleBar';
import { useToolStore } from './store/useToolStore';
import { usePrefsStore, probePerformance } from './store/usePrefsStore';
import DocumentLedger, { DocumentLedgerWatcher } from './components/DocumentLedger';
import { useShortcuts } from './hooks/useShortcuts';

import Home from './pages/Home';
import Merge from './pages/Merge';
import Split from './pages/Split';
import Compress from './pages/Compress';
import Convert from './pages/Convert';
import Edit from './pages/Edit';
import Sign from './pages/Sign';
import Protect from './pages/Protect';
import Unlock from './pages/Unlock';
import Rotate from './pages/Rotate';
import Extract from './pages/Extract';
import ExtractToFolder from './pages/ExtractToFolder';

function OSIntegration() {
  const navigate = useNavigate();
  const { setMergeFiles, setDocument } = useToolStore();

  useEffect(() => {
    if (!(window as any).ipcRenderer) {
      console.warn('[OSIntegration] window.ipcRenderer is not available — not running inside Electron, or preload failed to attach it.');
      return;
    }

    const handleOpenFiles = async (_event: any, data: { files: string[], action: string | null, argv?: string[] }) => {
      console.log('[OSIntegration] open-files payload received:', data);
      const { files, action } = data;
      if (!files || files.length === 0) {
        console.log('[OSIntegration] payload had no files, ignoring.');
        return;
      }

      const isMerge = action === 'merge' || files.length > 1;

      try {
        const loadedFiles: File[] = [];

        for (const filePath of files) {
          const fileData = await (window as any).ipcRenderer.invoke('read-file', filePath);

          let type = 'application/octet-stream';
          const ext = fileData.name.split('.').pop()?.toLowerCase();

          if (ext === 'pdf') type = 'application/pdf';
          else if (ext === 'png') type = 'image/png';
          else if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg';
          else if (ext === 'docx') type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          else if (ext === 'xlsx') type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else if (ext === 'txt') type = 'text/plain';

          const blob = new Blob([fileData.buffer], { type });
          const file = new File([blob], fileData.name, { type });

          loadedFiles.push(file);
        }

        if (isMerge) {
          console.log('[OSIntegration] loaded', loadedFiles.length, 'file(s) into merge queue, navigating to /merge');
          setMergeFiles(loadedFiles);
        } else {
          console.log('[OSIntegration] loaded file into shared document:', loadedFiles[0].name, 'navigating to /split');
          const bytes = new Uint8Array(await loadedFiles[0].arrayBuffer());
          setDocument(loadedFiles[0], bytes);
        }

        navigate(isMerge ? '/merge' : '/split');
      } catch (err: any) {
        console.error("[OSIntegration] Failed to process OS files:", err);
      }
    };

    const unsubscribe = (window as any).ipcRenderer.on('open-files', handleOpenFiles);

    console.log('[OSIntegration] mounted, asking main process for any pending files...');
    (window as any).ipcRenderer.invoke('get-pending-files').then((data: any) => {
      console.log('[OSIntegration] get-pending-files resolved with:', data);
      if (data && data.files && data.files.length > 0) {
        handleOpenFiles(null, data);
      }
    }).catch((err: any) => {
      console.error('[OSIntegration] get-pending-files invoke failed:', err);
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, setMergeFiles, setDocument]);

  return null;
}

function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const resolvedTheme = usePrefsStore(s => s.resolvedTheme);
  const setTheme = usePrefsStore(s => s.setTheme);

  const navGroups = [
    {
      label: t('sidebar.workspace'),
      items: [
        { path: '/', label: t('sidebar.dashboard'), icon: LayoutGrid },
      ]
    },
    {
      label: t('sidebar.documentTools'),
      items: [
        { path: '/merge', label: t('sidebar.merge'), icon: FileStack },
        { path: '/split', label: t('sidebar.split'), icon: Scissors },
        { path: '/compress', label: t('sidebar.compress'), icon: Minimize2 },
        { path: '/rotate', label: t('sidebar.rotate'), icon: RotateCw },
        { path: '/extract', label: t('sidebar.extract'), icon: FileOutput },
        { path: '/extract-folder', label: t('sidebar.extractFolder'), icon: FolderDown },
      ]
    },
    {
      label: t('sidebar.studioEdit'),
      items: [
        { path: '/edit', label: t('sidebar.studioEditor'), icon: Edit3 },
        { path: '/sign', label: t('sidebar.sign'), icon: PenTool },
      ]
    },
    {
      label: t('sidebar.securityPrivacy'),
      items: [
        { path: '/protect', label: t('sidebar.protect'), icon: Lock },
        { path: '/unlock', label: t('sidebar.unlock'), icon: UnlockIcon },
      ]
    },
    {
      label: t('sidebar.conversion'),
      items: [
        { path: '/convert', label: t('sidebar.pdfToImage'), icon: Image },
      ]
    }
  ];

  return (
    <aside className="sidebar">
      <nav style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {navGroups.map(group => (
          <div key={group.label} className="nav-group">
            <div className="nav-label">{group.label}</div>
            {group.items.map(item => (
               <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                 <item.icon size={16} />
                 <span>{item.label}</span>
               </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <DocumentLedger />

      <div className="rail-footer">
        <button className="btn btn-ghost btn-block" onClick={onOpenSettings} style={{ justifyContent: 'flex-start' }}>
          <Settings size={16} />
          <span>{t('sidebar.settings')}</span>
        </button>
        <button
          className="btn btn-ghost btn-block"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          style={{ justifyContent: 'flex-start' }}
        >
          {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          <span>{resolvedTheme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * One-time offer of Light mode on a machine that looks weak. Only ever suggests —
 * see probePerformance() for why this never applies itself.
 */
function PerfHint() {
  const open = usePrefsStore(s => s.perfHintOpen);
  const dismiss = usePrefsStore(s => s.dismissPerfHint);
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="perf-hint" role="status">
      <Gauge size={16} />
      <span>{t('perf.hint')}</span>
      <button className="btn btn-primary btn-sm" onClick={() => dismiss(true)}>
        {t('perf.switchToLight')}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => dismiss(false)}>
        {t('perf.keepFull')}
      </button>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={() => dismiss(false)}
        aria-label={t('perf.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Route transitions are a CSS crossfade, not a library. Keying the wrapper on the
 * pathname remounts the subtree, which replays the `fadeIn` animation that every
 * page root carries via `.fade-in`. Opacity only — the old x-slide fought the
 * fixed rail and made the whole window twitch on every navigation. Under
 * data-perf="minimal" and prefers-reduced-motion the animation is zeroed in CSS,
 * so there is nothing to branch on here.
 */
/** Registers global shortcuts. Must sit inside <Router> to use navigate(). */
function Shortcuts({ onOpenSettings }: { onOpenSettings: () => void }) {
  useShortcuts(onOpenSettings);
  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
      <div
        key={location.pathname}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/merge" element={<Merge />} />
          <Route path="/split" element={<Split />} />
          <Route path="/compress" element={<Compress />} />
          <Route path="/convert" element={<Convert />} />
          <Route path="/edit" element={<Edit />} />
          <Route path="/sign" element={<Sign />} />
          <Route path="/protect" element={<Protect />} />
          <Route path="/unlock" element={<Unlock />} />
          <Route path="/rotate" element={<Rotate />} />
          <Route path="/extract" element={<Extract />} />
          <Route path="/extract-folder" element={<ExtractToFolder />} />
        </Routes>
      </div>
  );
}

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // The theme and tier attributes are already on <html> from the inline script in
  // index.html, so there is nothing to apply here — only the one-time probe.
  useEffect(() => {
    probePerformance();
  }, []);

  /**
   * Swallow file drops that miss every drop target.
   *
   * Chromium's default for a file dropped on a page is to navigate to it. In a
   * browser that is merely surprising; here it replaces the entire application
   * with a bare PDF view, and with no address bar or back button there is no way
   * out short of restarting. Any drop that reaches the window has already passed
   * every real target, so there is nothing left to do but cancel it.
   */
  useEffect(() => {
    const cancel = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', cancel);
    window.addEventListener('drop', cancel);
    return () => {
      window.removeEventListener('dragover', cancel);
      window.removeEventListener('drop', cancel);
    };
  }, []);

  return (
    <Router>
      <OSIntegration />
      <DocumentLedgerWatcher />
      <Shortcuts onOpenSettings={() => setIsSettingsOpen(true)} />
      <div className="app-container">
        <TitleBar />
        <div className="app-body">
          <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
          <main className="main-content">
            <PerfHint />
            <AnimatedRoutes />
          </main>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        </div>
      </div>
    </Router>
  );
}