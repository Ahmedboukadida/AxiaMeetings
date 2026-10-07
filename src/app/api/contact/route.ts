import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sender_name, sender_email, subject, message } = body;

        if (!sender_email || !subject || !message) {
            return NextResponse.json({ status: false, message: 'Email, subject, and message are required' }, { status: 400 });
        }

        const newMessage = await prisma.contact_messages.create({
            data: {
                sender_name: sender_name || null,
                sender_email,
                subject,
                message,
            },
        });

        return NextResponse.json({ status: true, data: newMessage }, { status: 201 });
    } catch (error) {
        console.error('Error submitting contact message:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
