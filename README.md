# CourtOps

Operations platform for court sport clubs. Built on Next.js + Supabase.

## Features
- **Daily Checklists** — Opening, mid-shift, and closing checklists with completion tracking
- **Lead Pipeline** — Kanban board with status management, touch logging, and follow-up tracking
- **Task Management** — Priority-based task tracking with assignment
- **SOPs** — Categorized standard operating procedures for staff
- **Multi-tenant** — Each club gets their own subdomain (e.g., `thepbjar.courtops.app`)
- **Mobile-first** — Responsive design with collapsible sidebar

## Quick Start

```bash
# Install
npm install

# Set up environment
cp .env.local.example .env.local
# Fill in your Supabase URL and anon key

# Run the Supabase migration (see supabase/migrations/001_initial_schema.sql)

# Dev server
npm run dev
```

## Deploy

```bash
npx vercel deploy --prod --yes
```

## Architecture
- **Next.js 16** App Router with TypeScript
- **Supabase** for auth, database (PostgreSQL), and row-level security
- **Tailwind CSS** for styling
- **Vercel** for hosting with wildcard subdomain support

See [CLAUDE.md](CLAUDE.md) for detailed development documentation.
