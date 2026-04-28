'use client';

import React, { useState, useCallback, useRef } from 'react';
import { LuUpload, LuFile, LuX, LuTrash2 } from 'react-icons/lu';

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
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
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

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-8">
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileSelect}
          multiple
          className="hidden"
        />
        
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
                className="group relative flex items-center p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-200"
              >
                {/* File Preview Thumbnail or Icon */}
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                  {item.preview ? (
                    <img 
                      src={item.preview} 
                      alt={item.file.name} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                    />
                  ) : (
                    <LuFile size={20} className="text-white/40" />
                  )}
                </div>

                {/* File Info */}
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.file.name}</p>
                  <p className="text-xs text-white/40">{(item.file.size / 1024).toFixed(1)} KB</p>
                </div>

                {/* Actions */}
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
    </div>
  );
}