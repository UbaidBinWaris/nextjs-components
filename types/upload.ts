export interface UploadFileMetadata {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  type: string;
  path: string;
  uploadedAt: string;
}

export interface UploadErrorPayload {
  code: string;
  message: string;
  details?: string;
  fileName?: string;
}

export interface UploadSuccessResponse {
  success: true;
  count: number;
  files: UploadFileMetadata[];
}

export interface UploadInitSuccessResponse {
  success: true;
  uploadId: string;
  chunkSizeBytes: number;
  totalChunks: number;
}

export interface UploadChunkSuccessResponse {
  success: true;
  uploadId: string;
  receivedBytes: number;
  uploadedChunkIndexes: number[];
}

export interface UploadAbortSuccessResponse {
  success: true;
  uploadId: string;
}

export interface UploadFailureResponse {
  success: false;
  error: UploadErrorPayload;
}

export type UploadApiResponse = UploadSuccessResponse | UploadFailureResponse;
export type UploadInitResponse = UploadInitSuccessResponse | UploadFailureResponse;
export type UploadChunkResponse = UploadChunkSuccessResponse | UploadFailureResponse;
export type UploadAbortResponse = UploadAbortSuccessResponse | UploadFailureResponse;

export interface UploadListSuccessResponse {
  success: true;
  chunkSizeBytes: number;
  activeUploads: UploadSessionSummary[];
  files: UploadFileMetadata[];
}

export type UploadListResponse = UploadListSuccessResponse | UploadFailureResponse;

export interface UploadInitRequest {
  fileName: string;
  size: number;
  type: string;
}

export interface UploadCompleteRequest {
  uploadId: string;
}

export interface UploadRouteConfig {
  fieldName: string;
  uploadRootDir: string;
  metadataFilePath: string;
  tempDirectory: string;
  sessionDirectory: string;
  maxFileSizeBytes?: number;
  chunkSizeBytes: number;
  allowedMimeTypes?: string[];
  maxRequestsPerMinute: number;
  sessionTtlSeconds: number;
  enforceOriginCheck: boolean;
  requireAccessToken: boolean;
  accessToken?: string;
}

export interface UploadSessionSummary {
  uploadId: string;
  originalName: string;
  size: number;
  type: string;
  uploadedAt: string;
  receivedBytes: number;
  totalChunks: number;
  uploadedChunkIndexes: number[];
  chunkSizeBytes: number;
}

export interface StoredUploadResult {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  type: string;
  path: string;
  uploadedAt: string;
}

export interface UploadSession {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  type: string;
  uploadedAt: string;
  chunkDirectory: string;
  receivedBytes: number;
  totalChunks: number;
  uploadedChunkIndexes: number[];
  chunkSizeBytes: number;
}

export interface UploadInitInput {
  uploadId: string;
  fileName: string;
  size: number;
  type: string;
  chunkSizeBytes: number;
}

export interface UploadStorageProvider {
  initializeUpload(input: UploadInitInput): Promise<UploadSession>;
  appendChunk(
    uploadId: string,
    chunkStream: ReadableStream<Uint8Array>,
    chunkSize: number,
    chunkIndex: number,
  ): Promise<UploadSession>;
  listActiveUploads(): Promise<UploadSessionSummary[]>;
  completeUpload(uploadId: string): Promise<StoredUploadResult>;
  abortUpload(uploadId: string): Promise<void>;
}

export interface UploadMetadataStore {
  append(entries: UploadFileMetadata[]): Promise<void>;
  list(): Promise<UploadFileMetadata[]>;
}

export interface UploadCompletionSummary {
  successful: UploadFileMetadata[];
  failed: Array<{ id: string; fileName: string; message: string }>;
}
