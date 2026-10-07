import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { baseSecurityHeaders, buildContentSecurityPolicy } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  // @ts-ignore
  allowedDevOrigins: ['192.168.137.1', '192.168.0.193', '172.20.10.4', '172.0.1.159', 'localhost:3002', 'localhost:3002', '*.exp.direct'],
  // N21: legacy runtime-upload URLs stored in the DB (/uploads/meetings/*, /uploads/pvs/*)
  // and bare branding names (/uploads/<file>) are served by /api/files from UPLOAD_DIR.
  // Plain-array rewrites run after public/ files, so real static assets still win.
  async rewrites() {
    return [
      { source: '/uploads/meetings/:path*', destination: '/api/files/meetings/:path*' },
      { source: '/uploads/pvs/:path*', destination: '/api/files/pvs/:path*' },
      // Old marketing image URLs (moved to public/images)
      { source: '/uploads/:file(boardroom_worker|clouds_bg|clouds_dark|clouds_light|hero_meeting_ui|live_transcription_ui|meeting_summaries_ui|noise_cancellation_ui|testimonial_person).png', destination: '/images/:file.png' },
      { source: '/uploads/:file', destination: '/api/files/:file' },
    ];
  },
  async headers() {
    return [
      { source: '/(.*)', headers: baseSecurityHeaders() },
      // N46: app CSP everywhere except user-file responses, which set their own
      // `Content-Security-Policy: sandbox` in /api/files (/uploads/* rewrites there).
      // Evaluated at build time: NEXT_PUBLIC_LIVEKIT_URL must be set for `next build`.
      {
        source: '/((?!api/files/|uploads/).*)',
        headers: [{ key: 'Content-Security-Policy', value: buildContentSecurityPolicy(process.env) }],
      },
    ];
  }
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);