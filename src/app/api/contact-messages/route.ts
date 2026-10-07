import { NextRequest, NextResponse } from 'next/server';
import { escapeHtml } from '@/lib/html';
import { prisma } from '@/lib/prisma';
import { requireRole, httpErrorResponse, type StaffActor } from '@/lib/authz';
import { createLog } from '@/lib/logger';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';

/** Developer-only route: DB-checked role, no email-based bypass. */
async function requireDeveloper(req: NextRequest): Promise<StaffActor | NextResponse> {
    try {
        return await requireRole(req, 'DEVELOPER');
    } catch (e) {
        const r = httpErrorResponse(e);
        if (r) return r;
        console.error('Authorization check failed:', e);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;

    try {
        const messages = await prisma.contact_messages.findMany({
            orderBy: { created_at: 'desc' },
        });
        return NextResponse.json({ status: true, data: messages });
    } catch (error) {
        console.error('Error fetching contact messages:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;

    try {
        const body = await req.json();
        const { messageId, replyContent } = body;

        if (!messageId || !replyContent) {
            return NextResponse.json({ status: false, message: 'Message ID and reply content are required' }, { status: 400 });
        }

        const msg = await prisma.contact_messages.findUnique({
            where: { id: Number(messageId) },
        });

        if (!msg) {
            return NextResponse.json({ status: false, message: 'Message not found' }, { status: 404 });
        }

        const updatedMessage = await prisma.contact_messages.update({
            where: { id: Number(messageId) },
            data: {
                reply_content: replyContent,
                replied_at: new Date(),
            },
        });

        // Send email reply using the app_settings SMTP configuration
        try {
            const mailer = await getMailTransporter();
            if (mailer) {
                const { transporter, settings } = mailer;
                const emailHtml = getEmailTemplate(`
                    <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;white-space:pre-line;">
                        ${escapeHtml(replyContent)}
                    </p>
                    <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 32px 0;" />
                    <div style="background-color: #f8fafc; border-left: 4px solid #cbd5e1; padding: 16px; margin-top: 24px;">
                        <p style="color: #64748b; font-size: 13px; font-weight: bold; margin: 0 0 8px; text-transform: uppercase;">Votre message original :</p>
                        <p style="color: #475569; font-size: 14px; font-style: italic; margin: 0 0 8px;"><strong>Sujet :</strong> ${escapeHtml(msg.subject)}</p>
                        <p style="color: #475569; font-size: 14px; font-style: italic; margin: 0; white-space: pre-line;">${escapeHtml(msg.message)}</p>
                    </div>
                `, `Réponse à votre message : ${msg.subject}`, settings.from_name || 'Support Axia Meetings');

                await transporter.sendMail({
                    from: `"${settings.from_name}" <${settings.from_email}>`,
                    to: msg.sender_email,
                    subject: `Re: ${msg.subject}`,
                    html: emailHtml,
                });
                console.log(`[Mail] Reply email successfully sent to ${msg.sender_email}`);
            } else {
                console.error('[Mail] Could not get mail transporter for replying');
            }
        } catch (mailError) {
            console.error('[Mail] Failed to send reply email:', mailError);
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Replied to contact message from ${msg.sender_email}`,
            payload: { messageId, replyContent },
        });

        return NextResponse.json({ status: true, data: updatedMessage });
    } catch (error) {
        console.error('Error replying to contact message:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;
    try {
        const body = await req.json().catch(() => ({}));
        const { id, ids } = body;
        
        if (id) {
            await prisma.contact_messages.delete({ where: { id: Number(id) } });
            await createLog({
                userId: user.userId,
                companyId: user.companyId,
                message: `Deleted contact message ID ${id}`,
                payload: { id }
            });
        } else if (ids && Array.isArray(ids)) {
            const numericIds = ids.map(Number);
            await prisma.contact_messages.deleteMany({ where: { id: { in: numericIds } } });
            await createLog({
                userId: user.userId,
                companyId: user.companyId,
                message: `Bulk deleted contact messages: ${numericIds.join(', ')}`,
                payload: { ids: numericIds }
            });
        } else {
            return NextResponse.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }
        return NextResponse.json({ status: true });
    } catch (error) {
        console.error('Error deleting contact messages:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

