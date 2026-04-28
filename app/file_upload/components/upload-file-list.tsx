'use client';

import { LuFile, LuFileArchive, LuFileAudio, LuFileImage, LuFileText, LuFileVideo, LuTrash2, LuX } from 'react-icons/lu';
import { formatFileSize } from '@/lib/uploads/client';
import type { UploadItem } from '@/hooks/use-upload';

interface UploadFileListProps {
  title: string;
  items: UploadItem[];
  emptyMessage?: string;
  onRemove?: (id: string) => void;
}

function FileTypeIcon({ type }: Readonly<{ type: string }>) {
  if (type.startsWith('image/')) {
    return <LuFileImage className="h-5 w-5 text-blue-400" />;
  }

  if (type.startsWith('audio/')) {
    return <LuFileAudio className="h-5 w-5 text-purple-400" />;
  }

  if (type.startsWith('video/')) {
    return <LuFileVideo className="h-5 w-5 text-cyan-400" />;
  }

  if (type.includes('pdf') || type.includes('text')) {
    return <LuFileText className="h-5 w-5 text-red-400" />;
  }

  if (type.includes('zip') || type.includes('archive')) {
    return <LuFileArchive className="h-5 w-5 text-yellow-400" />;
  }

  return <LuFile className="h-5 w-5 text-white/50" />;
}

function getStatusAccent(status: UploadItem['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'error':
      return 'bg-red-500';
    case 'uploading':
      return 'bg-blue-500';
    default:
      return 'bg-white/20';
  }
}

export function UploadFileList({ title, items, emptyMessage, onRemove }: Readonly<UploadFileListProps>) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/45">
          {title} ({items.length})
        </h4>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-8 text-sm text-white/40">
          {emptyMessage ?? 'No files yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-lg shadow-black/20"
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  <FileTypeIcon type={item.type} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                  <p className="mt-1 text-xs text-white/35">{formatFileSize(item.size)}</p>
                  {item.metadata ? (
                    <p className="mt-2 truncate text-xs text-emerald-400/80">{item.metadata.path}</p>
                  ) : null}
                  {item.error ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-red-400">
                      <LuX className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.error}</span>
                    </p>
                  ) : null}
                </div>

                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="rounded-lg p-2 text-white/30 transition hover:bg-white/5 hover:text-red-400"
                    aria-label={`Remove ${item.name}`}
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="h-1 w-full bg-white/5">
                <div className={`h-full transition-all duration-200 ${getStatusAccent(item.status)}`} style={{ width: `${item.progress}%` }} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
