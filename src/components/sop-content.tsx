'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

/**
 * Sanitize schema that extends the default rehype-sanitize schema to allow
 * iframes (for embeds like Tango, Scribe, Loom, YouTube, etc.) with a safe
 * set of attributes.
 *
 * Security: we allow <iframe> but disallow <script>, event handlers, and
 * other unsafe elements. The embed content is loaded in the iframe's own
 * origin, so it can't read our auth cookies or manipulate the parent page
 * unless we explicitly grant permissions via sandbox/allow.
 */
const sopSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'iframe'],
  attributes: {
    ...defaultSchema.attributes,
    iframe: [
      'src',
      'width',
      'height',
      'title',
      'allow',
      'allowfullscreen',
      'allowFullScreen',
      'frameborder',
      'frameBorder',
      'sandbox',
      'referrerpolicy',
      'referrerPolicy',
      'loading',
      'style',
      'class',
      'className',
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['https'],
  },
}

export function SopContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed [&_iframe]:w-full [&_iframe]:min-h-[480px] [&_iframe]:rounded-lg [&_iframe]:border [&_iframe]:border-gray-800 [&_iframe]:my-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sopSchema]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
