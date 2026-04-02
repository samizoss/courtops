'use client'

import Link from 'next/link'
import { useState } from 'react'

interface MessageWithLead {
  id: string
  lead_id: string | null
  direction: 'inbound' | 'outbound'
  body: string
  from_number: string
  to_number: string
  status: string
  sent_at: string
  lead: { id: string; name: string; phone: string; status: string } | null
}

interface MessagingConfig {
  twilio_phone: string | null
  monthly_cap_cents: number
  current_spend_cents: number
  spend_month: string | null
  paused: boolean
}

export function MessagingInbox({
  initialMessages,
  config,
  orgId,
}: {
  initialMessages: MessageWithLead[]
  config: MessagingConfig | null
  orgId: string
}) {
  const [messages] = useState(initialMessages)

  // Group messages by lead
  const threads = new Map<string, { lead: MessageWithLead['lead']; messages: MessageWithLead[]; lastMessage: MessageWithLead }>()

  for (const msg of messages) {
    const key = msg.lead_id || msg.from_number
    if (!threads.has(key)) {
      threads.set(key, { lead: msg.lead, messages: [], lastMessage: msg })
    }
    threads.get(key)!.messages.push(msg)
  }

  const threadList = Array.from(threads.values()).sort(
    (a, b) => new Date(b.lastMessage.sent_at).getTime() - new Date(a.lastMessage.sent_at).getTime()
  )

  // Count "unread" = inbound messages where the most recent message in thread is inbound
  const unreadCount = threadList.filter((t) => t.lastMessage.direction === 'inbound').length

  const spendPct = config ? Math.round((config.current_spend_cents / config.monthly_cap_cents) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Messages</h2>
          <p className="text-gray-400 text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <Link
          href="/messaging/settings"
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Settings
        </Link>
      </div>

      {/* Budget bar */}
      {config && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">SMS Budget</span>
            <span className="text-xs text-gray-400">
              ${(config.current_spend_cents / 100).toFixed(2)} / ${(config.monthly_cap_cents / 100).toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                spendPct >= 100 ? 'bg-red-500' : spendPct >= 75 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(spendPct, 100)}%` }}
            />
          </div>
          {config.paused && (
            <p className="text-xs text-red-400 mt-2">Messaging is paused. Adjust budget in settings.</p>
          )}
        </div>
      )}

      {!config && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center mb-6">
          <p className="text-gray-400">Messaging not configured yet.</p>
          <p className="text-gray-500 text-sm mt-1">Set up Twilio in messaging settings to enable SMS.</p>
        </div>
      )}

      {/* Thread list */}
      {threadList.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No messages yet.</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
          {threadList.map((thread, i) => {
            const isUnread = thread.lastMessage.direction === 'inbound'
            return (
              <Link
                key={i}
                href={thread.lead ? `/pipeline/${thread.lead.id}` : '#'}
                className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/30 transition-colors"
              >
                {isUnread && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                {!isUnread && <div className="w-2 h-2 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isUnread ? 'text-white font-medium' : 'text-gray-300'}`}>
                    {thread.lead?.name || thread.lastMessage.from_number}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {thread.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                    {thread.lastMessage.body}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] text-gray-500">
                    {formatRelativeTime(thread.lastMessage.sent_at)}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
