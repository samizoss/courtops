'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Sop, SopCategory } from '@/types/database'

const categoryOptions: { value: SopCategory; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'front-desk', label: 'Front Desk' },
  { value: 'sales', label: 'Sales' },
  { value: 'content', label: 'Content' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'general', label: 'General' },
]

export function SopDetail({
  sop,
  categoryLabel,
  categoryColor,
  canEdit,
  userId,
}: {
  sop: Sop
  categoryLabel: string
  categoryColor: string
  canEdit: boolean
  userId: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [currentSop, setCurrentSop] = useState(sop)
  const [content, setContent] = useState(sop.content)
  const [tags, setTags] = useState(sop.tags?.join(', ') ?? '')
  const [showPreview, setShowPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImageUpload(file: File) {
    setUploading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const ext = file.name.split('.').pop()
      const path = `sops/${sop.org_id}/${sop.id}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('sop-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('sop-images')
        .getPublicUrl(path)

      // Insert at cursor position
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const before = content.slice(0, start)
        const after = content.slice(start)
        const imgMarkdown = `\n![${file.name}](${publicUrl})\n`
        setContent(before + imgMarkdown + after)
      } else {
        setContent(content + `\n![${file.name}](${publicUrl})\n`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
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
      .update({
        title: form.get('title') as string,
        content,
        category: form.get('category') as SopCategory,
        is_published: form.get('is_published') === 'on',
        tags: parsedTags.length > 0 ? parsedTags : null,
        version: (currentSop.version ?? 1) + 1,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id)
      .select()
      .single()

    if (err) {
      setError(err.message)
    } else if (data) {
      setCurrentSop(data)
      setEditing(false)
      setShowPreview(false)
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this SOP? This cannot be undone.')) return

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error: err } = await supabase.from('sops').delete().eq('id', sop.id)

    if (!err) {
      router.push('/sops')
      router.refresh()
    }
  }

  if (editing) {
    return (
      <div>
        <button
          onClick={() => { setEditing(false); setShowPreview(false) }}
          className="text-sm text-gray-400 hover:text-white mb-4 inline-block"
        >
          &larr; Cancel editing
        </button>

        <form onSubmit={handleSave} className="space-y-4 max-w-4xl">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
            <input
              name="title"
              required
              defaultValue={currentSop.title}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
              <select
                name="category"
                defaultValue={currentSop.category}
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
                  defaultChecked={currentSop.is_published}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-300">Published</span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-300">Content</label>
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
                rows={20}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm leading-relaxed"
                placeholder="Write your SOP content using Markdown..."
                onDrop={(e) => {
                  const file = e.dataTransfer.files[0]
                  if (file?.type.startsWith('image/')) {
                    e.preventDefault()
                    handleImageUpload(file)
                  }
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('Files')) e.preventDefault()
                }}
              />
            )}
            <p className="text-xs text-gray-600 mt-1">
              Supports Markdown. Drag &amp; drop images or click &quot;Add Image&quot; to upload.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setShowPreview(false) }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div>
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/sops" className="text-sm text-gray-400 hover:text-white">
          &larr; All SOPs
        </Link>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Title + meta */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold">{currentSop.title}</h2>
          <span className={`text-xs px-2 py-0.5 rounded ${categoryColor}`}>
            {categoryLabel}
          </span>
          {!currentSop.is_published && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400">Draft</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">
            v{currentSop.version ?? 1} &middot; Last updated{' '}
            {new Date(currentSop.updated_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          {currentSop.tags && currentSop.tags.length > 0 && (
            <div className="flex gap-1">
              {currentSop.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content — rendered markdown */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-3xl">
        <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed prose-img:rounded-lg prose-img:border prose-img:border-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentSop.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
