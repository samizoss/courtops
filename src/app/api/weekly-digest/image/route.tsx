import fs from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import { createClient } from '@/lib/supabase/server'
import { DAY_LABELS, formatTimeRange, formatDateRange, getDigestImageTier, type DigestEvent } from '@/lib/weekly-digest'
import { JAR_BRAND } from '@/lib/jar-brand'

export const runtime = 'nodejs'

const WIDTH = 1080
const HEIGHT = 1350

// Module scope — read once per lambda instance, cached across invocations.
//
// Deviation from the original plan (`fetch(new URL('./fonts/*.ttf',
// import.meta.url))`): under this repo's Turbopack + Node.js route-handler
// runtime, that pattern throws `TypeError: fetch failed` / `Error: not
// implemented... yet` — Node's fetch (undici) does not support `file://`
// URLs the way Edge runtime's fetch does. fs.readFileSync is the same
// pattern already used by `templates/weekly-digest.html` elsewhere in this
// feature, so this keeps one consistent asset-loading approach. Traced into
// the Vercel bundle via `outputFileTracingIncludes` in next.config.ts (same
// fix `templates/` needed).
const FONTS_DIR = path.join(process.cwd(), 'src', 'app', 'api', 'weekly-digest', 'image', 'fonts')
const daysOneRegular = fs.readFileSync(path.join(FONTS_DIR, 'DaysOne-Regular.ttf'))
const montserratRegular = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-Regular.ttf'))
const montserratBold = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-Bold.ttf'))

export async function GET(request: Request) {
  // Read-only PNG render: any authenticated org member may fetch it (staff
  // view/download the graphic on /weekly-digest as of 2026-07-21). Queries
  // below are scoped by org_id + RLS. Generating a digest (POST
  // /api/weekly-digest/run) remains owner/admin-only.
  const org = await getUserOrg()
  if (!org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const week = searchParams.get('week')

  const supabase = await createClient()
  let query = supabase
    .from('weekly_digest_runs')
    .select('week_start, week_end, events, status')
    .eq('org_id', org.orgId)
    .order('generated_at', { ascending: false })
    .limit(1)

  if (week) query = query.eq('week_start', week)
  // Only successful runs have usable events for the graphic.
  query = query.eq('status', 'success')

  const { data: rows } = await query
  const run = rows?.[0]

  if (!run) {
    return NextResponse.json({ error: 'No successful digest run found' }, { status: 404 })
  }

  const events = (run.events ?? []) as DigestEvent[]
  const byDay = DAY_LABELS.map((_, i) => events.filter((e) => e.dayIndex === i))
  // Tier picked from total weekly pressure (not just one day's count) —
  // see the height-budget comment on getDigestImageTier in weekly-digest.ts
  // for the math showing why this never truncates the canvas.
  const tier = getDigestImageTier(byDay.map((d) => d.length))
  const dateRange = formatDateRange(run.week_start, run.week_end)

  const daysOne = daysOneRegular
  const mont = montserratRegular
  const montBold = montserratBold

  const image = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: JAR_BRAND.colors.blue,
          position: 'relative',
          fontFamily: 'Montserrat',
        }}
      >
        {/* Subtle court-texture rectangles */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            left: -160,
            width: 700,
            height: 700,
            backgroundColor: JAR_BRAND.colors.navy,
            opacity: 0.35,
            transform: 'rotate(12deg)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -180,
            right: -200,
            width: 800,
            height: 800,
            backgroundColor: JAR_BRAND.colors.navy,
            opacity: 0.25,
            transform: 'rotate(-8deg)',
            display: 'flex',
          }}
        />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 64,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Days One',
              color: '#ffffff',
              fontSize: 72,
              textTransform: 'uppercase',
              lineHeight: 1.1,
            }}
          >
            THIS WEEK
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Days One',
              color: '#ffffff',
              fontSize: 72,
              textTransform: 'uppercase',
              lineHeight: 1.1,
              marginBottom: 24,
            }}
          >
            @ THE JAR
          </div>
          {/* Contrast (WCAG 2.x, computed 2026-07-21): the date sits on a WHITE
              pill, so red #b42033 on #ffffff = 6.57:1 — passes AA (4.5:1). This
              is NOT the email's failing combo (red directly on blue #004a8d =
              1.35:1, fixed to white there). Everything else on this canvas is
              white on blue = 8.88:1. Red never sits directly on blue here. */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#ffffff',
              borderRadius: 999,
              padding: '10px 32px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'Days One',
                color: JAR_BRAND.colors.red,
                fontSize: 32,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {dateRange}
            </div>
          </div>
        </div>

        {/* Day rows — each row sizes to its own content (never forced into an
            equal 1/7 slice) so a busy day can never overlap its neighbor. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            marginTop: 48,
            paddingLeft: 56,
            paddingRight: 56,
          }}
        >
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'row',
                borderTop: '2px solid #ffffff',
                paddingTop: tier.rowPaddingY,
                paddingBottom: tier.rowPaddingY,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: 220,
                  flexShrink: 0,
                  fontFamily: 'Days One',
                  color: '#ffffff',
                  fontSize: 30,
                  textTransform: 'lowercase',
                }}
              >
                {label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
                {byDay[i].length === 0
                  ? null
                  : byDay[i].map((e, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          color: '#ffffff',
                          fontSize: tier.eventFontSize,
                          lineHeight: tier.lineHeight,
                          marginBottom: idx < byDay[i].length - 1 ? tier.eventGap : 0,
                        }}
                      >
                        <span style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>{formatTimeRange(e.startTime, e.endTime)}</span>
                        <span style={{ marginLeft: 8, fontFamily: 'Montserrat', fontWeight: 700 }}>{e.name}</span>
                      </div>
                    ))}
              </div>
            </div>
          ))}
        </div>

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingBottom: 40,
            paddingTop: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={JAR_BRAND.club.logoUrl} height={80} alt="" style={{ height: 80 }} />
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Days One', data: daysOne, style: 'normal', weight: 400 },
        { name: 'Montserrat', data: mont, style: 'normal', weight: 400 },
        { name: 'Montserrat', data: montBold, style: 'normal', weight: 700 },
      ],
    }
  )

  image.headers.set('Content-Disposition', `inline; filename="this-week-at-the-jar-${run.week_start}.png"`)
  return image
}
