import { Sidebar } from '@/components/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 p-4 pt-18 md:p-8 md:pt-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
