/**
 * Channel catalog for the content calendar (v2 design spec 2026-06-09).
 *
 * Channel TYPES and their canonical formats live here in code; the org's
 * enabled subset lives in the `content_channels` table (one row per channel
 * instance — multi-instance types like Facebook Group can have several).
 * Settings → Content → Channels renders this catalog as enable/disable rows
 * and validates `enabled_formats` against it.
 */

export type ChannelType =
  | 'instagram'
  | 'facebook_page'
  | 'facebook_group'
  | 'courtreserve'
  | 'in_clubhouse'
  | 'tiktok'
  | 'other'

export type ContentFormat =
  | 'post'
  | 'story'
  | 'reel'
  | 'live'
  | 'event'
  | 'text_only'
  | 'email'
  | 'bulk_text'
  | 'push'
  | 'global_announcement'
  | 'flyer'
  | 'digital_display'
  | 'poster'

export interface ChannelCatalogEntry {
  label: string
  supports_multi_instance: boolean
  formats: ContentFormat[]
  /** Whether instances of this type have a meaningful URL (profile/page/group). */
  has_url: boolean
}

export const CHANNEL_CATALOG: Record<ChannelType, ChannelCatalogEntry> = {
  instagram: {
    label: 'Instagram',
    supports_multi_instance: false,
    formats: ['post', 'story', 'reel', 'live'],
    has_url: true,
  },
  facebook_page: {
    label: 'Facebook Page',
    supports_multi_instance: false,
    formats: ['post', 'story', 'reel', 'live', 'event'],
    has_url: true,
  },
  facebook_group: {
    label: 'Facebook Group',
    supports_multi_instance: true,
    formats: ['post', 'text_only', 'live'],
    has_url: true,
  },
  courtreserve: {
    label: 'CourtReserve',
    supports_multi_instance: false,
    formats: ['email', 'bulk_text', 'push', 'global_announcement'],
    has_url: false,
  },
  in_clubhouse: {
    label: 'In Clubhouse',
    supports_multi_instance: false,
    formats: ['flyer', 'digital_display', 'poster'],
    has_url: false,
  },
  tiktok: {
    label: 'TikTok',
    supports_multi_instance: false,
    formats: ['post', 'story', 'live'],
    has_url: true,
  },
  other: {
    label: 'Other / Custom',
    supports_multi_instance: true,
    formats: [], // configurable per-instance: all formats allowed
    has_url: true,
  },
}

/** Shown as tooltips in Settings and the planning flow. */
export const FORMAT_DEFINITIONS: Record<ContentFormat, string> = {
  post: 'Grid/Page post. Image, carousel, or short video — chosen at build time, not planning.',
  story: 'Vertical, 24-hour ephemeral content.',
  reel: 'Vertical short-form video. Distinct from story (not ephemeral) and feed post.',
  live: 'Real-time broadcast.',
  event: 'Facebook Event entity with RSVP/ticketing.',
  text_only: 'No media, copy only. Discussion-style.',
  email: 'Long-form newsletter via CourtReserve.',
  bulk_text: 'SMS to opted-in members via CourtReserve.',
  push: 'Mobile app push via CourtReserve.',
  global_announcement: 'Banner inside the CR portal.',
  flyer: 'Printed handout, 8.5×11 or half-page.',
  digital_display: 'Smart-TV rotation in the clubhouse.',
  poster: 'One-off larger printed sign.',
}

export const ALL_FORMATS = Object.keys(FORMAT_DEFINITIONS) as ContentFormat[]

export function formatLabel(f: ContentFormat): string {
  return f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Formats an instance of `type` may enable ('other' allows everything). */
export function allowedFormats(type: ChannelType): ContentFormat[] {
  const entry = CHANNEL_CATALOG[type]
  return entry.formats.length > 0 ? entry.formats : ALL_FORMATS
}
