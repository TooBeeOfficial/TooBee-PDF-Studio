import { Link } from 'react-router-dom';
import {
  Layers, Scissors, Minimize2, RefreshCw,
  Edit3, PenTool, Lock, ShieldOff,
  RotateCw, FileOutput, UploadCloud, FolderDown
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
  const tools = [
    { title: 'Merge PDFs', description: 'Combine multiple PDF files into one.', icon: <Layers size={22} />, path: '/merge', color: '#6366f1' },
    { title: 'Split PDF', description: 'Break a PDF into separate files.', icon: <Scissors size={22} />, path: '/split', color: '#ec4899' },
    { title: 'Compress PDF', description: 'Reduce file size for easier sharing.', icon: <Minimize2 size={22} />, path: '/compress', color: '#10b981' },
    { title: 'Convert PDF', description: 'Change PDFs to/from images.', icon: <RefreshCw size={22} />, path: '/convert', color: '#f59e0b' },
    { title: 'Studio Editor', description: 'Modify text, shapes, and layout.', icon: <Edit3 size={22} />, path: '/edit', color: '#3b82f6' },
    { title: 'Sign PDF', description: 'Add professional digital signatures.', icon: <PenTool size={22} />, path: '/sign', color: '#06b6d4' },
    { title: 'Rotate & Reorder', description: 'Manage and spin page layout.', icon: <RotateCw size={22} />, path: '/rotate', color: '#f43f5e' },
    { title: 'Extract Pages', description: 'Pull out specific pages.', icon: <FileOutput size={22} />, path: '/extract', color: '#22c55e' },
    { title: 'Extract to Folder', description: 'Split every page into its own PDF and download as a ZIP.', icon: <FolderDown size={22} />, path: '/extract-folder', color: '#a855f7' },
    { title: 'Protect PDF', description: 'Encrypt your document with a 128-bit RC4 password.', icon: <Lock size={22} />, path: '/protect', color: '#d0a700' },
    { title: 'Unlock PDF', description: 'Remove password protection and export freely.', icon: <ShieldOff size={22} />, path: '/unlock', color: '#38bdf8' },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.04 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="view-header" style={{ padding: '2rem 2rem 1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>Welcome to TooBee PDF Studio</h1>
          <p style={{ fontSize: '1rem', opacity: 0.8 }}>The ultimate private PDF toolkit. Select a tool to begin.</p>
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, overflowY: 'auto', padding: '1rem 2rem 2rem 2rem' }}>
        <motion.div
          className="tool-grid"
          variants={container}
          initial="hidden"
          animate="show"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}
        >
          {tools.map((tool) => (
            <motion.div key={tool.path} variants={item}>
              <Link to={tool.path} className="card tool-card glass" style={{ textDecoration: 'none', padding: '1.5rem', height: '100%' }}>
                <div className="tool-icon" style={{ backgroundColor: `${tool.color}15`, color: tool.color, width: '48px', height: '48px', borderRadius: '12px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {tool.icon}
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: '700' }}>{tool.title}</h2>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{tool.description}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <div className="card glass" style={{ marginTop: '3rem', borderStyle: 'dashed', textAlign: 'center', padding: '4rem 2rem', borderColor: 'var(--border-color)' }}>
          <div style={{ color: 'var(--accent)', marginBottom: '1.5rem', opacity: 0.8 }}><UploadCloud size={56} strokeWidth={1.5} /></div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: '700' }}>Privacy First Design</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem auto', lineHeight: '1.6' }}>
            TooBee PDF Studio processes everything directly in your browser. Your sensitive documents never touch our servers, ensuring 100% privacy and security.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '0.5rem 1.25rem', borderRadius: '2rem' }}>100% Private</span>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.5rem 1.25rem', borderRadius: '2rem' }}>Local Processing</span>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', backgroundColor: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', padding: '0.5rem 1.25rem', borderRadius: '2rem' }}>Zero Cloud Uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
