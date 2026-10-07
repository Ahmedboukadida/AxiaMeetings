"use client";
import { fetchPublicData } from '@/lib/public-data';

import { useEffect, useState } from "react";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { PublicFooter } from "@/components/public/PublicFooter";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<any>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPublicData()
            .then(res => {
                if (res.status && res.data?.settings) {
                    setSettings(res.data.settings);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="flex flex-col min-h-screen">
            <div className="no-print">
                <PublicNavbar settings={settings} />
            </div>
            <main className="flex-grow">
                {children}
            </main>
            <div className="no-print">
                <PublicFooter settings={settings} />
            </div>

        </div>
    );
}
