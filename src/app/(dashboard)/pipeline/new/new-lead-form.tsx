'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import type { Pipeline, PipelineStage, LeadSource } from '@/types/database'

const sources: { value: LeadSource; label: string }[] = [
  { value: 'syndicate-ltp', label: 'Syndicate - LTP' },
  { value: 'syndicate-general', label: 'Syndicate - General' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

interface Props {
  orgId: string
  pipelines: Pipeline[]
  stages: PipelineStage[]
  staff: { id: string; full_name: string }[]
}

export function NewLeadForm({ orgId, pipelines, stages, staff }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPipelineId, setSelectedPipelineId] = useState(
    pipelines.length > 0 ? pipelines[0].id : ''
  )

  // Group stages by pipeline and find first non-terminal stage
  const stagesByPipeline = useMemo(() => {
    return stages.reduce<Record<string, PipelineStage[]>>((acc, s) => {
      if (!acc[s.pipeline_id]) acc[s.pipeline_id] = []
      acc[s.pipeline_id].push(s)
      return acc
    }, {})
  }, [stages])

  const initialStageId = useMemo(() => {
    if (!selectedPipelineId) return ''
    const pStages = stagesByPipeline[selectedPipelineId] ?? []
    const firstNonTerminal = pStages.find((s) => !s.is_terminal)
    return firstNonTerminal?.id ?? pStages[0]?.id ?? ''
  }, [selectedPipelineId, stagesByPipeline])

  // Derive pipeline_type from the pipeline's slug
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)
  const pipelineType = selectedPipeline?.slug ?? null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const form = new FormData(e.currentTarget)

    const { error: err } = await supabase.from('leads').insert({
      org_id: orgId,
      name: form.get('name') as string,
      email: (form.get('email') as string) || null,
      phone: (form.get('phone') as string) || null,
      source: form.get('source') as LeadSource,
      notes: (form.get('notes') as string) || null,
      assigned_to: (form.get('assigned_to') as string) || null,
      pipeline_id: selectedPipelineId || null,
      current_stage_id: initialStageId || null,
      pipeline_type: pipelineType,
      next_action_date: new Date().toISOString().split('T')[0],
    })

    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/pipeline')
      router.refresh()
    }
  }

  const inputClass =
    'w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <div className="max-w-lg">
      <h2 className="text-2xl font-bold mb-6">Add Lead</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Pipeline selector */}
        {pipelines.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Pipeline *</label>
            <select
              value={selectedPipelineId}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className={inputClass}
              required
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon || ''} {p.name}
                </option>
              ))}
            </select>
            {initialStageId && (
              <p className="text-xs text-gray-500 mt-1">
                Starting stage:{' '}
                <span className="text-gray-400">
                  {stages.find((s) => s.id === initialStageId)?.name}
                </span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
          <input
            name="name"
            required
            className={inputClass}
            placeholder="John Smith"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              name="email"
              type="email"
              className={inputClass}
              placeholder="john@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
            <input
              name="phone"
              type="tel"
              className={inputClass}
              placeholder="(605) 555-0123"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Source *</label>
            <select name="source" required className={inputClass}>
              {sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Assign To</label>
            <select name="assigned_to" className={inputClass}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className={inputClass}
            placeholder="Any context about this lead..."
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Add Lead'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
