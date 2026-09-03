import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import { ACCEPTED_FILE_EXT } from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import PasswordInput from '../components/PasswordInput';
import StatusBanner from '../components/StatusBanner';
import { Download, Lock, FileUp, CheckCircle2 } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';
import { useTranslation } from 'react-i18next';

// The encryption library reports why a password or file was rejected via a
// stable `code`, but its own message text is English only. Map each code to a
// translated string; anything unrecognised falls back to the generic failure.
const ENCRYPT_ERROR_KEYS: Record<string, string> = {
  ALREADY_ENCRYPTED: 'protect.errAlready',
  PROHIBITED_PASSWORD_CHARACTER: 'protect.errPwChar',
  UNSUPPORTED_PASSWORD_CHARACTER: 'protect.errPwChar',
  UNSTABLE_PASSWORD_CHARACTER: 'protect.errPwUnstable',
  BIDIRECTIONAL_PASSWORD: 'protect.errPwBidi',
};

// Strength is reported with a word as well as a color and a bar width, so the
// meaning never rests on color alone.
function getPasswordStrength(pw: string): { labelKey: string; color: string; width: string } {
  if (!pw) return { labelKey: '', color: 'transparent', width: '0%' };
  if (pw.length < 6) return { labelKey: 'protect.strengthWeak', color: 'var(--danger)', width: '25%' };
  const score = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (pw.length >= 8 && score >= 3) return { labelKey: 'protect.strengthStrong', color: 'var(--ok)', width: '100%' };
  if (pw.length >= 6 && score >= 2) return { labelKey: 'protect.strengthMedium', color: 'var(--amber-text)', width: '60%' };
  return { labelKey: 'protect.strengthWeak', color: 'var(--danger)', width: '30%' };
}

export default function Protect() {
  const { t } = useTranslation();
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
      setError(t('protect.errUnsupported'));
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
      const encryptedBytes = await encryptPDF(await pdfDoc.save(), password, {
        algorithm: 'AES-256',
      });
      const url = URL.createObjectURL(new Blob([encryptedBytes], { type: 'application/pdf' }));
      setProtectedUrl(url);
      setProtectedName(`protected_${file!.name}`);
      setSuccess(true);
      // Deliberately NOT chained into the shared document: it's now encrypted,
      // so other tools couldn't read it without a password. It stays a
      // separate download; use Unlock first if you want to keep editing it.
    } catch (e) {
      const code = (e as { code?: string } | null)?.code ?? '';
      setError(t(ENCRYPT_ERROR_KEYS[code] ?? 'protect.errFail'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fade-in">
      <header className="view-header">
        <h1>{t('protect.title')}</h1>
        {file && (
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={15} /> {t('protect.addPdf')}
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
              headline={t('protect.emptyHeadline')}
              onFilesSelected={handleFilesSelected}
            />
          )}
        </div>

        <aside className="inspector">
          <div className="inspector-body">
            {file && (
              <>
                <div className="inspector-group">
                  <div className="t-eyebrow">{t('protect.eyebrowDocument')}</div>
                  <div className="file-name" title={file.name}>{file.name}</div>
                </div>

                <div className="inspector-group">
                  <div className="t-eyebrow">{t('protect.eyebrowPassword')}</div>

                  <PasswordInput
                    label={t('protect.newPassword')}
                    value={password}
                    placeholder={t('protect.newPasswordPlaceholder')}
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
                        {strength.labelKey && t(strength.labelKey)}
                      </span>
                    </div>
                  )}

                  <PasswordInput
                    label={t('protect.confirmPassword')}
                    value={confirmPassword}
                    placeholder={t('protect.confirmPasswordPlaceholder')}
                    borderColor={passwordMismatch ? 'var(--danger)' : passwordsMatch ? 'var(--ok)' : undefined}
                    onChange={v => { setConfirmPassword(v); setSuccess(false); setProtectedUrl(null); }}
                  />

                  {passwordMismatch && (
                    <span className="error-text">{t('protect.mismatch')}</span>
                  )}
                  {passwordsMatch && (
                    <span className="ok-text"><CheckCircle2 size={12} /> {t('protect.match')}</span>
                  )}
                </div>

                <div className="note">
                  <Lock size={14} />
                  <span>{t('protect.note')}</span>
                </div>

                {error && <StatusBanner type="error" message={error} />}
                {success && <StatusBanner type="success" message={t('protect.successMsg')} />}
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
                  ? <><span className="spinner" /> {t('protect.protecting')}</>
                  : <><Lock size={15} /> {t('protect.protectAction')}</>}
              </button>
              {protectedUrl && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => { const a = document.createElement('a'); a.href = protectedUrl!; a.download = protectedName; a.click(); }}
                >
                  <Download size={15} /> {t('protect.saveProtected')}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
