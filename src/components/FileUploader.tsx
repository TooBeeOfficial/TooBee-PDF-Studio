import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText } from 'lucide-react';
import './FileUploader.css';

interface Props {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
}

export default function FileUploader({ onFilesSelected, multiple = false }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesSelected,
    accept: { 'application/pdf': ['.pdf'] },
    multiple,
  });

  return (
    <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
      <input {...getInputProps()} />
      <div className="dropzone-icon">
        <UploadCloud size={64} />
      </div>
      <h2>{isDragActive ? 'Drop your PDF here' : 'Select your PDF File'}</h2>
      <p>Click to browse or drag and drop your file here. Your PDF will never leave your device.</p>
      <div className="dropzone-badges">
        <div className="dropzone-badge"><FileText size={16} /> 100% Secure</div>
        <div className="dropzone-badge"><FileText size={16} /> Privacy-First</div>
      </div>
    </div>
  );
}
