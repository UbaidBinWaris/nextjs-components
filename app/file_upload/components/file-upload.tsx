'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { getAcceptedTypesLabel } from '@/lib/uploads/client';
import { useUpload } from '@/hooks/use-upload';
import type { UploadCompletionSummary } from '@/types/upload';
import { UploadDropzone } from '@/app/file_upload/components/upload-dropzone';
import { UploadFileList } from '@/app/file_upload/components/upload-file-list';

export interface FileUploadProps {
  readonly endpoint: string;
  readonly accessToken?: string;
  readonly maxFileSize?: number;
  readonly allowedTypes?: string[];
  readonly multiple?: boolean;
  readonly onUploadComplete?: (summary: UploadCompletionSummary) => void;
}

export function FileUpload({
  endpoint,
  accessToken,
  maxFileSize,
  allowedTypes,
  multiple = true,
  onUploadComplete,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { activeItems, completedItems, uploadFiles, removeItem, clearAll } = useUpload({
    endpoint,
    accessToken,
    maxFileSize,
    allowedTypes,
    multiple,
    onUploadComplete,
  });

  const accept = useMemo(() => allowedTypes?.join(','), [allowedTypes]);
  const dropzoneDescription = useMemo(() => {
    const typesLabel = getAcceptedTypesLabel(allowedTypes);
    const sizeLabel = maxFileSize
      ? `${Math.round(maxFileSize / (1024 * 1024))}MB max per file`
      : 'chunked large-file upload';

    return `${typesLabel} · ${sizeLabel} · ${multiple ? 'multiple files supported' : 'single file only'}`;
  }, [allowedTypes, maxFileSize, multiple]);

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      await uploadFiles(event.target.files);
      event.target.value = '';
    },
    [uploadFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsDragging(false);

      if (event.dataTransfer.files.length === 0) {
        return;
      }

      await uploadFiles(event.dataTransfer.files);
    },
    [uploadFiles],
  );

  return (
    <div className="w-full max-w-4xl space-y-8 p-6">
      <input
        ref={inputRef}
        type="file"
        onChange={handleInputChange}
        multiple={multiple}
        accept={accept}
        className="hidden"
      />

      <UploadDropzone
        isDragging={isDragging}
        description={dropzoneDescription}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onSelectClick={openFileDialog}
      />

      {activeItems.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearAll}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Clear active
          </button>
        </div>
      )}

      <UploadFileList
        title="Active Uploads"
        items={activeItems}
        emptyMessage="Drop files above or choose them from your device."
        onRemove={removeItem}
      />

      <UploadFileList
        title="Uploaded Files"
        items={completedItems}
        emptyMessage="Completed uploads will appear here."
      />
    </div>
  );
}
