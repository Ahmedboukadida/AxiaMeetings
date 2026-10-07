import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import {
    ACTIVE_CONTENT_EXTENSIONS,
    contentTypeFor,
    extensionOf,
    findUploadFile,
    isValidKey,
} from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/files/<key>
 * Serves runtime uploads from UPLOAD_DIR (fallback: legacy public/uploads).
 * Legacy URLs /uploads/meetings/* and /uploads/pvs/* are rewritten here by next.config.ts.
 *
 * Access control: parity with the previous behaviour, where these files were
 * public static assets reachable by anyone holding the (unguessable) URL. This
 * keeps participant access from the live room and email links working.
 * TODO(Phase 3): require JWT or participant token scoped to the meeting
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path: segments } = await params;
    const parts = Array.isArray(segments) ? segments : [];
    // Segments arrive URL-decoded; an encoded "/" or "\" must not smuggle new segments.
    if (parts.length === 0 || parts.some((s) => s.includes('/'))) {
        return NextResponse.json({ status: false, message: 'Invalid file path' }, { status: 400 });
    }
    const key = parts.join('/');
    if (!isValidKey(key)) {
        return NextResponse.json({ status: false, message: 'Invalid file path' }, { status: 400 });
    }

    const filePath = await findUploadFile(key);
    if (!filePath) {
        return NextResponse.json({ status: false, message: 'File not found' }, { status: 404 });
    }

    const st = await stat(filePath);
    const ext = extensionOf(key);
    const headers = new Headers({
        'Content-Type': contentTypeFor(key),
        'Content-Length': String(st.size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
        'Last-Modified': st.mtime.toUTCString(),
    });
    if (ACTIVE_CONTENT_EXTENSIONS.has(ext)) {
        // Rendered as an opaque origin: no script execution, no access to our cookies/storage.
        headers.set('Content-Security-Policy', 'sandbox');
    }
    if (headers.get('Content-Type') === 'application/octet-stream') {
        headers.set('Content-Disposition', 'attachment');
    }

    const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
    return new NextResponse(stream, { status: 200, headers });
}
