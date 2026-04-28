import Link from 'next/link';
import FileUpload from '@/app/file_upload/file_upload';

export default function Home() {
  return (
    <div>
      <header className="flex justify-end px-6 pt-6">
        <Link
          href="/uploaded-files"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85"
        >
          View uploaded files
        </Link>
      </header>
      <FileUpload />
    </div>
  );
}
