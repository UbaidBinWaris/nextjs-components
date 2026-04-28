'use client';

import { LuUpload } from 'react-icons/lu';

interface UploadDropzoneProps {
  isDragging: boolean;
  description: string;
  onDragOver: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLButtonElement>) => void;
  onSelectClick: () => void;
}

export function UploadDropzone({
  isDragging,
  description,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelectClick,
}: Readonly<UploadDropzoneProps>) {
  return (
    <button
      type="button"
      className={`relative w-full rounded-3xl border-2 border-dashed p-16 text-center transition-all duration-300 ${
        isDragging
          ? 'border-blue-500 bg-blue-500/8 shadow-2xl shadow-blue-500/20'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onSelectClick}
    >
      <div className="flex flex-col items-center gap-6">
        <div className={`rounded-2xl p-6 transition-all ${isDragging ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/70'}`}>
          <LuUpload size={48} />
        </div>

        <div className="space-y-2">
          <h3 className="text-3xl font-bold tracking-tight text-white">
            {isDragging ? 'Drop files to upload' : 'Upload files'}
          </h3>
          <p className="mx-auto max-w-2xl text-sm text-white/50 sm:text-base">{description}</p>
        </div>
      </div>
    </button>
  );
}
