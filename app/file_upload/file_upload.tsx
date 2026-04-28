'use client';

import { FileUpload } from '@/app/file_upload/components/file-upload';

export default function DemoFileUpload() {
  return (
    <FileUpload
      endpoint="/api/file-upload"
      multiple
    />
  );
}