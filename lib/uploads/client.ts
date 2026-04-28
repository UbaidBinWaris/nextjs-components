import type { UploadFileMetadata } from '@/types/upload';

function matchesMimeType(type: string, acceptedType: string): boolean {
  if (acceptedType.endsWith('/*')) {
    const prefix = acceptedType.slice(0, acceptedType.indexOf('/'));
    return type.startsWith(`${prefix}/`);
  }

  return type === acceptedType;
}

export function createResumeKey(name: string, size: number, type: string): string {
  return `${name}-${size}-${type}`;
}

export function createFileFingerprint(file: File): string {
  return `${file.name}-${file.size}-${file.type}-${file.lastModified}`;
}

export function createResumeKeyFromFile(file: File): string {
  return createResumeKey(file.name, file.size, file.type);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${Number.parseFloat(value.toFixed(2))} ${units[exponent]}`;
}

export function isAllowedMimeType(type: string, allowedTypes?: string[]): boolean {
  if (!allowedTypes || allowedTypes.length === 0) {
    return true;
  }

  return allowedTypes.some((allowedType) => matchesMimeType(type, allowedType));
}

export function validateSelectedFile(
  file: File,
  maxFileSize?: number,
  allowedTypes?: string[],
): string | null {
  if (file.size === 0) {
    return 'Empty files are not allowed.';
  }

  if (maxFileSize && file.size > maxFileSize) {
    return `File exceeds the ${formatFileSize(maxFileSize)} limit.`;
  }

  if (!isAllowedMimeType(file.type, allowedTypes)) {
    return 'This file type is not allowed.';
  }

  return null;
}

export function getAcceptedTypesLabel(allowedTypes?: string[]): string {
  if (!allowedTypes || allowedTypes.length === 0) {
    return 'All file types';
  }

  return allowedTypes.join(', ');
}

export function mergeUploadResults(
  existing: UploadFileMetadata[],
  next: UploadFileMetadata[],
): UploadFileMetadata[] {
  const byId = new Map(existing.map((item) => [item.id, item]));

  next.forEach((item) => {
    byId.set(item.id, item);
  });

  return Array.from(byId.values());
}
