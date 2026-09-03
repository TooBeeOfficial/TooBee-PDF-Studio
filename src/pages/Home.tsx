import { Link } from 'react-router-dom';
import {
  Layers, Scissors, Minimize2, RefreshCw,
  Edit3, PenTool, Lock, ShieldOff,
  RotateCw, FileOutput, HardDrive, FolderDown
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();

  // No per-tool accent colors: eleven unrelated hues is a rainbow, not a system,
  // and it leaves amber meaningless as a signal. Icons take the accent on hover.
  const tools = [
    { title: t('sidebar.merge'), description: t('home.tools.mergeDesc'), icon: Layers, path: '/merge' },
    { title: t('sidebar.split'), description: t('home.tools.splitDesc'), icon: Scissors, path: '/split' },
    { title: t('sidebar.compress'), description: t('home.tools.compressDesc'), icon: Minimize2, path: '/compress' },
    { title: t('sidebar.pdfToImage'), description: t('home.tools.convertDesc'), icon: RefreshCw, path: '/convert' },
    { title: t('sidebar.studioEditor'), description: t('home.tools.editDesc'), icon: Edit3, path: '/edit' },
    { title: t('sidebar.sign'), description: t('home.tools.signDesc'), icon: PenTool, path: '/sign' },
    { title: t('sidebar.rotate'), description: t('home.tools.rotateDesc'), icon: RotateCw, path: '/rotate' },
    { title: t('sidebar.extract'), description: t('home.tools.extractDesc'), icon: FileOutput, path: '/extract' },
    { title: t('sidebar.extractFolder'), description: t('home.tools.extractFolderDesc'), icon: FolderDown, path: '/extract-folder' },
    { title: t('sidebar.protect'), description: t('home.tools.protectDesc'), icon: Lock, path: '/protect' },
    { title: t('sidebar.unlock'), description: t('home.tools.unlockDesc'), icon: ShieldOff, path: '/unlock' },
  ];

  return (
    <div className="fade-in">
      {/* The dashboard is the one screen that is not a tool, so it gets the
          app's single large typographic moment instead of the 48px tool bar. */}
      <header className="masthead">
        <div className="t-eyebrow">TooBee PDF Studio</div>
        <h1 className="t-display">{t('home.headline')}</h1>
        <p>{t('home.mastheadSub')}</p>
      </header>

      <div className="view-body" style={{ overflowY: 'auto' }}>
        <div className="home-grid">
          <div className="tool-grid">
            {tools.map(tool => (
              <Link key={tool.path} to={tool.path} className="tool-card">
                <div className="tool-icon"><tool.icon size={18} /></div>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
              </Link>
            ))}
          </div>

          {/* The masthead now carries the privacy claim, so this states the
              three specifics rather than repeating the headline. */}
          <aside className="privacy-note">
            <div className="privacy-icon"><HardDrive size={18} /></div>
            <h2>{t('home.privacyTitle')}</h2>
            <ul>
              <li>{t('home.badgePrivate')}</li>
              <li>{t('home.badgeLocal')}</li>
              <li>{t('home.badgeNoCloud')}</li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
