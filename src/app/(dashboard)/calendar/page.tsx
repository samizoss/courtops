import { redirect } from 'next/navigation'

// Placeholder route. Phase 5 replaces /content with the unified calendar here
// (layered month view of CR sessions + campaign milestones + content pieces).
// Until then, send visitors to the existing content calendar.
export default function CalendarPage() {
  redirect('/content')
}
