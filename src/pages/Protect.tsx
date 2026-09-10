import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { encryptPDF, saslPrep } from '@pdfsmaller/pdf-encrypt';
import FileUploader from '../components/FileUploader';
import PdfPreviewer from '../components/PdfPreviewer';
import EmptyStage from '../components/EmptyStage';
import PasswordInput from '../components/PasswordInput';
import StatusBanner from '../components/StatusBanner';
import { Download, Lock, CheckCircle2 } from 'lucide-react';
import { useToolStore } from '../store/useToolStore';
import { appendPdf } from '../utils/appendPdf';
import { toPdfFile } from '../utils/fileConverter';
import { useTranslation } from 'react-i18next';
import { useFileDrop } from '../hooks/useFileDrop';

/**
 * ISO 32000-2 truncates an AES-256 password to 127 bytes, and does it silently:
 * two passwords sharing their first 127 bytes open the same file. Cap the field
 * instead, so what is typed is what actually protects the document.
 */
const MAX_PASSWORD_BYTES = 127;

const utf8 = new TextEncoder();

/**
 * Length of what the encryption library will really encode. SASLprep runs NFKC
 * first, which can change the size a lot in either direction — "㍿" is 3 bytes
 * on its own and 12 once normalised to "株式会社" — so counting the raw string
 * would badly undercount.
 */
function passwordByteLength(pw: string): number {
  try {
    return utf8.encode(saslPrep(pw)).length;
  } catch {
    // Prohibited or bidirectional text: saslPrep refuses to normalise it. The
    // encrypt call reports that properly, so here just fall back to raw bytes.
    return utf8.encode(pw).length;
  }
}

/** Grapheme clusters, so trimming never splits an emoji or a combining mark. */
function graphemes(pw: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(pw), g => g.segment);
  }
  return Array.from(pw); // code points — still never splits a surrogate pair
}

/** Longest leading run of `pw` that fits the byte cap. */
function clampPassword(pw: string): string {
  if (passwordByteLength(pw) <= MAX_PASSWORD_BYTES) return pw;
  let out = '';
  for (const g of graphemes(pw)) {
    if (passwordByteLength(out + g) > MAX_PASSWORD_BYTES) break;
    out += g;
  }
  return out;
}

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
  const { dropProps, isDragging } = useFileDrop(files => handleFilesSelected(files));
  const { document: doc, setDocument, noteNextChange } = useToolStore();
  const { file, bytes: pdfBytes } = doc;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [protectedUrl, setProtectedUrl] = useState<string | null>(null);
  const [protectedName, setProtectedName] = useState('protected.pdf');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const strength = getPasswordStrength(password);
  const passwordBytes = passwordByteLength(password);
  const nearLimit = passwordBytes >= MAX_PASSWORD_BYTES * 0.75;
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
    <div className="fade-in" {...dropProps}>
      <header className="view-header">
        <h1>{t('protect.title')}</h1>
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
            <div className="inspector-group">
              <div className="t-eyebrow">{t('protect.eyebrowDocument')}</div>
              {file && <div className="file-name" title={file.name}>{file.name}</div>}
              <FileUploader onFilesSelected={handleFilesSelected} multiple />
            </div>

            {file && (
              <>
                <div className="inspector-group">
                  <div className="t-eyebrow">{t('protect.eyebrowPassword')}</div>

                  <PasswordInput
                    label={t('protect.newPassword')}
                    value={password}
                    placeholder={t('protect.newPasswordPlaceholder')}
                    onChange={v => {
                      const clamped = clampPassword(v);
                      setTruncated(clamped !== v);
                      setPassword(clamped); setSuccess(false); setProtectedUrl(null);
                    }}
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

                  {nearLimit && (
                    <span className="hint">
                      {t('protect.pwBytes', { used: passwordBytes, max: MAX_PASSWORD_BYTES })}
                    </span>
                  )}
                  {truncated && (
                    <span className="error-text">
                      {t('protect.pwTruncated', { max: MAX_PASSWORD_BYTES })}
                    </span>
                  )}

                  <PasswordInput
                    label={t('protect.confirmPassword')}
                    value={confirmPassword}
                    placeholder={t('protect.confirmPasswordPlaceholder')}
                    borderColor={passwordMismatch ? 'var(--danger)' : passwordsMatch ? 'var(--ok)' : undefined}
                    onChange={v => {
                      const clamped = clampPassword(v);
                      setTruncated(clamped !== v);
                      setConfirmPassword(clamped); setSuccess(false); setProtectedUrl(null);
                    }}
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
      {isDragging && (
        <div className="drop-veil">
          <span>{t('common.dropToOpen')}</span>
        </div>
      )}
    </div>
  );
}
