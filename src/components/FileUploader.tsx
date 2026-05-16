import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './FileUploader.css';

interface Props {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
}

export default function FileUploader({ onFilesSelected, multiple = false }: Props) {
  const { t } = useTranslation();
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesSelected,
    accept: { 
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/plain': ['.txt'],
      'text/html': ['.html', '.htm'],
      'text/rtf': ['.rtf']
    },
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
