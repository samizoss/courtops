'use client'

import type { Lead, LeadStatus } from '@/types/database'

const columns: { status: LeadStatus; label: string; color: string }[] = [
  { status: 'new', label: 'New', color: 'border-blue-500' },
  { status: 'contacted', label: 'Contacted', color: 'border-yellow-500' },
  { status: 'follow-up', label: 'Follow-up', color: 'border-orange-500' },
  { status: 'trial-booked', label: 'Trial Booked', color: 'border-purple-500' },
  { status: 'converted', label: 'Converted', color: 'border-green-500' },
  { status: 'lost', label: 'Lost', color: 'border-gray-600' },
]

interface LeadWithProfile extends Lead {
  assigned_profile?: { full_name: string } | null
}

export function PipelineBoard({ leads }: { leads: LeadWithProfile[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const colLeads = leads.filter((l) => l.status === col.status)
        return (
          <div key={col.status} className="min-w-[280px] flex-shrink-0">
            <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${col.color}`}>
              <h3 className="text-sm font-semibold text-gray-300">{col.label}</h3>
              <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                {colLeads.length}
              </span>
            </div>

            <div className="space-y-2">
              {colLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
              {colLeads.length === 0 && (
                <p className="text-xs text-gray-600 py-4 text-center">No leads</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LeadCard({ lead }: { lead: LeadWithProfile }) {
  const isOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date() && !['converted', 'lost', 'archived'].includes(lead.status)

  return (
    <div className={`bg-gray-900 rounded-lg p-3 border ${isOverdue ? 'border-red-500/50' : 'border-gray-800'} hover:border-gray-700 transition-colors`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-white">{lead.name}</p>
        {lead.touch_count > 0 && (
          <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
            {lead.touch_count}x
          </span>
        )}
      </div>

      {lead.email && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{lead.email}</p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
          {lead.source.replace('-', ' ')}
        </span>
        {lead.assigned_profile && (
          <span className="text-[10px] text-gray-500">
            {lead.assigned_profile.full_name}
          </span>
        )}
        {isOverdue && (
          <span className="text-[10px] text-red-400 font-medium">OVERDUE</span>
        )}
      </div>

      {lead.next_action_date && (
        <p className={`text-[10px] mt-1.5 ${isOverdue ? 'text-red-400' : 'text-gray-600'}`}>
          Next: {new Date(lead.next_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  )
}
