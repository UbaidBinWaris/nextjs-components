import { createUploadRouteHandlers } from '@/lib/uploads/route-handler';

export const runtime = 'nodejs';

const handlers = createUploadRouteHandlers();

export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
export const GET = handlers.GET;
