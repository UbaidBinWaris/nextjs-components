'use client';

import React, { useState, useCallback, useRef } from 'react';
import { LuUpload, LuFile, LuX, LuTrash2, LuFileText, LuMusic, LuVideo, LuBox, LuMaximize2 } from 'react-icons/lu';

// Using a wrapper interface is more robust than extending the File object
// because File properties are non-enumerable getters.
interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
}

export default function FileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFiles = useCallback((incomingFiles: FileList | File[]) => {
    const newFiles: UploadedFile[] = Array.from(incomingFiles).map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: (file.type.startsWith('image/') || file.type.startsWith('video/')) 
        ? URL.createObjectURL(file) 
        : undefined,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      const removed = prev.find((f) => f.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return filtered;
    });
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <LuFileText size={20} className="text-red-400" />;
    if (type.includes('audio')) return <LuMusic size={20} className="text-purple-400" />;
    if (type.includes('video')) return <LuVideo size={20} className="text-blue-400" />;
    if (type.includes('zip') || type.includes('archive')) return <LuBox size={20} className="text-yellow-400" />;
    return <LuFile size={20} className="text-white/40" />;
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-8">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileSelect}
        multiple
        className="hidden"
      />

      {/* Drag & Drop Zone */}
      <div
        className={`relative group cursor-pointer transition-all duration-300 ease-in-out
          border-2 border-dashed rounded-2xl p-12 text-center
          ${isDragging 
            ? 'border-blue-500 bg-blue-50/10 scale-[1.02] shadow-lg shadow-blue-500/20' 
            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
          }
          backdrop-blur-xl`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className={`p-4 rounded-full transition-colors duration-300 ${isDragging ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/70 group-hover:bg-white/20'}`}>
            <LuUpload size={32} />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-white">
              {isDragging ? 'Drop your files here' : 'Click or drag files to upload'}
            </h3>
            <p className="text-white/50 text-sm">
              Support for documents, images, and notes. Max 10MB per file.
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white/70 uppercase tracking-wider">
              Selected Files ({files.length})
            </h4>
            <button 
              onClick={() => {
                files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
                setFiles([]);
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
            >
              <LuTrash2 size={12} />
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {files.map((item) => (
              <div 
                key={item.id}
                onClick={() => setPreviewFile(item)}
                className="group relative flex items-center p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer"
              >
                {/* File Thumbnail/Preview */}
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                  {item.file.type.startsWith('image/') && item.preview ? (
                    <img 
                      src={item.preview} 
                      alt={item.file.name} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                    />
                  ) : item.file.type.startsWith('video/') && item.preview ? (
                    <div className="relative w-full h-full">
                      <video 
                        src={item.preview} 
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <LuVideo size={16} className="text-white" />
                      </div>
                    </div>
                  ) : (
                    getFileIcon(item.file.type)
                  )}
                  
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <LuMaximize2 size={16} className="text-white" />
                  </div>
                </div>

                {/* File Info */}
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.file.name}</p>
                  <p className="text-xs text-white/40">{(item.file.size / 1024).toFixed(1)} KB</p>
                </div>

                {/* Remove Button */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(item.id);
                  }}
                  className="p-2 text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                >
                  <LuX size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setPreviewFile(null)}
        >
          <div 
            className="relative w-full max-w-4xl bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                {getFileIcon(previewFile.file.type)}
                <span className="text-white font-medium truncate max-w-xs">{previewFile.file.name}</span>
              </div>
              <button 
                onClick={() => setPreviewFile(null)}
                className="p-2 text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex items-center justify-center bg-black/40 min-h-[300px] max-h-[70vh]">
              {previewFile.file.type.startsWith('image/') ? (
                <img 
                  src={previewFile.preview} 
                  alt={previewFile.file.name} 
                  className="max-w-full max-h-[70vh] object-contain" 
                />
              ) : previewFile.file.type.startsWith('video/') ? (
                <video 
                  src={previewFile.preview} 
                  controls 
                  autoPlay
                  className="max-w-full max-h-[70vh]" 
                />
              ) : previewFile.file.type.startsWith('audio/') ? (
                <div className="flex flex-col items-center p-12 space-y-6">
                  <div className="p-8 rounded-full bg-purple-500/20 text-purple-400">
                    <LuMusic size={64} />
                  </div>
                  <audio src={URL.createObjectURL(previewFile.file)} controls className="w-full max-w-md" />
                </div>
              ) : previewFile.file.type === 'application/pdf' ? (
                <iframe 
                  src={URL.createObjectURL(previewFile.file)} 
                  className="w-full h-[70vh] border-none"
                />
              ) : (
                <div className="flex flex-col items-center p-12 space-y-4">
                  <div className="p-6 rounded-full bg-white/5 text-white/40">
                    <LuFile size={48} />
                  </div>
                  <p className="text-white/60">No preview available for this file type.</p>
                  <button 
                    onClick={() => {
                      const url = URL.createObjectURL(previewFile.file);
                      window.open(url, '_blank');
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}