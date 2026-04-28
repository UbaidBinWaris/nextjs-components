import path from 'node:path';
import { stat } from 'node:fs/promises';
import Link from 'next/link';
import { formatFileSize } from '@/lib/uploads/client';
import { getUploadRouteConfig } from '@/lib/uploads/config';
import { JsonUploadMetadataStore } from '@/lib/uploads/metadata-store';
import type { UploadFileMetadata } from '@/types/upload';

export const dynamic = 'force-dynamic';

interface UploadedFilesPageProps {
  searchParams?: Promise<{
    q?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}

interface UploadedFilesData {
  files: UploadFileMetadata[];
  availableTypes: string[];
  hiddenMissingCount: number;
}

interface UploadedFilesFilters {
  query: string;
  type: string;
  from: string;
  to: string;
}

function normalizeFilters(searchParams: Awaited<UploadedFilesPageProps['searchParams']>): UploadedFilesFilters {
  return {
    query: searchParams?.q?.trim() ?? '',
    type: searchParams?.type?.trim() ?? '',
    from: searchParams?.from?.trim() ?? '',
    to: searchParams?.to?.trim() ?? '',
  };
}

function resolveStoredFilePath(filePath: string, uploadRootDir: string): string | null {
  const uploadPrefix = '/uploads/';
  if (!filePath.startsWith(uploadPrefix)) {
    return null;
  }

  const relativePath = filePath.slice(uploadPrefix.length);
  const absolutePath = path.resolve(uploadRootDir, relativePath);
  const normalizedRoot = path.resolve(uploadRootDir);

  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    return null;
  }

  return absolutePath;
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const fileStats = await stat(absolutePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}

function matchesFilters(file: UploadFileMetadata, filters: UploadedFilesFilters): boolean {
  const normalizedQuery = filters.query.toLowerCase();
  const normalizedType = filters.type.toLowerCase();
  const fileUploadedAt = new Date(file.uploadedAt);

  if (
    normalizedQuery &&
    !file.originalName.toLowerCase().includes(normalizedQuery) &&
    !file.storedName.toLowerCase().includes(normalizedQuery)
  ) {
    return false;
  }

  if (normalizedType && file.type.toLowerCase() !== normalizedType) {
    return false;
  }

  if (filters.from) {
    const fromDate = new Date(`${filters.from}T00:00:00.000Z`);
    if (!Number.isNaN(fromDate.getTime()) && fileUploadedAt < fromDate) {
      return false;
    }
  }

  if (filters.to) {
    const toDate = new Date(`${filters.to}T23:59:59.999Z`);
    if (!Number.isNaN(toDate.getTime()) && fileUploadedAt > toDate) {
      return false;
    }
  }

  return true;
}

async function getUploadedFiles(filters: UploadedFilesFilters): Promise<UploadedFilesData> {
  const config = getUploadRouteConfig();
  const metadataStore = new JsonUploadMetadataStore(config.metadataFilePath);
  const files = await metadataStore.list();
  const verifiedFiles = await Promise.all(
    files.map(async (file) => {
      const absolutePath = resolveStoredFilePath(file.path, config.uploadRootDir);
      if (!absolutePath) {
        return null;
      }

      return (await fileExists(absolutePath)) ? file : null;
    }),
  );

  const existingFiles = verifiedFiles.filter((file): file is UploadFileMetadata => file !== null);
  const filteredFiles = existingFiles.filter((file) => matchesFilters(file, filters));

  return {
    files: filteredFiles.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)),
    availableTypes: Array.from(new Set(existingFiles.map((file) => file.type).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    ),
    hiddenMissingCount: files.length - existingFiles.length,
  };
}

function formatUploadedAt(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function UploadedFilesPage({ searchParams }: Readonly<UploadedFilesPageProps>) {
  const filters = normalizeFilters(await searchParams);
  const { files, availableTypes, hiddenMissingCount } = await getUploadedFiles(filters);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Uploads</p>
            <h1 className="text-3xl font-semibold tracking-tight">Uploaded Files</h1>
            <p className="max-w-2xl text-sm text-white/60">
              Browse files already stored in the public upload directory and download them directly.
            </p>
          </div>

          <Link
            href="/file_upload"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Upload more files
          </Link>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/4 p-6">
          <form className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-white/75">Search file name</span>
              <input
                type="search"
                name="q"
                defaultValue={filters.query}
                placeholder="Search by original or stored name"
                className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-white/75">Type</span>
              <select
                name="type"
                defaultValue={filters.type}
                className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                <option value="">All types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-white/75">Uploaded from</span>
              <input
                type="date"
                name="from"
                defaultValue={filters.from}
                className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-white/75">Uploaded to</span>
              <input
                type="date"
                name="to"
                defaultValue={filters.to}
                className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              />
            </label>

            <div className="flex gap-3 lg:justify-end">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-300"
              >
                Filter
              </button>
              <Link
                href="/uploaded-files"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {files.length} file{files.length === 1 ? '' : 's'}
              {filters.query || filters.type || filters.from || filters.to ? ' after filters' : ''}.
            </p>
            {hiddenMissingCount > 0 ? (
              <p>{hiddenMissingCount} stale metadata entr{hiddenMissingCount === 1 ? 'y was' : 'ies were'} hidden because the file no longer exists.</p>
            ) : null}
          </div>
        </section>

        {files.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-white/15 bg-white/3 px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">No uploaded files match the current view</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-white/55">
              Files that finish uploading into the public uploads directory will appear here once they match the active filters.
            </p>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {files.map((file) => (
              <article
                key={file.id}
                className="flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/4 p-6 shadow-lg shadow-black/20"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="truncate text-base font-semibold text-white">{file.originalName}</p>
                    <p className="break-all text-xs text-white/40">{file.path}</p>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <dt className="text-xs uppercase tracking-[0.2em] text-white/35">Size</dt>
                      <dd className="mt-2 font-medium text-white/85">{formatFileSize(file.size)}</dd>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <dt className="text-xs uppercase tracking-[0.2em] text-white/35">Type</dt>
                      <dd className="mt-2 truncate font-medium text-white/85">{file.type || 'Unknown'}</dd>
                    </div>
                  </dl>

                  <p className="text-xs text-white/45">Uploaded {formatUploadedAt(file.uploadedAt)}</p>
                </div>

                <div className="mt-6 flex gap-3">
                  <a
                    href={file.path}
                    download={file.originalName}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-300"
                  >
                    Download
                  </a>
                  <a
                    href={file.path}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    Open
                  </a>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
