import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutGrid, FileStack, Scissors, Minimize2,
  RotateCw, Edit3, PenTool,
  Lock, FileOutput, Image, FolderDown, Settings,
  Unlock as UnlockIcon
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import SettingsModal from './components/SettingsModal';
import { useToolStore } from './store/useToolStore';

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
  const { setMergeFiles, setSplitFile } = useToolStore();

  useEffect(() => {
    if (!(window as any).ipcRenderer) return;

    const handleOpenFiles = async (_event: any, data: { files: string[], action: string | null, argv?: string[] }) => {
      const { files, action } = data;
      if (!files || files.length === 0) return;

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
          setMergeFiles(loadedFiles);
        } else {
          setSplitFile(loadedFiles[0]);
        }

        navigate(isMerge ? '/merge' : '/split');
      } catch (err: any) {
        console.error("Failed to process OS files:", err);
      }
    };

    (window as any).ipcRenderer.on('open-files', handleOpenFiles);

    (window as any).ipcRenderer.invoke('get-pending-files').then((data: any) => {
      if (data && data.files && data.files.length > 0) {
        handleOpenFiles(null, data);
      }
    });

    return () => {
      (window as any).ipcRenderer.off('open-files', handleOpenFiles);
    };
  }, [navigate, setMergeFiles, setSplitFile]);

  return null;
}

function Sidebar({ theme, toggleTheme, onOpenSettings }: { theme: 'light' | 'dark', toggleTheme: () => void, onOpenSettings: () => void }) {
  const { t } = useTranslation();

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
      <div className="sidebar-logo">
        <img src="./bee-logo.svg" alt="TooBee bee logo" style={{ width: 32, height: 32, flexShrink: 0 }} />
        TooBee <span>Studio</span>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {navGroups.map(group => (
          <div key={group.label} className="nav-group">
            <div className="nav-label">{group.label}</div>
            {group.items.map(item => (
               <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                 <item.icon size={18} />
                 <span>{item.label}</span>
               </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
        <button className="btn btn-secondary" onClick={onOpenSettings} style={{ width: '100%', justifyContent: 'flex-start' }}>
          <Settings size={18} />
          <span>{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
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
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <Router>
      <OSIntegration />
      <div className="app-container">
        <Sidebar theme={theme} toggleTheme={toggleTheme} onOpenSettings={() => setIsSettingsOpen(true)} />
        <main className="main-content">
          <AnimatedRoutes />
        </main>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </div>
    </Router>
  );
}