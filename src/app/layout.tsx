import type { Metadata } from "next";
import localFont from "next/font/local";
import "@/app/globals.css";
import { cn } from "@/lib/utils";
import { AuthUser } from "@/components/context/AuthContext";
import { Toaster } from "sonner";
import { CornerControls } from "@/components/ui/CornerControls";

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

// Local Font Configurations
const alyamama = localFont({
    src: "../../public/fonts/Alyamama/Alyamama-VariableFont_wght.ttf",
    variable: "--font-alyamama",
    display: "swap",
});

const elmsSans = localFont({
    src: "../../public/fonts/Elms_Sans/ElmsSans-VariableFont_wght.ttf",
    variable: "--font-elms-sans",
    display: "swap",
});

export async function generateMetadata() {
    const t = await getTranslations("Metadata");
    return {
        title: t("title"),
        description: t("description"),
        icons: {
            icon: "/AxiaMeetings.svg",
            shortcut: "/AxiaMeetings.svg",
            apple: "/AxiaMeetings.svg",
        },
    };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();
    const messages = await getMessages();
    const isRtl = locale === "ar";

    return (
        <html lang={locale} dir={isRtl ? "rtl" : "ltr"} className={cn(isRtl ? alyamama.variable : elmsSans.variable)} suppressHydrationWarning>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body className={cn("min-h-screen bg-background antialiased", isRtl ? alyamama.className : elmsSans.className)}>
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <AuthUser>
                        <div className="min-h-screen">{children}</div>
                        <CornerControls />
                        <Toaster richColors position="top-right" />
                    </AuthUser>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
