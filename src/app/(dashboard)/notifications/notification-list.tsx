'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Notification, NotificationType } from '@/types/database'

function getRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getIcon(type: NotificationType): string {
  switch (type) {
    case 'system': return '\u{1F514}'
    case 'cadence_overdue': return '\u{1F4DE}'
    case 'task_assigned':
    case 'task_due': return '\u2611'
    case 'time_off_response': return '\u{1F4C5}'
    case 'new_lead': return '\u2795'
    default: return '\u{1F514}'
  }
}

interface Props {
  initialNotifications: Notification[]
}

export function NotificationList({ initialNotifications }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [markingAll, setMarkingAll] = useState(false)
  const router = useRouter()

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAllRead() {
    setMarkingAll(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
      if (unreadIds.length === 0) return
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds)
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, read_at: n.read_at ?? new Date().toISOString() }))
      )
    } finally {
      setMarkingAll(false)
    }
  }

  async function handleClick(notification: Notification) {
    if (!notification.read) {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notification.id)
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, read: true, read_at: new Date().toISOString() } : n
        )
      )
    }
    if (notification.link) {
      router.push(notification.link)
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-12 text-center">
        <p className="text-gray-500 text-lg">No notifications yet</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="text-sm text-orange-400 hover:text-orange-300 disabled:opacity-50 transition-colors"
          >
            {markingAll ? 'Marking...' : 'Mark All Read'}
          </button>
        )}
      </div>

      <div className="space-y-1">
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={`w-full text-left flex items-start gap-3 p-4 rounded-xl transition-colors ${
              n.read
                ? 'bg-gray-900 hover:bg-gray-800'
                : 'bg-gray-900/80 border border-gray-700 hover:bg-gray-800'
            } ${n.link ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="text-xl mt-0.5 shrink-0">{getIcon(n.type)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm truncate ${n.read ? 'text-gray-300' : 'text-white font-semibold'}`}>
                  {n.title}
                </p>
                {!n.read && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                )}
              </div>
              {n.body && (
                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
              )}
              <p className="text-xs text-gray-600 mt-1">{getRelativeTime(n.created_at)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
