import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import PasswordInput from '../components/PasswordInput';
import StatusBanner from '../components/StatusBanner';
import { Download, Lock, ShieldCheck, Eye, FileUp, CheckCircle2 } from 'lucide-react';
import { usePdf } from '../context/PdfContext';

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  if (!pw) return { label: '', color: 'transparent', width: '0%' };
  if (pw.length < 6) return { label: 'Weak', color: '#ef4444', width: '25%' };
  const score = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (pw.length >= 8 && score >= 3) return { label: 'Strong', color: '#22c55e', width: '100%' };
  if (pw.length >= 6 && score >= 2) return { label: 'Medium', color: '#d0a700', width: '60%' };
  return { label: 'Weak', color: '#ef4444', width: '30%' };
}

export default function Protect() {
  const { file, pdfBytes, setActivePdf } = usePdf();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [protectedUrl, setProtectedUrl] = useState<string | null>(null);
  const [protectedName, setProtectedName] = useState('protected.pdf');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const strength = getPasswordStrength(password);
  const passwordsMatch = !!(password && confirmPassword && password === confirmPassword);
  const passwordMismatch = !!(confirmPassword && password !== confirmPassword);

  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles.length) return;
    const f = newFiles[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    setActivePdf(f, bytes);
    setProtectedUrl(null); setError(null); setSuccess(false); setPassword(''); setConfirmPassword('');
  };

  const protectPdf = async () => {
    if (!pdfBytes || !password || !passwordsMatch) return;
    setIsProcessing(true); setError(null); setSuccess(false);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
      const encryptedBytes = await encryptPDF(await pdfDoc.save(), password);
      const url = URL.createObjectURL(new Blob([encryptedBytes], { type: 'application/pdf' }));
      setProtectedUrl(url);
      setProtectedName(`protected_${file!.name}`);
      setSuccess(true);
    } catch {
      setError('Failed to protect PDF. The file may be corrupted or already encrypted.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="view-header">
        <div><h1>Protect PDF</h1><p>Add real password encryption to your documents — 128-bit RC4.</p></div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {file && <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={18} /> Select New PDF</button>}
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.length) handleFilesSelected(Array.from(e.target.files)); }} style={{ display: 'none' }} accept=".pdf" />
        </div>
      </header>

      <div className="view-body" style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!file && <FileUploader onFilesSelected={handleFilesSelected} />}
          {file && (
            <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <h3 style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>

              <PasswordInput label="Set Password" value={password} placeholder="Choose a strong password…"
                onChange={v => { setPassword(v); setSuccess(false); setProtectedUrl(null); }} />

              {password && (
                <div>
                  <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s, background 0.3s', borderRadius: '2px' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: strength.color, marginTop: '0.25rem', display: 'block' }}>{strength.label}</span>
                </div>
              )}

              <PasswordInput label="Confirm Password" value={confirmPassword} placeholder="Re-enter password…"
                borderColor={passwordMismatch ? '#ef4444' : passwordsMatch ? '#22c55e' : undefined}
                onChange={v => { setConfirmPassword(v); setSuccess(false); setProtectedUrl(null); }} />

              {passwordMismatch && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '-0.6rem' }}>Passwords do not match</span>}
              {passwordsMatch && <span style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '-0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CheckCircle2 size={12} /> Passwords match</span>}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(208,167,0,0.08)', border: '1px solid rgba(208,167,0,0.2)' }}>
                <Lock size={14} color="var(--accent)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>128-bit RC4 Encryption</span>
              </div>

              {error && <StatusBanner type="error" message={error} />}
              {success && <StatusBanner type="success" message="PDF protected successfully!" />}

              <button className="btn btn-primary" onClick={protectPdf} disabled={isProcessing || !password || !passwordsMatch} style={{ width: '100%' }}>
                {isProcessing
                  ? <><span className="spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> Encrypting…</>
                  : <><Lock size={16} /> Protect Document</>}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '1rem', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {pdfBytes ? <PdfPreviewer pdfBytes={pdfBytes} /> : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: '1rem' }}>
              <Lock size={48} opacity={0.2} /><p>Select a PDF to preview and protect</p>
            </div>
          )}
          {protectedUrl && (
            <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <button className="btn btn-primary" onClick={() => { const a = document.createElement('a'); a.href = protectedUrl!; a.download = protectedName; a.click(); }} style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <Download size={18} /> Download Protected PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
