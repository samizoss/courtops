'use client'

import { useRouter } from 'next/navigation'

const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  selectedDate: string
  today: string
}

export function ChecklistDateNav({ selectedDate, today }: Props) {
  const router = useRouter()

  // Show 7 days: 6 days back + today
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    days.push(d.toISOString().split('T')[0])
  }

  function navigate(date: string) {
    if (date === today) {
      router.push('/checklists')
    } else {
      router.push(`/checklists?date=${date}`)
    }
  }

  return (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
      {days.map((date) => {
        const d = new Date(date + 'T12:00:00')
        const isSelected = date === selectedDate
        const isToday = date === today
        return (
          <button
            key={date}
            onClick={() => navigate(date)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-center transition-colors ${
              isSelected
                ? 'bg-orange-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <p className="text-xs font-medium">{dayShort[d.getDay()]}</p>
            <p className="text-lg font-bold">{d.getDate()}</p>
            {isToday && <p className="text-[9px] uppercase tracking-wide">Today</p>}
          </button>
        )
      })}
      <input
        type="date"
        value={selectedDate}
        max={today}
        onChange={(e) => navigate(e.target.value)}
        className="flex-shrink-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
    </div>
  )
}
