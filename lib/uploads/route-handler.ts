import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getUploadRouteConfig } from '@/lib/uploads/config';
import { JsonUploadMetadataStore } from '@/lib/uploads/metadata-store';
import { LocalDiskUploadStorage } from '@/lib/uploads/storage';
import {
  createUploadId,
  parsePositiveInteger,
  validateIncomingFile,
} from '@/lib/uploads/utils';
import type {
  UploadAbortResponse,
  UploadApiResponse,
  UploadCompleteRequest,
  UploadFailureResponse,
  UploadInitRequest,
  UploadInitResponse,
  UploadListResponse,
  UploadMetadataStore,
  UploadRouteConfig,
  UploadStorageProvider,
  UploadChunkResponse,
} from '@/types/upload';

interface CreateUploadRouteHandlerOptions {
  config?: Partial<UploadRouteConfig>;
  storage?: UploadStorageProvider;
  metadataStore?: UploadMetadataStore;
}

type ErrorResponse = NextResponse<UploadFailureResponse>;

const RATE_LIMIT_WINDOW_MS = 60_000;
const requestCounters = new Map<string, { count: number; windowStartedAt: number }>();

function getClientIdentifier(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',').map((value) => value.trim()).find(Boolean);
    if (first) {
      return first;
    }
  }

  const connectingIp = req.headers.get('cf-connecting-ip');
  if (connectingIp) {
    return connectingIp;
  }

  return 'unknown-client';
}

function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    return true;
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

function enforceRateLimit(req: Request, config: UploadRouteConfig, action: string): UploadFailureResponse | null {
  const now = Date.now();
  const key = `${getClientIdentifier(req)}:${action}`;
  const existing = requestCounters.get(key);

  if (!existing || now - existing.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    requestCounters.set(key, { count: 1, windowStartedAt: now });
    return null;
  }

  if (existing.count >= config.maxRequestsPerMinute) {
    return {
      success: false,
      error: {
        code: 'rate_limit_exceeded',
        message: 'Too many upload requests. Please retry shortly.',
        details: `Limit: ${config.maxRequestsPerMinute} requests per minute.`,
      },
    };
  }

  existing.count += 1;
  requestCounters.set(key, existing);
  return null;
}

function getProvidedAccessToken(req: Request): string | null {
  const authorizationHeader = req.headers.get('authorization');
  if (authorizationHeader?.toLowerCase().startsWith('bearer ')) {
    return authorizationHeader.slice(7).trim();
  }

  const uploadTokenHeader = req.headers.get('x-upload-access-token');
  if (uploadTokenHeader) {
    return uploadTokenHeader.trim();
  }

  return null;
}

function secureTokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function enforceAccessControl(req: Request, config: UploadRouteConfig): UploadFailureResponse | null {
  if (!config.requireAccessToken) {
    return null;
  }

  if (!config.accessToken) {
    return {
      success: false,
      error: {
        code: 'upload_access_control_misconfigured',
        message: 'Upload access control is enabled but no access token is configured.',
      },
    };
  }

  const providedToken = getProvidedAccessToken(req);
  if (!providedToken || !secureTokenEquals(providedToken, config.accessToken)) {
    return {
      success: false,
      error: {
        code: 'unauthorized_upload_request',
        message: 'Valid upload access token is required.',
      },
    };
  }

  return null;
}

function buildFailureResponse(
  payload: UploadFailureResponse,
  status: number,
): NextResponse<UploadFailureResponse> {
  return NextResponse.json(payload, { status });
}

function applyRequestGuards(options: {
  req: Request;
  config: UploadRouteConfig;
  action: string;
  expectedContentType?: string;
  enforceOriginCheck?: boolean;
}): NextResponse<UploadFailureResponse> | null {
  const { req, config, action, expectedContentType, enforceOriginCheck = true } = options;

  const authFailure = enforceAccessControl(req, config);
  if (authFailure) {
    return buildFailureResponse(
      authFailure,
      authFailure.error.code === 'upload_access_control_misconfigured' ? 500 : 401,
    );
  }

  const rateLimitFailure = enforceRateLimit(req, config, action);
  if (rateLimitFailure) {
    return buildFailureResponse(rateLimitFailure, 429);
  }

  if (enforceOriginCheck && config.enforceOriginCheck && !isSameOriginRequest(req)) {
    return errorResponse(403, 'origin_not_allowed', 'Cross-origin upload requests are blocked.');
  }

  if (expectedContentType) {
    const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes(expectedContentType)) {
      return errorResponse(
        415,
        'invalid_content_type',
        `Request requires ${expectedContentType}.`,
      );
    }
  }

  return null;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: string,
  fileName?: string,
): ErrorResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
        fileName,
      },
    },
    { status },
  );
}

export function createUploadRouteHandlers(
  options: CreateUploadRouteHandlerOptions = {},
)
  : {
      POST: (req: Request) => Promise<NextResponse<UploadInitResponse>>;
      PATCH: (req: Request) => Promise<NextResponse<UploadChunkResponse>>;
      PUT: (req: Request) => Promise<NextResponse<UploadApiResponse>>;
      DELETE: (req: Request) => Promise<NextResponse<UploadAbortResponse>>;
      GET: (req: Request) => Promise<NextResponse<UploadListResponse>>;
    } {
  const config = getUploadRouteConfig(options.config);
  const storage = options.storage ?? new LocalDiskUploadStorage(config);
  const metadataStore =
    options.metadataStore ?? new JsonUploadMetadataStore(config.metadataFilePath);

  const post = async (req: Request): Promise<NextResponse<UploadInitResponse>> => {
    try {
      const guardFailure = applyRequestGuards({
        req,
        config,
        action: 'init',
        expectedContentType: 'application/json',
      });
      if (guardFailure) {
        return guardFailure;
      }

      const body = (await req.json()) as UploadInitRequest;

      if (!body?.fileName || typeof body.size !== 'number') {
        return errorResponse(400, 'invalid_init_payload', 'Missing file initialization data.');
      }

      const validationError = validateIncomingFile(
        {
          name: body.fileName,
          size: body.size,
          type: body.type,
        },
        config,
      );

      if (validationError) {
        return errorResponse(
          400,
          validationError.code,
          validationError.message,
          validationError.details,
          validationError.fileName,
        );
      }

      const uploadId = createUploadId();
      await storage.initializeUpload({
        uploadId,
        fileName: body.fileName,
        size: body.size,
        type: body.type,
        chunkSizeBytes: config.chunkSizeBytes,
      });

      return NextResponse.json({
        success: true,
        uploadId,
        chunkSizeBytes: config.chunkSizeBytes,
        totalChunks: Math.max(1, Math.ceil(body.size / config.chunkSizeBytes)),
      });
    } catch (error) {
      return errorResponse(
        500,
        'upload_init_failed',
        'Failed to initialize upload session.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  };

  const patch = async (req: Request): Promise<NextResponse<UploadChunkResponse>> => {
    try {
      const guardFailure = applyRequestGuards({
        req,
        config,
        action: 'chunk',
        expectedContentType: 'application/octet-stream',
      });
      if (guardFailure) {
        return guardFailure;
      }

      const uploadId = req.headers.get('x-upload-id');
      const chunkIndex = parsePositiveInteger(req.headers.get('x-chunk-index'));
      const chunkSize = parsePositiveInteger(req.headers.get('content-length'));

      if (!uploadId || chunkIndex === null || chunkSize === null) {
        return errorResponse(400, 'invalid_chunk_headers', 'Missing chunk upload headers.');
      }

      if (chunkSize <= 0 || chunkSize > config.chunkSizeBytes) {
        return errorResponse(
          413,
          'invalid_chunk_size',
          'Chunk size exceeds the configured limit.',
          `Max chunk size is ${config.chunkSizeBytes} bytes.`,
        );
      }

      if (!req.body) {
        return errorResponse(400, 'empty_chunk', 'Chunk request body is empty.');
      }

      const session = await storage.appendChunk(uploadId, req.body, chunkSize, chunkIndex);

      return NextResponse.json({
        success: true,
        uploadId,
        receivedBytes: session.receivedBytes,
        uploadedChunkIndexes: session.uploadedChunkIndexes,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Upload session expired.') {
        return errorResponse(410, 'upload_session_expired', 'Upload session expired. Start the upload again.');
      }

      return errorResponse(
        500,
        'chunk_upload_failed',
        'Failed to append upload chunk.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  };

  const put = async (req: Request): Promise<NextResponse<UploadApiResponse>> => {
    try {
      const guardFailure = applyRequestGuards({
        req,
        config,
        action: 'finalize',
        expectedContentType: 'application/json',
      });
      if (guardFailure) {
        return guardFailure;
      }

      const body = (await req.json()) as UploadCompleteRequest;

      if (!body?.uploadId) {
        return errorResponse(400, 'invalid_complete_payload', 'Missing upload identifier.');
      }

      const storedFile = await storage.completeUpload(body.uploadId);
      await metadataStore.append([storedFile]);

      return NextResponse.json({
        success: true,
        count: 1,
        files: [storedFile],
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Upload session expired.') {
        return errorResponse(410, 'upload_session_expired', 'Upload session expired. Start the upload again.');
      }

      return errorResponse(
        500,
        'upload_finalize_failed',
        'Failed to finalize uploaded file.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  };

  const del = async (req: Request): Promise<NextResponse<UploadAbortResponse>> => {
    try {
      const guardFailure = applyRequestGuards({
        req,
        config,
        action: 'abort',
      });
      if (guardFailure) {
        return guardFailure;
      }

      const { searchParams } = new URL(req.url);
      const uploadId = searchParams.get('uploadId');

      if (!uploadId) {
        return errorResponse(400, 'missing_upload_id', 'Missing upload identifier.');
      }

      await storage.abortUpload(uploadId);
      return NextResponse.json({ success: true, uploadId });
    } catch (error) {
      return errorResponse(
        500,
        'upload_abort_failed',
        'Failed to abort upload session.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  };

  const get = async (req: Request): Promise<NextResponse<UploadListResponse>> => {
    try {
      const guardFailure = applyRequestGuards({
        req,
        config,
        action: 'list',
        enforceOriginCheck: false,
      });
      if (guardFailure) {
        return guardFailure;
      }

      const [activeUploads, files] = await Promise.all([
        storage.listActiveUploads(),
        metadataStore.list(),
      ]);

      return NextResponse.json({
        success: true,
        chunkSizeBytes: config.chunkSizeBytes,
        activeUploads,
        files,
      });
    } catch (error) {
      return errorResponse(
        500,
        'upload_list_failed',
        'Failed to load upload state.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  };

  return { POST: post, PATCH: patch, PUT: put, DELETE: del, GET: get };
}
