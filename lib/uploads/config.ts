import path from 'node:path';
import type { UploadRouteConfig } from '@/types/upload';

const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 600;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24;

function parseAllowedMimeTypes(): string[] | undefined {
  const raw = process.env.UPLOAD_ALLOWED_MIME_TYPES;
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function parseMaxFileSizeBytes(): number {
  const raw = process.env.UPLOAD_MAX_FILE_SIZE_BYTES;
  if (!raw || raw.trim().length === 0) {
    return Number.NaN;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === '0' || normalized === 'none' || normalized === 'unlimited' || normalized === 'infinity') {
    return Number.NaN;
  }

  const value = Number.parseInt(raw, 10);

  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

function parseChunkSizeBytes(): number {
  const raw = process.env.UPLOAD_CHUNK_SIZE_BYTES;
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CHUNK_SIZE_BYTES;
}

function parseMaxRequestsPerMinute(): number {
  const raw = process.env.UPLOAD_MAX_REQUESTS_PER_MINUTE;
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_REQUESTS_PER_MINUTE;
}

function parseSessionTtlSeconds(): number {
  const raw = process.env.UPLOAD_SESSION_TTL_SECONDS;
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_TTL_SECONDS;
}

function parseEnforceOriginCheck(): boolean {
  const raw = process.env.UPLOAD_ENFORCE_ORIGIN_CHECK;
  if (!raw) {
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
}

function parseRequireAccessToken(): boolean {
  const raw = process.env.UPLOAD_REQUIRE_ACCESS_TOKEN;
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseAccessToken(): string | undefined {
  const raw = process.env.UPLOAD_ACCESS_TOKEN;
  if (!raw) {
    return undefined;
  }

  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

export function getUploadRouteConfig(overrides: Partial<UploadRouteConfig> = {}): UploadRouteConfig {
  const uploadRootDir = overrides.uploadRootDir ?? path.join(process.cwd(), 'public', 'uploads');
  const internalStateRoot = path.join(process.cwd(), '.upload-state');
  const maxFileSizeBytes = overrides.maxFileSizeBytes ?? parseMaxFileSizeBytes();

  return {
    fieldName: overrides.fieldName ?? 'files',
    uploadRootDir,
    metadataFilePath: overrides.metadataFilePath ?? path.join(internalStateRoot, 'meta.json'),
    tempDirectory: overrides.tempDirectory ?? path.join(internalStateRoot, '.tmp'),
    sessionDirectory: overrides.sessionDirectory ?? path.join(internalStateRoot, '.sessions'),
    maxFileSizeBytes: Number.isFinite(maxFileSizeBytes) ? maxFileSizeBytes : undefined,
    chunkSizeBytes: overrides.chunkSizeBytes ?? parseChunkSizeBytes(),
    allowedMimeTypes: overrides.allowedMimeTypes ?? parseAllowedMimeTypes(),
    maxRequestsPerMinute: overrides.maxRequestsPerMinute ?? parseMaxRequestsPerMinute(),
    sessionTtlSeconds: overrides.sessionTtlSeconds ?? parseSessionTtlSeconds(),
    enforceOriginCheck: overrides.enforceOriginCheck ?? parseEnforceOriginCheck(),
    requireAccessToken: overrides.requireAccessToken ?? parseRequireAccessToken(),
    accessToken: overrides.accessToken ?? parseAccessToken(),
  };
}
