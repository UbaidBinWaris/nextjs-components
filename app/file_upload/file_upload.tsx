'use client';

import { FileUpload } from '@/app/file_upload/components/file-upload';

export default function DemoFileUpload() {
  return (
    <FileUpload
      endpoint="/api/file-upload"
      accessToken={process.env.NEXT_PUBLIC_UPLOAD_ACCESS_TOKEN}
      multiple
    />
  );
}