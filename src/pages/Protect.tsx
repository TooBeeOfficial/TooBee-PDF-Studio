import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
import { ACCEPTED_FILE_EXT } from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import PasswordInput from '../components/PasswordInput';
import StatusBanner from '../components/StatusBanner';
import { Download, Lock, FileUp, CheckCircle2 } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';

// Strength is reported with a word as well as a color and a bar width, so the
// meaning never rests on color alone.
function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  if (!pw) return { label: '', color: 'transparent', width: '0%' };
  if (pw.length < 6) return { label: 'Weak', color: 'var(--danger)', width: '25%' };
  const score = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (pw.length >= 8 && score >= 3) return { label: 'Strong', color: 'var(--ok)', width: '100%' };
  if (pw.length >= 6 && score >= 2) return { label: 'Medium', color: 'var(--amber-text)', width: '60%' };
  return { label: 'Weak', color: 'var(--danger)', width: '30%' };
}

export default function Protect() {
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: pdfBytes } = doc;
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

    // Adding a file while one is open puts its pages on the end of the stack
    // instead of discarding the document being worked on.
    if (pdfBytes && pdfBytes.length && file) {
      try {
        const merged = await appendPdf(pdfBytes, newFiles);
        noteNextChange('Added pages');
        setDocument(new File([merged], file.name, { type: 'application/pdf' }), merged);
        return;
      } catch (err) {
        console.error('Could not append to the open document', err);
      }
    }

    let f: File;
    try {
      f = await toPdfFile(newFiles[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unsupported file type.');
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    setDocument(f, bytes);
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
      // Deliberately NOT chained into the shared document: it's now encrypted,
      // so other tools couldn't read it without a password. It stays a
      // separate download; use Unlock first if you want to keep editing it.
    } catch {
      setError('Could not protect this PDF. It may be damaged, or already encrypted.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in">
      <header className="view-header">
        <h1>Protect</h1>
        {file && (
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={15} /> Add PDF
          </button>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={e => { if (e.target.files?.length) handleFilesSelected(Array.from(e.target.files)); }}
          style={{ display: 'none' }}
          accept={ACCEPTED_FILE_EXT}
          multiple
        />
      </header>

      <div className="workbench">
        <div className="stage">
          {pdfBytes ? (
            <PdfPreviewer pdfBytes={pdfBytes} />
          ) : (
            <EmptyStage
              motif="protect"
              headline={"Add a password"}
              onFilesSelected={handleFilesSelected}
            />
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            {file && (
              <>
                <div className="inspector-group">
                  <div className="t-eyebrow">Document</div>
                  <div className="file-name" title={file.name}>{file.name}</div>
                </div>

                <div className="inspector-group">
                  <div className="t-eyebrow">Password</div>

                  <PasswordInput
                    label="New password"
                    value={password}
                    placeholder="Choose a strong password"
                    onChange={v => { setPassword(v); setSuccess(false); setProtectedUrl(null); }}
                  />

                  {password && (
                    <div className="strength">
                      <div className="strength-track">
                        <div
                          className="strength-fill"
                          style={{ width: strength.width, background: strength.color }}
                        />
                      </div>
                      <span className="strength-label" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                  )}

                  <PasswordInput
                    label="Confirm password"
                    value={confirmPassword}
                    placeholder="Re-enter the password"
                    borderColor={passwordMismatch ? 'var(--danger)' : passwordsMatch ? 'var(--ok)' : undefined}
                    onChange={v => { setConfirmPassword(v); setSuccess(false); setProtectedUrl(null); }}
                  />

                  {passwordMismatch && (
                    <span className="error-text">The two passwords do not match.</span>
                  )}
                  {passwordsMatch && (
                    <span className="ok-text"><CheckCircle2 size={12} /> Passwords match</span>
                  )}
                </div>

                <div className="note">
                  <Lock size={14} />
                  <span>Encrypted with 128-bit RC4.</span>
                </div>

                {error && <StatusBanner type="error" message={error} />}
                {success && <StatusBanner type="success" message="Protected. Save the file below." />}
              </>
            )}
          </div>

          {file && (
            <div className="inspector-action">
              <button
                className="btn btn-primary btn-block"
                onClick={protectPdf}
                disabled={isProcessing || !password || !passwordsMatch}
              >
                {isProcessing
                  ? <><span className="spinner" /> Protecting…</>
                  : <><Lock size={15} /> Protect</>}
              </button>
              {protectedUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = protectedUrl!; a.download = protectedName; a.click(); }}
                >
                  <Download size={15} /> Save protected PDF
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
