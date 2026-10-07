'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './context/AuthContext';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

export function NotificationBridge() {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!user || !user.email) return;

        // Authenticated by the session cookie; the server joins this socket to the
        // personal room of the logged-in user (no email is sent from here).
        const socket = io(window.location.origin, { withCredentials: true });

        socket.on('connect', () => {
            socket.emit('join-user');
        });

        socket.on('notification:new', (data: { title: string; body: string; meetingId: number; type: string }) => {
            console.log('New internal notification received:', data);
            
            toast(data.title, {
                description: data.body,
                duration: 8000,
                icon: <Bell className="text-blue-500" size={18} />,
                action: {
                    label: 'Rejoindre',
                    onClick: () => router.push(`/meetings/${data.meetingId}`)
                },
            });
        });

        return () => {
            socket.disconnect();
        };
    }, [user, router]);

    return null; // This component doesn't render anything visible
}
