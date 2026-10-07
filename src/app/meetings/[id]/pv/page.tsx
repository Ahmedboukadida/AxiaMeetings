import { Suspense } from 'react';
import PvViewClient from './PvViewClient';

// Public page (no AuthGuard, no dashboard layout): opened from the PV link emailed to participants.
// Access is granted by the signed `t` query parameter, checked by GET /api/meetings/[id]/pv.
export const dynamic = 'force-dynamic';

export default function MeetingPvPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
            <PvViewClient />
        </Suspense>
    );
}
