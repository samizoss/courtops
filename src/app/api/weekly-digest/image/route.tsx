import { ImageResponse } from 'next/og'
import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import { createClient } from '@/lib/supabase/server'
import { DAY_LABELS, formatTimeRange, formatDateRange, type DigestEvent } from '@/lib/weekly-digest'
import { JAR_BRAND } from '@/lib/jar-brand'

export const runtime = 'nodejs'

const WIDTH = 1080
const HEIGHT = 1350

// Module scope — fetched once per lambda instance, cached across invocations.
const daysOneRegular = fetch(new URL('./fonts/DaysOne-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer())
const montserratRegular = fetch(new URL('./fonts/Montserrat-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer())
const montserratBold = fetch(new URL('./fonts/Montserrat-Bold.ttf', import.meta.url)).then((r) => r.arrayBuffer())

export async function GET(request: Request) {
  const org = await getUserOrg()
  if (!org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(org.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

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
  const maxPerDay = Math.max(0, ...byDay.map((d) => d.length))
  const eventFontSize = maxPerDay > 5 ? 19 : 24
  const dateRange = formatDateRange(run.week_start, run.week_end)

  const [daysOne, mont, montBold] = await Promise.all([daysOneRegular, montserratRegular, montserratBold])

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
            zIndex: 1,
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

        {/* Day rows */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            marginTop: 48,
            paddingLeft: 56,
            paddingRight: 56,
            zIndex: 1,
          }}
        >
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'row',
                borderTop: '2px solid #ffffff',
                paddingTop: 14,
                paddingBottom: 14,
                flex: 1,
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
                          fontSize: eventFontSize,
                          marginBottom: idx < byDay[i].length - 1 ? 4 : 0,
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
            zIndex: 1,
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
