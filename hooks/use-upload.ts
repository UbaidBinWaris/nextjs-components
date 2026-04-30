'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createFileFingerprint,
  createResumeKey,
  createResumeKeyFromFile,
  validateSelectedFile,
} from '@/lib/uploads/client';
import type {
  UploadAbortResponse,
  UploadApiResponse,
  UploadChunkResponse,
  UploadCompletionSummary,
  UploadFileMetadata,
  UploadInitResponse,
  UploadListResponse,
  UploadListSuccessResponse,
  UploadSessionSummary,
} from '@/types/upload';

const MAX_PARALLEL_CHUNKS = 4;

export type UploadItemStatus = 'queued' | 'uploading' | 'completed' | 'error';

export interface UploadItem {
  id: string;
  resumeKey: string;
  name: string;
  size: number;
  type: string;
  file?: File;
  fingerprint?: string;
  progress: number;
  status: UploadItemStatus;
  uploadId?: string;
  error?: string;
  metadata?: UploadFileMetadata;
  uploadedChunkIndexes: number[];
  totalChunks?: number;
  chunkSizeBytes?: number;
}

interface UseUploadOptions {
  endpoint: string;
  accessToken?: string;
  maxFileSize?: number;
  allowedTypes?: string[];
  multiple?: boolean;
  onUploadComplete?: (summary: UploadCompletionSummary) => void;
}

interface UseUploadResult {
  items: UploadItem[];
  activeItems: UploadItem[];
  completedItems: UploadItem[];
  uploadFiles: (incomingFiles: FileList | File[]) => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
}

function createUploadItemId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createItemFromFile(file: File): UploadItem {
  return {
    id: createUploadItemId(),
    resumeKey: createResumeKeyFromFile(file),
    name: file.name,
    size: file.size,
    type: file.type,
    file,
    fingerprint: createFileFingerprint(file),
    progress: 0,
    status: 'queued',
    uploadedChunkIndexes: [],
  };
}

function createItemFromSession(session: UploadSessionSummary): UploadItem {
  return {
    id: session.uploadId,
    resumeKey: createResumeKey(session.originalName, session.size, session.type),
    name: session.originalName,
    size: session.size,
    type: session.type,
    progress: session.size > 0 ? Math.min(99, Math.round((session.receivedBytes / session.size) * 100)) : 0,
    status: 'queued',
    uploadId: session.uploadId,
    error: 'Select the same file again to resume this upload.',
    uploadedChunkIndexes: session.uploadedChunkIndexes,
    totalChunks: session.totalChunks,
    chunkSizeBytes: session.chunkSizeBytes,
  };
}

function createItemFromMetadata(metadata: UploadFileMetadata): UploadItem {
  return {
    id: metadata.id,
    resumeKey: createResumeKey(metadata.originalName, metadata.size, metadata.type),
    name: metadata.originalName,
    size: metadata.size,
    type: metadata.type,
    progress: 100,
    status: 'completed',
    metadata,
    uploadedChunkIndexes: [],
  };
}

async function initializeUploadSession(
  endpoint: string,
  file: File,
  accessToken?: string,
): Promise<{ uploadId: string; chunkSizeBytes: number; totalChunks: number }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
    headers['x-upload-access-token'] = accessToken;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: file.name,
      size: file.size,
      type: file.type,
    }),
  });

  const payload = (await response.json()) as UploadInitResponse;
  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? 'Failed to initialize upload.' : payload.error.message);
  }

  return payload;
}

async function fetchUploadState(endpoint: string, accessToken?: string): Promise<UploadListSuccessResponse> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
    headers['x-upload-access-token'] = accessToken;
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers,
  });
  const payload = (await response.json()) as UploadListResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? 'Failed to load upload state.' : payload.error.message);
  }

  return payload;
}

function uploadChunkRequest(options: {
  endpoint: string;
  uploadId: string;
  accessToken?: string;
  chunk: Blob;
  chunkIndex: number;
  itemId: string;
  requestsRef: { current: Map<string, XMLHttpRequest> };
  onProgress: (loaded: number) => void;
}): Promise<UploadChunkResponse & { success: true }> {
  const { endpoint, uploadId, accessToken, chunk, chunkIndex, itemId, requestsRef, onProgress } = options;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    requestsRef.current.set(`${itemId}:${chunkIndex}`, request);

    request.open('PATCH', endpoint);
    request.responseType = 'json';
    request.setRequestHeader('content-type', 'application/octet-stream');
    request.setRequestHeader('x-upload-id', uploadId);
    request.setRequestHeader('x-chunk-index', String(chunkIndex));
    if (accessToken) {
      request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      request.setRequestHeader('x-upload-access-token', accessToken);
    }

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress(event.loaded);
    });

    request.addEventListener('load', () => {
      requestsRef.current.delete(`${itemId}:${chunkIndex}`);
      const response = (request.response ?? null) as UploadChunkResponse | null;

      if (request.status >= 200 && request.status < 300 && response?.success) {
        resolve(response);
        return;
      }

      const message =
        response && !response.success ? response.error.message : 'Failed to upload file chunk.';
      reject(new Error(message));
    });

    request.addEventListener('error', () => {
      requestsRef.current.delete(`${itemId}:${chunkIndex}`);
      reject(new Error('Network error while uploading file chunk.'));
    });

    request.addEventListener('abort', () => {
      requestsRef.current.delete(`${itemId}:${chunkIndex}`);
      reject(new Error('Upload aborted.'));
    });

    request.send(chunk);
  });
}

async function finalizeUpload(endpoint: string, uploadId: string, accessToken?: string): Promise<UploadFileMetadata> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
    headers['x-upload-access-token'] = accessToken;
  }

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ uploadId }),
  });
  const payload = (await response.json()) as UploadApiResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? 'Failed to finalize upload.' : payload.error.message);
  }

  return payload.files[0];
}

async function abortUploadOnServer(endpoint: string, uploadId?: string, accessToken?: string): Promise<void> {
  if (!uploadId) {
    return;
  }

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
    headers['x-upload-access-token'] = accessToken;
  }

  try {
    const response = await fetch(`${endpoint}?uploadId=${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
      headers,
    });
    const payload = (await response.json()) as UploadAbortResponse;
    if (!response.ok || !payload.success) {
      return;
    }
  } catch {
    return;
  }
}

function getChunkSizeForIndex(fileSize: number, chunkSizeBytes: number, chunkIndex: number): number {
  const chunkStart = chunkIndex * chunkSizeBytes;
  const chunkEnd = Math.min(fileSize, chunkStart + chunkSizeBytes);
  return Math.max(0, chunkEnd - chunkStart);
}

function sumCompletedBytes(fileSize: number, chunkSizeBytes: number, uploadedChunkIndexes: number[]): number {
  return uploadedChunkIndexes.reduce(
    (total, chunkIndex) => total + getChunkSizeForIndex(fileSize, chunkSizeBytes, chunkIndex),
    0,
  );
}

function mergeRestoredItems(current: UploadItem[], restored: UploadItem[]): UploadItem[] {
  const byKey = new Map<string, UploadItem>();

  current.forEach((item) => {
    byKey.set(item.uploadId ?? item.id, item);
  });

  restored.forEach((item) => {
    const key = item.uploadId ?? item.id;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...item, file: existing.file, fingerprint: existing.fingerprint } : item);
  });

  return Array.from(byKey.values());
}

function uploadFileRequest(options: {
  endpoint: string;
  accessToken?: string;
  item: UploadItem;
  requestsRef: { current: Map<string, XMLHttpRequest> };
  setItemState: (id: string, patch: Partial<UploadItem>) => void;
}): Promise<UploadFileMetadata> {
  const { endpoint, accessToken, item, requestsRef, setItemState } = options;

  return (async () => {
    if (!item.file) {
      throw new Error('Select the same file again to resume this upload.');
    }

    const file = item.file;

    let uploadId = item.uploadId;
    let chunkSizeBytes = item.chunkSizeBytes;
    let totalChunks = item.totalChunks;
    let uploadedChunkIndexes = [...item.uploadedChunkIndexes];

    if (!uploadId || !chunkSizeBytes || !totalChunks) {
      const init = await initializeUploadSession(endpoint, file, accessToken);
      uploadId = init.uploadId;
      chunkSizeBytes = init.chunkSizeBytes;
      totalChunks = init.totalChunks;
      uploadedChunkIndexes = [];
    }

    const uploadedSet = new Set(uploadedChunkIndexes);
    let committedBytes = sumCompletedBytes(file.size, chunkSizeBytes, uploadedChunkIndexes);
    const inflightProgress = new Map<number, number>();

    const reportProgress = () => {
      const inflightBytes = Array.from(inflightProgress.values()).reduce((total, value) => total + value, 0);
      const progress = file.size > 0
        ? Math.min(99, Math.round(((committedBytes + inflightBytes) / file.size) * 100))
        : 0;

      setItemState(item.id, {
        status: 'uploading',
        progress,
        uploadId,
        uploadedChunkIndexes: Array.from(uploadedSet).sort((left, right) => left - right),
        totalChunks,
        chunkSizeBytes,
        error: undefined,
      });
    };

    reportProgress();

    const pendingChunkIndexes = Array.from({ length: totalChunks }, (_, chunkIndex) => chunkIndex).filter(
      (chunkIndex) => !uploadedSet.has(chunkIndex),
    );

    let nextChunkPointer = 0;
    const workerCount = Math.min(MAX_PARALLEL_CHUNKS, Math.max(1, pendingChunkIndexes.length));

    const worker = async () => {
      while (nextChunkPointer < pendingChunkIndexes.length) {
        const chunkIndex = pendingChunkIndexes[nextChunkPointer];
        nextChunkPointer += 1;

        const chunkStart = chunkIndex * chunkSizeBytes;
        const chunkEnd = Math.min(file.size, chunkStart + chunkSizeBytes);
        const chunk = file.slice(chunkStart, chunkEnd);

        inflightProgress.set(chunkIndex, 0);
        reportProgress();

        const response = await uploadChunkRequest({
          endpoint,
          uploadId,
          accessToken,
          chunk,
          chunkIndex,
          itemId: item.id,
          requestsRef,
          onProgress: (loaded) => {
            inflightProgress.set(chunkIndex, loaded);
            reportProgress();
          },
        });

        inflightProgress.delete(chunkIndex);
        committedBytes += chunk.size;
        response.uploadedChunkIndexes.forEach((value) => uploadedSet.add(value));
        reportProgress();
      }
    };

    try {
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      const metadata = await finalizeUpload(endpoint, uploadId, accessToken);
      setItemState(item.id, {
        status: 'completed',
        progress: 100,
        metadata,
        error: undefined,
        uploadId,
        uploadedChunkIndexes: [],
      });
      return metadata;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed unexpectedly.';
      setItemState(item.id, {
        status: 'error',
        error: message,
        uploadId,
        uploadedChunkIndexes: Array.from(uploadedSet).sort((left, right) => left - right),
        totalChunks,
        chunkSizeBytes,
      });
      throw new Error(message);
    }
  })();
}

export function useUpload({
  endpoint,
  accessToken,
  maxFileSize,
  allowedTypes,
  multiple = true,
  onUploadComplete,
}: UseUploadOptions): UseUploadResult {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const requestsRef = useRef<Map<string, XMLHttpRequest>>(new Map());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const state = await fetchUploadState(endpoint, accessToken);
        if (cancelled) {
          return;
        }

        const restoredItems = [
          ...state.files.map((file) => createItemFromMetadata(file)),
          ...state.activeUploads.map((session) => createItemFromSession(session)),
        ];

        setItems((current) => mergeRestoredItems(current, restoredItems));
      } catch {
        return;
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [accessToken, endpoint]);

  const updateItem = useCallback((id: string, updater: (item: UploadItem) => UploadItem) => {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  const setItemState = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      updateItem(id, (current) => ({ ...current, ...patch }));
    },
    [updateItem],
  );

  const uploadSingleFile = useCallback(
    (item: UploadItem): Promise<UploadFileMetadata> =>
      uploadFileRequest({ endpoint, accessToken, item, requestsRef, setItemState }),
    [accessToken, endpoint, setItemState],
  );

  const uploadFiles = useCallback(
    async (incomingFiles: FileList | File[]) => {
      const nextFiles = Array.from(incomingFiles);
      const normalizedFiles = multiple ? nextFiles : nextFiles.slice(0, 1);
      const existingFingerprints = new Set(
        itemsRef.current
          .map((item) => item.fingerprint)
          .filter((value): value is string => typeof value === 'string'),
      );
      const validItems: UploadItem[] = [];
      const rejectedItems: UploadItem[] = [];
      const replacedItemIds = new Set<string>();

      normalizedFiles.forEach((file) => {
        const resumeKey = createResumeKeyFromFile(file);
        const recoverableItem = itemsRef.current.find(
          (item) => item.resumeKey === resumeKey && item.status !== 'completed' && !item.file,
        );

        if (recoverableItem) {
          validItems.push({
            ...recoverableItem,
            file,
            fingerprint: createFileFingerprint(file),
            error: undefined,
          });
          replacedItemIds.add(recoverableItem.id);
          return;
        }

        const fingerprint = createFileFingerprint(file);
        const duplicateMessage = existingFingerprints.has(fingerprint)
          ? 'This file has already been added.'
          : null;
        const validationMessage = duplicateMessage ?? validateSelectedFile(file, maxFileSize, allowedTypes);
        const item = createItemFromFile(file);

        if (validationMessage) {
          rejectedItems.push({ ...item, status: 'error', error: validationMessage });
          return;
        }

        existingFingerprints.add(fingerprint);
        validItems.push(item);
      });

      if (validItems.length === 0 && rejectedItems.length === 0) {
        return;
      }

      setItems((current) => {
        const baseItems = (multiple ? current : current.filter((item) => item.status === 'completed'))
          .filter((item) => !replacedItemIds.has(item.id));
        return [...baseItems, ...rejectedItems, ...validItems];
      });

      if (validItems.length === 0) {
        if (rejectedItems.length > 0) {
          onUploadComplete?.({
            successful: [],
            failed: rejectedItems.map((item) => ({
              id: item.id,
              fileName: item.name,
              message: item.error ?? 'Upload rejected.',
            })),
          });
        }
        return;
      }

      const settled = await Promise.allSettled(validItems.map((item) => uploadSingleFile(item)));
      const successful = settled
        .filter((result): result is PromiseFulfilledResult<UploadFileMetadata> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failed = settled
        .map((result, index) => ({ result, item: validItems[index] }))
        .filter(
          (
            entry,
          ): entry is {
            result: PromiseRejectedResult;
            item: UploadItem;
          } => entry.result.status === 'rejected',
        )
        .map(({ result, item }) => ({
          id: item.id,
          fileName: item.name,
          message: result.reason instanceof Error ? result.reason.message : 'Upload failed.',
        }));

      onUploadComplete?.({ successful, failed });
    },
    [allowedTypes, maxFileSize, multiple, onUploadComplete, uploadSingleFile],
  );

  const removeItem = useCallback((id: string) => {
    const uploadItem = itemsRef.current.find((item) => item.id === id);

    requestsRef.current.forEach((request, requestKey) => {
      if (requestKey.startsWith(`${id}:`)) {
        request.abort();
        requestsRef.current.delete(requestKey);
      }
    });

    if (uploadItem?.status !== 'completed') {
      void abortUploadOnServer(endpoint, uploadItem?.uploadId, accessToken);
    }

    setItems((current) => current.filter((item) => item.id !== id));
  }, [accessToken, endpoint]);

  const clearAll = useCallback(() => {
    requestsRef.current.forEach((request) => request.abort());
    itemsRef.current.forEach((item) => {
      if (item.status !== 'completed') {
        void abortUploadOnServer(endpoint, item.uploadId, accessToken);
      }
    });
    requestsRef.current.clear();
    setItems((current) => current.filter((item) => item.status === 'completed'));
  }, [accessToken, endpoint]);

  useEffect(() => {
    const activeRequests = requestsRef.current;

    return () => {
      activeRequests.forEach((request) => request.abort());
      activeRequests.clear();
    };
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'error'),
    [items],
  );
  const completedItems = useMemo(
    () => items.filter((item) => item.status === 'completed'),
    [items],
  );

  return {
    items,
    activeItems,
    completedItems,
    uploadFiles,
    removeItem,
    clearAll,
  };
}
