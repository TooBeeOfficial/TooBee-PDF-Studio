import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { ACCEPTED_FILE_TYPES } from './FileUploader';

/**
 * The screen the app spends most of its life showing.
 *
 * Eleven of twelve tools open with no document, so this is the primary state,
 * not a fallback. Two decisions follow from that:
 *
 *  - The whole stage is the drop target. Previously the dropzone lived in the
 *    300px inspector while the largest area on screen showed a grey icon.
 *  - The artwork is a page at true A4 proportion drawn in hairlines, with a
 *    per-tool motif inside it. It is geometry, not an illustration or an icon,
 *    which is the only kind of imagery a document tool should have.
 */

export type StageMotif =
  | 'open' | 'merge' | 'split' | 'rotate' | 'compress'
  | 'extract' | 'protect' | 'unlock' | 'convert' | 'sign' | 'edit';

interface Props {
  motif: StageMotif;
  headline: string;
  /** One sentence saying what to do next, never what is missing. */
  hint?: string;
  /** Omit to render the artwork without drop behaviour (e.g. mid-operation). */
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
}

// A4 is 1:1.414. Drawn at 210×297 user units so the numbers read as millimetres.
const W = 210;
const H = 297;

function Motif({ motif }: { motif: StageMotif }) {
  const line = 'var(--line-strong)';
  const accent = 'var(--amber)';

  switch (motif) {
    case 'merge':
      // Two sheets converging into the one in front.
      return (
        <>
          <rect x={-16} y={-16} width={W} height={H} rx={3} fill="none" stroke={line} strokeWidth={1} opacity={0.35} />
          <rect x={-8} y={-8} width={W} height={H} rx={3} fill="none" stroke={line} strokeWidth={1} opacity={0.6} />
        </>
      );
    case 'split':
      // The cut, on the golden-ish third.
      return (
        <line x1={0} y1={H * 0.42} x2={W} y2={H * 0.42} stroke={accent} strokeWidth={1.5} strokeDasharray="7 6" />
      );
    case 'rotate':
      // A corner arc with the sweep implied.
      return (
        <path
          d={`M ${W - 58} 34 A 24 24 0 0 1 ${W - 34} 58`}
          fill="none" stroke={accent} strokeWidth={1.5} strokeLinecap="round"
        />
      );
    case 'compress':
      // Two edges pressing inward.
      return (
        <>
          <line x1={26} y1={H / 2 - 26} x2={W - 26} y2={H / 2 - 26} stroke={accent} strokeWidth={1.5} />
          <line x1={26} y1={H / 2 + 26} x2={W - 26} y2={H / 2 + 26} stroke={accent} strokeWidth={1.5} />
        </>
      );
    case 'extract':
      // One page lifting clear of the stack.
      return (
        <rect x={W * 0.28} y={H * 0.3} width={W * 0.52} height={H * 0.34} rx={2}
          fill="none" stroke={accent} strokeWidth={1.5} />
      );
    case 'protect':
      return (
        <path
          d={`M ${W / 2 - 15} ${H / 2 - 4} v -10 a 15 15 0 0 1 30 0 v 10`}
          fill="none" stroke={accent} strokeWidth={1.5} strokeLinecap="round"
        />
      );
    case 'unlock':
      // The same shackle, sprung open on one side.
      return (
        <path
          d={`M ${W / 2 - 15} ${H / 2 - 4} v -10 a 15 15 0 0 1 30 0`}
          fill="none" stroke={accent} strokeWidth={1.5} strokeLinecap="round"
        />
      );
    case 'sign':
      // A signature rule near the foot of the page, where one is actually signed.
      return (
        <>
          <line x1={W * 0.18} y1={H * 0.78} x2={W * 0.62} y2={H * 0.78} stroke={line} strokeWidth={1} />
          <path d={`M ${W * 0.2} ${H * 0.775} q 12 -14 22 -2 t 22 -4`}
            fill="none" stroke={accent} strokeWidth={1.5} strokeLinecap="round" />
        </>
      );
    case 'edit':
      // A text block placed on the page, which is what the editor adds.
      return (
        <rect x={W * 0.22} y={H * 0.34} width={W * 0.56} height={H * 0.14} rx={2}
          fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="5 4" />
      );
    case 'convert':
      // The page corner turning into a raster grid.
      return (
        <g stroke={accent} strokeWidth={1.2} opacity={0.9}>
          {[0, 1, 2].map(r => [0, 1, 2].map(c => (
            <rect key={`${r}-${c}`} x={W * 0.32 + c * 22} y={H * 0.42 + r * 22}
              width={16} height={16} fill="none" />
          )))}
        </g>
      );
    default:
      return null;
  }
}

export default function EmptyStage({ motif, headline, hint, onFilesSelected, multiple = false }: Props) {
  const { t } = useTranslation();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesSelected ?? (() => {}),
    accept: ACCEPTED_FILE_TYPES,
    multiple,
    disabled: !onFilesSelected,
  });

  const interactive = Boolean(onFilesSelected);

  return (
    <div
      {...(interactive ? getRootProps() : {})}
      className={`empty-stage ${isDragActive ? 'active' : ''} ${interactive ? 'is-drop' : ''}`}
    >
      {interactive && <input {...getInputProps()} />}

      <svg
        className="empty-page"
        viewBox={`-20 -20 ${W + 40} ${H + 40}`}
        aria-hidden="true"
        focusable="false"
      >
        <rect x={0} y={0} width={W} height={H} rx={3}
          fill="var(--surface-panel)" stroke="var(--line-strong)" strokeWidth={1} />
        <Motif motif={motif} />
      </svg>

      <div className="empty-stage-copy">
        <h2 className="t-headline">{isDragActive ? t('home.emptyOpen') : headline}</h2>
        {interactive
          ? <p>{isDragActive ? ' ' : (hint ?? t('home.emptyOpenSub'))}</p>
          : hint && <p>{hint}</p>}
      </div>
    </div>
  );
}
