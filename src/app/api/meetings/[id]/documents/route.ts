import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, assertMeetingAccess, httpErrorResponse, toPositiveInt, HttpError } from '@/lib/authz';
import { isSafeDocumentUrl } from '@/lib/safe-url';

function parseMeetingId(id: string): number {
    const meetingId = toPositiveInt(id);
    if (!meetingId) throw new HttpError(400, 'Invalid meeting id');
    return meetingId;
}

// POST add a document link (manage access; file_path must be a storage URL or https)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { id } = await params;
        const meetingId = parseMeetingId(id);
        await assertMeetingAccess(user, meetingId, 'manage');

        const body = await req.json().catch(() => ({}));
        const file_title = typeof body?.file_title === 'string' ? body.file_title.trim() : '';
        const file_path = typeof body?.file_path === 'string' ? body.file_path.trim() : '';
        if (!file_title || !file_path) {
            return NextResponse.json({ status: false, message: 'file_title and file_path are required' }, { status: 400 });
        }
        if (!isSafeDocumentUrl(file_path)) {
            return NextResponse.json(
                { status: false, message: 'file_path must be an uploaded file or an https:// link' },
                { status: 400 },
            );
        }
        const doc = await prisma.meetings_documents.create({
            data: { file_title, file_path, meeting_id: meetingId },
        });
        return NextResponse.json({ status: true, data: doc }, { status: 201 });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// DELETE remove a document (must belong to the meeting in the URL)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { id } = await params;
        const meetingId = parseMeetingId(id);
        await assertMeetingAccess(user, meetingId, 'manage');

        const body = await req.json().catch(() => ({}));
        const documentId = toPositiveInt(body?.document_id);
        if (!documentId) return NextResponse.json({ status: false, message: 'document_id is required' }, { status: 400 });

        const { count } = await prisma.meetings_documents.deleteMany({ where: { id: documentId, meeting_id: meetingId } });
        if (count === 0) {
            return NextResponse.json({ status: false, message: 'Document not found in this meeting' }, { status: 404 });
        }
        return NextResponse.json({ status: true, message: 'Document removed' });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
