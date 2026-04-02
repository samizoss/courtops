'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Pipeline, PipelineStage, Lead } from '@/types/database'

interface LeadWithProfile extends Lead {
  assigned_profile?: { full_name: string } | null
}

interface Props {
  pipelines: Pipeline[]
  stages: PipelineStage[]
  leads: LeadWithProfile[]
  unassignedLeads: LeadWithProfile[]
}

const pipelineIcons: Record<string, string> = {
  ltp: '🎾',
  membership: '🏠',
  upgrade: '⬆️',
  events: '🎉',
}

type TabValue = 'all' | 'unassigned' | string

export function PipelineBoard({ pipelines, stages, leads, unassignedLeads }: Props) {
  const hasUnassigned = unassignedLeads.length > 0
  const [activeTab, setActiveTab] = useState<TabValue>(
    pipelines.length > 0 ? pipelines[0].id : hasUnassigned ? 'unassigned' : 'all'
  )

  // Group stages by pipeline
  const stagesByPipeline = stages.reduce<Record<string, PipelineStage[]>>((acc, stage) => {
    if (!acc[stage.pipeline_id]) acc[stage.pipeline_id] = []
    acc[stage.pipeline_id].push(stage)
    return acc
  }, {})

  // Stage lookup
  const stageMap = stages.reduce<Record<string, PipelineStage>>((acc, s) => {
    acc[s.id] = s
    return acc
  }, {})

  // Pipeline lookup
  const pipelineMap = pipelines.reduce<Record<string, Pipeline>>((acc, p) => {
    acc[p.id] = p
    return acc
  }, {})

  function getColumnsAndLeads(): { columns: { id: string; name: string; color: string; cadenceDays: number | null; isTerminal: boolean }[]; columnLeads: Record<string, LeadWithProfile[]> } {
    if (activeTab === 'unassigned') {
      // Legacy status-based columns for unassigned leads
      const legacyColumns = [
        { id: 'new', name: 'New', color: 'border-blue-500', cadenceDays: null, isTerminal: false },
        { id: 'contacted', name: 'Contacted', color: 'border-yellow-500', cadenceDays: null, isTerminal: false },
        { id: 'follow-up', name: 'Follow-up', color: 'border-orange-500', cadenceDays: null, isTerminal: false },
        { id: 'trial-booked', name: 'Trial Booked', color: 'border-purple-500', cadenceDays: null, isTerminal: false },
        { id: 'converted', name: 'Converted', color: 'border-green-500', cadenceDays: null, isTerminal: true },
        { id: 'lost', name: 'Lost', color: 'border-gray-600', cadenceDays: null, isTerminal: true },
      ]
      const columnLeads: Record<string, LeadWithProfile[]> = {}
      legacyColumns.forEach((c) => {
        columnLeads[c.id] = unassignedLeads.filter((l) => l.status === c.id)
      })
      return { columns: legacyColumns, columnLeads }
    }

    if (activeTab === 'all') {
      // Show all pipeline stages flattened, grouped by pipeline
      const columns: { id: string; name: string; color: string; cadenceDays: number | null; isTerminal: boolean }[] = []
      const columnLeads: Record<string, LeadWithProfile[]> = {}

      pipelines.forEach((p) => {
        const pStages = stagesByPipeline[p.id] ?? []
        pStages.forEach((s) => {
          const colId = s.id
          columns.push({
            id: colId,
            name: `${p.name} - ${s.name}`,
            color: s.color ? `border-[${s.color}]` : 'border-gray-600',
            cadenceDays: s.cadence_days,
            isTerminal: s.is_terminal,
          })
          columnLeads[colId] = leads.filter((l) => l.current_stage_id === s.id)
        })
      })

      return { columns, columnLeads }
    }

    // Specific pipeline tab
    const pStages = stagesByPipeline[activeTab] ?? []
    const columns = pStages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color ? `border-[${s.color}]` : 'border-gray-600',
      cadenceDays: s.cadence_days,
      isTerminal: s.is_terminal,
    }))
    const columnLeads: Record<string, LeadWithProfile[]> = {}
    columns.forEach((c) => {
      columnLeads[c.id] = leads.filter((l) => l.current_stage_id === c.id)
    })

    return { columns, columnLeads }
  }

  const { columns, columnLeads } = getColumnsAndLeads()

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2 border-b border-gray-800">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveTab(p.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === p.id
                ? 'bg-gray-800 text-white border-b-2 border-orange-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
            }`}
          >
            <span>{p.icon || pipelineIcons[p.slug] || '📋'}</span>
            {p.name}
            <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full ml-1">
              {leads.filter((l) => l.pipeline_id === p.id).length}
            </span>
          </button>
        ))}

        {pipelines.length > 1 && (
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === 'all'
                ? 'bg-gray-800 text-white border-b-2 border-orange-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
            }`}
          >
            All
            <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full ml-1.5">
              {leads.length}
            </span>
          </button>
        )}

        {hasUnassigned && (
          <button
            onClick={() => setActiveTab('unassigned')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === 'unassigned'
                ? 'bg-gray-800 text-yellow-400 border-b-2 border-yellow-500'
                : 'text-yellow-600 hover:text-yellow-400 hover:bg-gray-900'
            }`}
          >
            Unassigned
            <span className="text-xs bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded-full ml-1.5">
              {unassignedLeads.length}
            </span>
          </button>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colLeads = columnLeads[col.id] ?? []
          return (
            <div key={col.id} className="min-w-[280px] flex-shrink-0">
              <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${col.color}`}>
                <h3 className="text-sm font-semibold text-gray-300 truncate">{col.name}</h3>
                <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  {colLeads.length}
                </span>
              </div>

              <div className="space-y-2">
                {colLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stage={lead.current_stage_id ? stageMap[lead.current_stage_id] : undefined}
                    pipeline={lead.pipeline_id ? pipelineMap[lead.pipeline_id] : undefined}
                    showPipelineName={activeTab === 'all'}
                  />
                ))}
                {colLeads.length === 0 && (
                  <p className="text-xs text-gray-600 py-4 text-center">No leads</p>
                )}
              </div>
            </div>
          )
        })}
        {columns.length === 0 && (
          <p className="text-gray-500 text-sm py-8">No pipeline stages configured yet.</p>
        )}
      </div>
    </div>
  )
}

function LeadCard({
  lead,
  stage,
  pipeline,
  showPipelineName,
}: {
  lead: LeadWithProfile
  stage?: PipelineStage
  pipeline?: Pipeline
  showPipelineName: boolean
}) {
  const now = new Date()
  const isTerminal = stage?.is_terminal ?? ['converted', 'lost', 'archived'].includes(lead.status)

  // Overdue logic: check next_action_date, or infer from cadence_days
  let isOverdue = false
  let daysOverdue = 0

  if (!isTerminal && lead.next_action_date) {
    const nextDate = new Date(lead.next_action_date)
    if (nextDate < now) {
      isOverdue = true
      daysOverdue = Math.floor((now.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24))
    }
  }

  return (
    <Link
      href={`/pipeline/${lead.id}`}
      className={`block bg-gray-900 rounded-lg p-3 border ${
        isOverdue ? 'border-red-500/50' : 'border-gray-800'
      } hover:border-gray-700 transition-colors`}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-white truncate flex-1">{lead.name}</p>
        {lead.touch_count > 0 && (
          <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">
            {lead.touch_count}x
          </span>
        )}
      </div>

      {lead.email && (
        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[220px]">{lead.email}</p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
          {lead.source.replace(/-/g, ' ')}
        </span>
        {showPipelineName && pipeline && (
          <span className="text-[10px] bg-gray-800 text-orange-400 px-1.5 py-0.5 rounded">
            {pipeline.name}
          </span>
        )}
        {lead.assigned_profile && (
          <span className="text-[10px] text-gray-500">
            {lead.assigned_profile.full_name}
          </span>
        )}
        {isOverdue && (
          <span className="text-[10px] text-red-400 font-medium">
            OVERDUE {daysOverdue > 0 ? `(${daysOverdue}d)` : ''}
          </span>
        )}
      </div>

      {lead.next_action_date && (
        <p className={`text-[10px] mt-1.5 ${isOverdue ? 'text-red-400' : 'text-gray-600'}`}>
          Next: {new Date(lead.next_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
    </Link>
  )
}
