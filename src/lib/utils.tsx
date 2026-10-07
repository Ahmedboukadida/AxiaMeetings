import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Build-time marketing images shipped in public/images (moved from public/uploads, N20).
 * Bare names in this set resolve to /images/<name>.
 */
export const STATIC_IMAGE_NAMES = new Set([
  'boardroom_worker.png', 'clouds_bg.png', 'clouds_dark.png', 'clouds_light.png',
  'hero_meeting_ui.png', 'live_transcription_ui.png', 'meeting_summaries_ui.png',
  'noise_cancellation_ui.png', 'testimonial_person.png',
]);

/**
 * Resolve a logo / branding value stored in the DB (companies.logo_url,
 * references.logo_file_name, app_settings.logo_file_name / favicon_file_name)
 * to a browser URL.
 *
 * Rules:
 * - "AxiaMeetings.svg"                -> /AxiaMeetings.svg (bundled default)
 * - http://<hostname>/...             -> https://<hostname>/... (browsers auto-upgrade mixed
 *                                        content images anyway; keeps the proxy out of the path)
 * - http://<ip literal>/...           -> /api/proxy-image?url=... (no TLS cert for bare IPs;
 *                                        the proxy refuses private/internal addresses)
 * - https://, data:                   -> unchanged
 * - /uploads/<static image name>      -> /images/<name> (old marketing image path)
 * - other absolute paths (/api/files/..., /uploads/meetings/..., /images/...) -> unchanged
 *   (legacy /uploads/... is rewritten to /api/files/... by next.config.ts)
 * - external URL without protocol     -> https://...
 * - bare names                        -> localAssetUrl(): /images/<name> for STATIC_IMAGE_NAMES,
 *                                        else /api/files/<name> (UPLOAD_DIR, falls back to
 *                                        legacy public/uploads/<name>)
 */
export function formatLogoUrl(logo: string | null | undefined): string {
  if (!logo) return '';
  const trimmed = logo.trim();
  if (!trimmed) return '';

  if (trimmed === "AxiaMeetings.svg") {
    return "/AxiaMeetings.svg";
  }

  // Explicit HTTP goes through the hardened image proxy (SSRF guard, raster images only).
  if (/^http:\/\//i.test(trimmed)) {
    return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
  }

  // Protocol relative URL (checked before the generic "/" rule)
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // Data URL or https://
  if (/^(data:|https:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  // Absolute local path (/api/files/..., legacy /uploads/..., /images/...)
  if (trimmed.startsWith('/')) {
    return localAssetUrl(trimmed);
  }

  // Check if it's an external URL without protocol
  if (trimmed.startsWith('www.') || (trimmed.includes('.') && trimmed.includes('/') && trimmed.indexOf('/') > trimmed.indexOf('.'))) {
    return `https://${trimmed}`;
  }

  return localAssetUrl(trimmed);
}

/**
 * Map a bare local file name (as stored in the DB, e.g. "logo.png") to a URL:
 * known static image names -> /images/<name>; anything else -> /api/files/<name>
 * (uploaded file in UPLOAD_DIR, with fallback to legacy public/uploads/<name>).
 * Replaces the old `/uploads/${name}` pattern. `/uploads/<static name>` -> /images/<name>;
 * other absolute paths are returned unchanged.
 */
export function localAssetUrl(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/uploads/') && STATIC_IMAGE_NAMES.has(trimmed.slice('/uploads/'.length))) {
    return `/images/${trimmed.slice('/uploads/'.length)}`; // old marketing image path
  }
  if (trimmed.startsWith('/')) return trimmed;
  if (STATIC_IMAGE_NAMES.has(trimmed)) return `/images/${trimmed}`;
  return `/api/files/${trimmed.split('/').map(encodeURIComponent).join('/')}`;
}
