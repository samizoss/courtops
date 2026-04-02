'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useToast } from '@/components/toast'
import type { SopCategory } from '@/types/database'

const categoryOptions: { value: SopCategory; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'front-desk', label: 'Front Desk' },
  { value: 'sales', label: 'Sales' },
  { value: 'content', label: 'Content' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'general', label: 'General' },
]

export function NewSopForm({ orgId, userId }: { orgId: string; userId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImageUpload(file: File) {
    setUploading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `sops/${orgId}/new/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('sop-images').upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('sop-images').getPublicUrl(path)
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const before = content.slice(0, start)
        const after = content.slice(start)
        setContent(before + `\n![${file.name}](${publicUrl})\n` + after)
      } else {
        setContent(content + `\n![${file.name}](${publicUrl})\n`)
      }
      toast('Image uploaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Image upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const form = new FormData(e.currentTarget)

    const parsedTags = tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    const { data, error: err } = await supabase
      .from('sops')
      .insert({
        org_id: orgId,
        title: form.get('title') as string,
        content,
        category: form.get('category') as SopCategory,
        is_published: form.get('is_published') === 'on',
        tags: parsedTags.length > 0 ? parsedTags : null,
        created_by: userId,
        updated_by: userId,
        sort_order: 0,
      })
      .select()
      .single()

    if (err) {
      setError(err.message)
      toast(err.message, 'error')
      setLoading(false)
    } else if (data) {
      toast('SOP created')
      router.push(`/sops/${data.id}`)
      router.refresh()
    }
  }

  return (
    <div>
      <a href="/sops" className="text-sm text-gray-400 hover:text-white mb-4 inline-block">
        &larr; All SOPs
      </a>

      <h2 className="text-2xl font-bold mb-6">New SOP</h2>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
          <input
            name="title"
            required
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g. Opening Procedures"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
            <select
              name="category"
              defaultValue="general"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="opening, daily, safety"
            />
          </div>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="is_published"
                type="checkbox"
                defaultChecked={true}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-300">Publish immediately</span>
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-300">Content *</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Add Image'}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  showPreview
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>

          {showPreview ? (
            <div className="w-full min-h-[480px] px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg">
              <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={20}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm leading-relaxed"
              placeholder="Write your SOP content using Markdown..."
            />
          )}
          <p className="text-xs text-gray-600 mt-1">
            Supports Markdown: **bold**, *italic*, # headings, - lists, ![image](url)
          </p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create SOP'}
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
