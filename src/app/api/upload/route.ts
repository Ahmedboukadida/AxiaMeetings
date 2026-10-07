import { NextRequest, NextResponse } from 'next/server';
import { assertUploadSize, maxUploadBytes, saveUpload, UploadError } from '@/lib/storage';
import {
    assertMeetingAccess,
    getInviteeActor,
    getStaffActor,
    HttpError,
    httpErrorResponse,
    readInviteeCredentials,
    toPositiveInt,
} from '@/lib/authz';

/** Room for the multipart envelope (boundaries, headers, other fields). */
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * POST /api/upload  (multipart: `file`, optional `meetingId`)
 *
 * Who may upload (C7):
 * - ADMIN / DEVELOPER session: always (meeting creation forms upload before the meeting exists).
 * - PARTICIPANT-role session: only with a `meetingId` he can read.
 * - Invitee: `meetingId` + token/email (`x-participant-token` / `x-participant-email`
 *   headers or `token`/`email` query) with an ACCEPTED invitation.
 * Non-managers must send `meetingId` as a query param (checked before the body is read).
 * A Content-Length header is required (411 otherwise) so the size cap holds before buffering.
 *
 * Size (N42): `UPLOAD_MAX_BYTES` (default 25 MB) -> 413. 401 without credentials, 403 otherwise.
 */
export async function POST(req: NextRequest) {
    try {
        const max = maxUploadBytes();
        const rawLength = req.headers.get('content-length');
        const declared = rawLength === null ? NaN : Number(rawLength);
        // Browsers always send Content-Length for FormData; refuse chunked bodies so the cap holds.
        if (!Number.isFinite(declared) || declared <= 0) {
            throw new UploadError('Content-Length required', 411);
        }
        if (declared > max + MULTIPART_OVERHEAD) {
            throw new UploadError(`File too large (max ${Math.round(max / (1024 * 1024))} MB)`, 413);
        }

        const staff = await getStaffActor(req);
        const creds = readInviteeCredentials(req);
        const queryMeetingId = toPositiveInt(new URL(req.url).searchParams.get('meetingId'));

        // Nobody identifiable: refuse before reading the body.
        if (!staff && !(creds.token && creds.email)) throw new HttpError(401, 'Unauthorized');

        const isManager = staff && (staff.role === 'ADMIN' || staff.role === 'DEVELOPER');

        // Invitees / participant users must send ?meetingId=, checked before the body is read.
        if (!isManager) {
            if (!queryMeetingId) throw new HttpError(400, 'meetingId query parameter is required');
            if (!(await canUploadToMeeting(staff, queryMeetingId, creds))) throw new HttpError(403, 'Forbidden');
        }

        const formData = await req.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
            return NextResponse.json({ status: false, message: 'No file uploaded' }, { status: 400 });
        }

        assertUploadSize(file.size); // before buffering it in memory
        const buffer = Buffer.from(await file.arrayBuffer());
        const { url } = await saveUpload('meetings', file.name, buffer);

        return NextResponse.json({
            status: true,
            message: 'Uploaded',
            data: {
                file_path: url,
                file_title: file.name
            }
        });
    } catch (error) {
        if (error instanceof UploadError) {
            return NextResponse.json({ status: false, message: error.message }, { status: error.status });
        }
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        console.error('Upload error:', error);
        return NextResponse.json({ status: false, message: 'Upload failed' }, { status: 500 });
    }
}

/** True when the caller (participant-role user or accepted invitee) may add files to this meeting. */
async function canUploadToMeeting(
    staff: Awaited<ReturnType<typeof getStaffActor>>,
    meetingId: number,
    creds: { token: string | null; email: string | null },
): Promise<boolean> {
    if (staff) {
        try {
            await assertMeetingAccess(staff, meetingId, 'read');
            return true;
        } catch (err) {
            if (err instanceof HttpError && (err.status === 403 || err.status === 404)) return false;
            throw err;
        }
    }
    const invitee = await getInviteeActor(meetingId, creds.token, creds.email);
    if (!invitee) throw new HttpError(401, 'Unauthorized');
    if (!invitee.accepted) throw new HttpError(403, 'You must accept the invitation first', { requireAcceptance: true });
    return true;
}
