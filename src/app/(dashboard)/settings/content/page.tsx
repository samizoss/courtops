export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserOrg } from '@/lib/get-user-org'

export default async function ContentSettingsPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  // Staff can't see Settings; viewer (read-only co-owner) and admin/owner can.
  if (userOrg.role === 'staff') {
    redirect('/')
  }
  const canEdit = userOrg.role === 'owner' || userOrg.role === 'admin'

  const cards = [
    {
      title: 'Channels',
      description: 'Enable the platforms your club posts to and the formats each supports',
      href: '/settings/content/channels',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
        </svg>
      ),
    },
    {
      title: 'Pillars',
      description: 'Content pillars — the recurring themes your calendar is planned around',
      href: '/settings/content/pillars',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
        </svg>
      ),
    },
    {
      title: 'Audiences',
      description: 'Who content is aimed at — members, prospects, the public, and more',
      href: '/settings/content/audiences',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-400 hover:text-white transition-colors">
          &larr; Back to Settings
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Content Settings</h2>
        <p className="text-gray-400 text-sm mt-1">
          {canEdit
            ? 'Configure the channels, pillars, and audiences used by the content calendar'
            : 'View content calendar configuration (read-only)'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-600/50 transition-colors group"
          >
            <div className="text-gray-400 group-hover:text-orange-400 transition-colors mb-3">
              {card.icon}
            </div>
            <h3 className="text-lg font-semibold text-white">{card.title}</h3>
            <p className="text-gray-400 text-sm mt-1">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
