import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './FileUploader.css';

interface Props {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
}

// Every format a PDF tool can accept: normalizeToPdf() converts any of these to
// PDF bytes on intake, so this list is the single place that has to stay in sync
// with it. Used both by the dropzone below and by every page's hidden file input.
export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt', '.log'],
  'text/html': ['.html', '.htm'],
  'text/rtf': ['.rtf'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md', '.markdown'],
  'application/json': ['.json'],
};

export const ACCEPTED_FILE_EXT = Object.values(ACCEPTED_FILE_TYPES).flat().join(',');

export default function FileUploader({ onFilesSelected, multiple = false }: Props) {
  const { t } = useTranslation();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesSelected,
    accept: ACCEPTED_FILE_TYPES,
    multiple,
  });

  return (
    <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
      <input {...getInputProps()} />
      <div className="dropzone-icon">
        <UploadCloud size={64} />
      </div>
      <h2>{isDragActive ? t('common.dropzoneTitle') : t('common.selectNew')}</h2>
      <p>{t('common.dropzoneSubtitle')}</p>
      <div className="dropzone-badges">
        <div className="dropzone-badge"><FileText size={16} /> {t('common.secure')}</div>
        <div className="dropzone-badge"><FileText size={16} /> {t('common.privacyFirst')}</div>
      </div>
    </div>
  );
}
