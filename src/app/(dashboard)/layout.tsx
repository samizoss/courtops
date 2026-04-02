import { Sidebar } from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-gray-950 text-white">
        <Sidebar />
        <main className="flex-1 p-4 pt-16 md:p-8 md:pt-8 overflow-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
