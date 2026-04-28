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
      GET: () => Promise<NextResponse<UploadListResponse>>;
    } {
  const config = getUploadRouteConfig(options.config);
  const storage = options.storage ?? new LocalDiskUploadStorage(config);
  const metadataStore =
    options.metadataStore ?? new JsonUploadMetadataStore(config.metadataFilePath);

  const post = async (req: Request): Promise<NextResponse<UploadInitResponse>> => {
    try {
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
      const uploadId = req.headers.get('x-upload-id');
      const chunkIndex = parsePositiveInteger(req.headers.get('x-chunk-index'));
      const chunkSize = parsePositiveInteger(req.headers.get('content-length'));

      if (!uploadId || chunkIndex === null || chunkSize === null) {
        return errorResponse(400, 'invalid_chunk_headers', 'Missing chunk upload headers.');
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

  const get = async (): Promise<NextResponse<UploadListResponse>> => {
    try {
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
