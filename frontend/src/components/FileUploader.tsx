import { useState } from 'react';
import { Upload, X, File, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

interface UploadedFile {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  size: number;
  duration?: number;
  path: string;
  source: 'upload' | 'generated';
}

interface Props {
  onFilesAdded: (files: UploadedFile[]) => void;
  uploadedFiles?: UploadedFile[];
}

export default function FileUploader({ onFilesAdded, uploadedFiles = [] }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const getFileType = (file: File): 'video' | 'image' | 'audio' | null => {
    const type = file.type;
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('audio/')) return 'audio';
    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    setIsUploading(true);

    try {
      const uploadedFiles: UploadedFile[] = [];

      for (const file of files) {
        const fileType = getFileType(file);
        if (!fileType) {
          toast.error(`Tipo de archivo no soportado: ${file.name}`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await axios.post(
            `${API_URL}/api/upload`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
            }
          );

          uploadedFiles.push({
            id: Math.random().toString(),
            name: file.name,
            type: fileType,
            size: file.size,
            path: response.data.file.path,
            source: 'upload',
            duration: response.data.file.duration, // Include detected duration
          });

          toast.success(`${file.name} subido correctamente`);
        } catch (error) {
          toast.error(`Error al subir ${file.name}`);
          console.error(error);
        }
      }

      if (uploadedFiles.length > 0) {
        onFilesAdded(uploadedFiles);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'video':
        return '🎬';
      case 'image':
        return '🖼️';
      case 'audio':
        return '🎵';
      default:
        return '📄';
    }
  };

  return (
    <div className="space-y-6">
      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition ${
          isDragging
            ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/30'
            : 'border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 hover:border-gray-400 dark:hover:border-zinc-500'
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader className="animate-spin text-accent-500 dark:text-accent-400" size={32} />
            <p className="text-gray-900 dark:text-zinc-100 font-medium">Subiendo archivos...</p>
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-3 text-accent-500 dark:text-accent-400" size={32} />
            <p className="text-gray-900 dark:text-zinc-100 font-medium mb-2">Arrastra archivos aquí</p>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">o haz click para seleccionar</p>

            <input
              type="file"
              multiple
              onChange={handleFileInput}
              accept="video/*,image/*,audio/*"
              className="hidden"
              id="file-input"
              disabled={isUploading}
            />
            <label htmlFor="file-input">
              <button
                onClick={() => document.getElementById('file-input')?.click()}
                className="btn-primary cursor-pointer"
              >
                Seleccionar Archivos
              </button>
            </label>

            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-4">
              Soportados: MP4, WebM, PNG, JPG, MP3, WAV...
            </p>
          </>
        )}
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
          <h3 className="text-gray-900 dark:text-zinc-100 font-medium mb-4">Archivos Subidos ({uploadedFiles.length})</h3>
          <div className="space-y-3">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-2xl">{getFileIcon(file.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-zinc-100 text-sm font-medium truncate">{file.name}</p>
                    <p className="text-gray-500 dark:text-zinc-400 text-xs">
                      {formatFileSize(file.size)} • {file.type}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    // Remove file logic
                  }}
                  className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
