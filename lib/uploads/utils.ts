import crypto from 'node:crypto';
import type { UploadErrorPayload, UploadRouteConfig } from '@/types/upload';

const DENIED_FILE_EXTENSIONS = new Set([
  'apk',
  'appimage',
  'bat',
  'bash',
  'cgi',
  'cmd',
  'com',
  'cpl',
  'csh',
  'dll',
  'exe',
  'fish',
  'hta',
  'jar',
  'js',
  'jsx',
  'ksh',
  'lnk',
  'mjs',
  'msi',
  'msix',
  'ps1',
  'psd1',
  'psm1',
  'py',
  'rb',
  'reg',
  'scr',
  'sh',
  'ts',
  'tsx',
  'vb',
  'vbe',
  'vbs',
  'ws',
  'wsf',
  'wsh',
  'zsh',
]);

function matchesMimeType(type: string, acceptedType: string): boolean {
  if (acceptedType.endsWith('/*')) {
    const prefix = acceptedType.slice(0, acceptedType.indexOf('/'));
    return type.startsWith(`${prefix}/`);
  }

  return type === acceptedType;
}

export function sanitizeFileName(name: string): string {
  const baseName = name.split(/[\\/]/).pop() ?? '';
  const normalized = baseName.normalize('NFKC').trim();
  const replaced = normalized.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  const withoutLeadingDots = replaced.replaceAll(/^\.+/, '');
  const collapsed = withoutLeadingDots.replaceAll(/_+/g, '_');
  const shortened = collapsed.slice(0, 180);

  return shortened.length > 0 ? shortened : 'file';
}

export function createUploadId(): string {
  return crypto.randomUUID();
}

export function getDateSegment(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function createStoredFileName(originalName: string, uploadId: string, date: Date = new Date()): string {
  const safeName = sanitizeFileName(originalName);
  const timestamp = date.toISOString().replaceAll(/[:.]/g, '-');

  return `${timestamp}-${uploadId}-${safeName}`;
}

function getLowerCaseFileExtension(name: string): string | null {
  const extension = name.split('.').pop()?.trim().toLowerCase();

  if (!extension || extension === name.trim().toLowerCase()) {
    return null;
  }

  return extension;
}

function isDeniedFileExtension(name: string): boolean {
  const extension = getLowerCaseFileExtension(name);
  return extension ? DENIED_FILE_EXTENSIONS.has(extension) : false;
}

export function validateIncomingFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
  config: UploadRouteConfig,
): UploadErrorPayload | null {
  const sanitizedName = sanitizeFileName(file.name);

  if (!file.name || file.name.trim().length === 0) {
    return {
      code: 'missing_file_name',
      message: 'File name is required.',
    };
  }

  if (sanitizedName.length === 0) {
    return {
      code: 'invalid_file_name',
      message: 'File name is invalid.',
      fileName: file.name,
    };
  }

  if (file.size <= 0) {
    return {
      code: 'empty_file',
      message: 'Empty files are not allowed.',
      fileName: file.name,
    };
  }

  if (isDeniedFileExtension(file.name)) {
    return {
      code: 'blocked_file_extension',
      message: 'Executable and script file formats are not allowed.',
      fileName: file.name,
      details: 'Upload archives, documents, images, audio, video, or other non-executable assets instead.',
    };
  }

  if (config.maxFileSizeBytes && file.size > config.maxFileSizeBytes) {
    return {
      code: 'file_too_large',
      message: `File exceeds the ${config.maxFileSizeBytes} byte limit.`,
      fileName: file.name,
    };
  }

  if (
    config.allowedMimeTypes &&
    config.allowedMimeTypes.length > 0 &&
    !config.allowedMimeTypes.some((acceptedType) => matchesMimeType(file.type, acceptedType))
  ) {
    return {
      code: 'invalid_file_type',
      message: 'File type is not allowed.',
      fileName: file.name,
      details: `Received ${file.type || 'unknown'}.`,
    };
  }

  return null;
}

export function isMimeTypeAllowed(type: string, allowedMimeTypes?: string[]): boolean {
  if (!allowedMimeTypes || allowedMimeTypes.length === 0) {
    return true;
  }

  return allowedMimeTypes.some((acceptedType) => matchesMimeType(type, acceptedType));
}

export function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
