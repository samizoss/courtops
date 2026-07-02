'use client'

import { useState } from 'react'
import Link from 'next/link'

export type CampaignStatus = 'planning' | 'active' | 'complete' | 'archived'
export type CampaignGoal =
  | 'brand_awareness'
  | 'engagement'
  | 'follower_growth'
  | 'event_attendance'
  | 'sales_growth'
  | 'customer_loyalty'
  | 'content_sharing'

export interface CampaignRow {
  id: string
  org_id: string
  name: string
  description: string | null
  color: string
  status: CampaignStatus
  goal: CampaignGoal | null
  start_date: string
  end_date: string | null
  post_goal: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const GOAL_LABELS: Record<CampaignGoal, string> = {
  brand_awareness: 'Brand awareness',
  engagement: 'Engagement',
  follower_growth: 'Follower growth',
  event_attendance: 'Event attendance',
  sales_growth: 'Sales growth',
  customer_loyalty: 'Customer loyalty',
  content_sharing: 'Content sharing',
}

const STATUS_BADGES: Record<CampaignStatus, { label: string; className: string }> = {
  planning: { label: 'Planning', className: 'bg-gray-500/10 text-gray-400' },
  active: { label: 'Active', className: 'bg-green-500/10 text-green-400' },
  complete: { label: 'Complete', className: 'bg-blue-500/10 text-blue-400' },
  archived: { label: 'Archived', className: 'bg-gray-500/10 text-gray-500' },
}

function formatDate(dateStr: string): string {
  // DATE strings — anchor to local midnight to avoid UTC off-by-one.
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface Props {
  campaigns: CampaignRow[]
  milestoneCounts: Record<string, number>
  linkedEventCounts: Record<string, number>
  canEdit: boolean
}

function CampaignCard({
  campaign,
  milestoneCount,
  linkedEventCount,
  dimmed,
}: {
  campaign: CampaignRow
  milestoneCount: number
  linkedEventCount: number
  dimmed?: boolean
}) {
  const badge = STATUS_BADGES[campaign.status]

  return (
    <Link
      href={`/calendar/campaigns/${campaign.id}`}
      className={`block bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 p-5 transition-colors ${
        dimmed ? 'opacity-50 hover:opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full border border-gray-700 shrink-0"
            style={{ backgroundColor: campaign.color }}
          />
          <span className="text-white font-semibold truncate">{campaign.name}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {campaign.description && (
        <p className="text-sm text-gray-400 mt-2 line-clamp-2">{campaign.description}</p>
      )}

      <div className="mt-3 space-y-1">
        {campaign.goal && (
          <p className="text-xs text-gray-400">{GOAL_LABELS[campaign.goal]}</p>
        )}
        <p className="text-xs text-gray-500">
          {formatDate(campaign.start_date)}
          {campaign.end_date ? ` – ${formatDate(campaign.end_date)}` : ' – ongoing'}
        </p>
        <p className="text-xs text-gray-500">
          {milestoneCount} {milestoneCount === 1 ? 'milestone' : 'milestones'} &middot;{' '}
          {linkedEventCount} linked {linkedEventCount === 1 ? 'event' : 'events'}
        </p>
      </div>
    </Link>
  )
}

export function CampaignsList({
  campaigns,
  milestoneCounts,
  linkedEventCounts,
  canEdit,
}: Props) {
  const [showArchived, setShowArchived] = useState(false)

  const current = campaigns.filter((c) => c.status !== 'archived')
  const archived = campaigns.filter((c) => c.status === 'archived')

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/content"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          &larr; Back to Content
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Campaigns</h2>
          <p className="text-gray-400 text-sm mt-1">
            Plan pushes around Court Reserve events, milestones, and content
          </p>
        </div>
        {canEdit && (
          <Link
            href="/calendar/campaigns/new"
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            + New campaign
          </Link>
        )}
      </div>

      {current.length === 0 && archived.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center">
          <p className="text-white font-medium">No campaigns yet</p>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
            Campaigns tie your milestones, Court Reserve events, and content together into
            one plan. Create your first one to get started.
          </p>
          {canEdit && (
            <Link
              href="/calendar/campaigns/new"
              className="inline-block mt-4 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + New campaign
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {current.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                milestoneCount={milestoneCounts[c.id] ?? 0}
                linkedEventCount={linkedEventCounts[c.id] ?? 0}
              />
            ))}
          </div>

          {current.length === 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <p className="text-sm text-gray-400">
                All campaigns are archived. Start a new one, or restore one from the
                archive below.
              </p>
            </div>
          )}

          {archived.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showArchived ? '▾' : '▸'} Archived ({archived.length})
              </button>
              {showArchived && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
                  {archived.map((c) => (
                    <CampaignCard
                      key={c.id}
                      campaign={c}
                      milestoneCount={milestoneCounts[c.id] ?? 0}
                      linkedEventCount={linkedEventCounts[c.id] ?? 0}
                      dimmed
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
