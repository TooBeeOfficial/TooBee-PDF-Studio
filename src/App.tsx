import { HashRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutGrid, FileStack, Scissors, Minimize2,
  RotateCw, Edit3, PenTool,
  Lock, FileOutput, Image, FolderDown,
  Moon, Sun, Unlock as UnlockIcon
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Pages
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

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutGrid },
    ]
  },
  {
    label: 'Document Tools',
    items: [
      { path: '/merge', label: 'Merge PDFs', icon: FileStack },
      { path: '/split', label: 'Advanced Split', icon: Scissors },
      { path: '/compress', label: 'Compress', icon: Minimize2 },
      { path: '/rotate', label: 'Rotate & Reorder', icon: RotateCw },
      { path: '/extract', label: 'Extract Pages', icon: FileOutput },
      { path: '/extract-folder', label: 'Extract to Folder', icon: FolderDown },
    ]
  },
  {
    label: 'Studio & Edit',
    items: [
      { path: '/edit', label: 'Studio Editor', icon: Edit3 },
      { path: '/sign', label: 'Sign PDF', icon: PenTool },
    ]
  },
  {
    label: 'Security & Privacy',
    items: [
      { path: '/protect', label: 'Protect PDF', icon: Lock },
      { path: '/unlock', label: 'Unlock PDF', icon: UnlockIcon },
    ]
  },
  {
    label: 'Conversion',
    items: [
      { path: '/convert', label: 'PDF to Image', icon: Image },
    ]
  }
];

function Sidebar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img
          src="./bee-logo.svg"
          alt="TooBee bee logo"
          style={{ width: 32, height: 32, flexShrink: 0 }}
        />
        TooBee <span>Studio</span>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {navGroups.map(group => (
          <div key={group.label} className="nav-group">
            <div className="nav-label">{group.label}</div>
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
        <button className="btn btn-secondary" onClick={toggleTheme} style={{ width: '100%', justifyContent: 'flex-start' }}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
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
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <AnimatedRoutes />
        </main>
      </div>
    </Router>
  );
}
