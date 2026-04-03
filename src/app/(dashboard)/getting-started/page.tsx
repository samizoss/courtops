export const dynamic = 'force-dynamic'

export default function GettingStartedPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-white mb-2">Getting Started</h1>
      <p className="text-gray-400 mb-8">
        Welcome to CourtOps! This guide walks you through initial setup and daily use of each module.
      </p>

      {/* Table of Contents */}
      <nav className="bg-gray-800/50 rounded-xl p-5 mb-10 border border-gray-700">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Contents</h2>
        <ol className="space-y-1.5 text-sm">
          {[
            { id: 'setup', label: '1. First-Time Setup (Admin)' },
            { id: 'team', label: '2. Inviting Your Team' },
            { id: 'checklists', label: '3. Daily Checklists' },
            { id: 'staff', label: '4. Staff & Scheduling' },
            { id: 'sops', label: '5. SOPs' },
            { id: 'dashboard', label: '6. Dashboard Overview' },
            { id: 'settings', label: '7. Settings Reference' },
            { id: 'faq', label: '8. FAQ & Troubleshooting' },
          ].map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="text-orange-400 hover:text-orange-300 transition-colors">
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-12">
        {/* Section 1 */}
        <section id="setup">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">1. First-Time Setup (Admin)</h2>
          <p className="text-gray-300 mb-4">You&apos;ll need about 10 minutes to get everything configured.</p>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Step 1: Set Your Business Hours</h3>
              <p className="text-gray-300 mb-2">
                Go to <span className="text-orange-400 font-medium">Settings &gt; General</span> and scroll to <span className="font-medium text-white">Business Hours</span>.
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Set the open and close time for each day of the week</li>
                <li>Toggle days off (e.g., Sunday) by clicking the <span className="font-medium text-white">On/Off</span> button</li>
                <li>Set <span className="font-medium text-white">Staff Shift Buffer</span> if your team needs to arrive early or stay late (e.g., 15 minutes before open for setup)</li>
                <li>Click <span className="font-medium text-white">Save Changes</span></li>
              </ul>
              <p className="text-gray-400 text-sm mt-2 italic">These hours power the scheduling grid — staff availability is shown within your operating hours.</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Step 2: Set Up Checklists</h3>
              <p className="text-gray-300 mb-2">
                Go to <span className="text-orange-400 font-medium">Checklists &gt; Admin</span> (button in top right).
              </p>
              <ol className="list-decimal list-inside text-gray-300 space-y-1 ml-2">
                <li>Click <span className="font-medium text-white">New Template</span> and give it a name (e.g., &quot;Opening Checklist&quot;)</li>
                <li>Choose a shift type: Opening, Midday, Closing, or Custom</li>
                <li>Click <span className="font-medium text-white">Create</span></li>
                <li>Select your new template from the left panel</li>
                <li>Click <span className="font-medium text-white">Add Item</span> and type each checklist item (e.g., &quot;Turn on lobby lights&quot;)</li>
                <li>Use the <span className="font-medium text-white">up/down arrows</span> to reorder items</li>
                <li>Repeat for each checklist your team needs</li>
              </ol>
              <p className="text-gray-400 text-sm mt-2 italic">Templates can be toggled Active/Inactive — inactive templates won&apos;t show to staff.</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Step 3: Create Your First SOPs</h3>
              <p className="text-gray-300 mb-2">
                Go to <span className="text-orange-400 font-medium">SOPs &gt; + New SOP</span>.
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Give it a title and choose a category (Operations, Front Desk, Sales, etc.)</li>
                <li>Write the content using <span className="font-medium text-white">Markdown</span> formatting</li>
                <li>Click <span className="font-medium text-white">Add Image</span> to upload photos directly</li>
                <li>Use the <span className="font-medium text-white">Preview</span> button to see how it&apos;ll look before publishing</li>
                <li>Add <span className="font-medium text-white">tags</span> (comma-separated) for easy searching later</li>
                <li>Check <span className="font-medium text-white">Publish immediately</span> or leave unchecked to save as a draft</li>
              </ul>
              <p className="text-gray-400 text-sm mt-2 italic">Staff can view published SOPs but cannot edit them.</p>
            </div>
          </div>
        </section>

        {/* Section 2 */}
        <section id="team">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">2. Inviting Your Team</h2>
          <p className="text-gray-300 mb-3">
            Go to <span className="text-orange-400 font-medium">Settings &gt; Team</span>.
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Sending Invites</h3>
              <ol className="list-decimal list-inside text-gray-300 space-y-1.5 ml-2">
                <li>
                  Enter the staff member&apos;s email and choose their role:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-0.5 text-gray-400">
                    <li><span className="font-medium text-white">Admin</span> — can manage checklists, schedules, time off approvals, SOPs, and settings</li>
                    <li><span className="font-medium text-white">Staff</span> — can clock in/out, complete checklists, view SOPs, set availability, request time off</li>
                    <li><span className="font-medium text-white">Viewer</span> — read-only access to dashboard, checklists, SOPs</li>
                  </ul>
                </li>
                <li>Click <span className="font-medium text-white">Send Invite</span></li>
                <li>Copy the invite link and share it with them (email, text, etc.)</li>
              </ol>
              <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-sm text-yellow-300">
                <span className="font-semibold">Important:</span> Invite links expire in 48 hours. If they expire, click <span className="font-medium text-white">Resend</span> next to the invite to generate a fresh link.
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Managing Team Members</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li><span className="font-medium text-white">Change roles</span> — click the role dropdown next to any team member</li>
                <li><span className="font-medium text-white">Deactivate</span> — click the green &quot;Active&quot; badge to deactivate someone. They&apos;ll disappear from all staff views but their account isn&apos;t deleted. Click &quot;Inactive&quot; to bring them back.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section id="checklists">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">3. Daily Checklists</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">For Staff</h3>
              <p className="text-gray-300 mb-2">
                Go to <span className="text-orange-400 font-medium">Checklists</span> from the sidebar.
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>You&apos;ll see today&apos;s checklists organized by shift (Opening, Midday, Closing)</li>
                <li><span className="font-medium text-white">Click the checkbox</span> next to each item as you complete it</li>
                <li>To add a <span className="font-medium text-white">note</span>, click the speech bubble icon next to any item</li>
                <li>Your name and the time you completed each item are recorded automatically</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">For Managers</h3>
              <p className="text-gray-300 mb-2">Everything staff sees, plus:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li><span className="font-medium text-white">View past days</span> — use the date picker to check any previous day&apos;s checklists</li>
                <li>Past dates are <span className="font-medium text-white">read-only</span> — you can&apos;t check/uncheck items for previous days</li>
                <li>Click <span className="font-medium text-white">Admin</span> (top right) to manage checklist templates and items</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 4 */}
        <section id="staff">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">4. Staff & Scheduling</h2>
          <p className="text-gray-300 mb-4">
            The Staff module has five tabs: <span className="font-medium text-white">Clock In/Out</span>, <span className="font-medium text-white">Roster</span>, <span className="font-medium text-white">Schedule</span>, <span className="font-medium text-white">Time Off</span>, and <span className="font-medium text-white">Availability</span>.
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Clock In/Out</h3>
              <p className="text-gray-300 mb-1 font-medium">For everyone:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2 mb-3">
                <li>Click <span className="font-medium text-white">Clock In</span> when you start your shift (optionally add a note)</li>
                <li>Click <span className="font-medium text-white">Clock Out</span> when you&apos;re done</li>
                <li>You can see who else is currently clocked in and for how long</li>
              </ul>
              <p className="text-gray-300 mb-1 font-medium">For managers:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li><span className="font-medium text-white">Hours Summary</span> — pick a date range and click <span className="font-medium text-white">Load Hours</span> to see total hours per employee. Useful for payroll.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Roster</h3>
              <p className="text-gray-300">
                Shows all active team members with their name, email, and role. Admins can add new staff members from here (though inviting via <span className="text-orange-400 font-medium">Settings &gt; Team</span> is recommended).
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Schedule</h3>

              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-2">The Availability Grid</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2 mb-4">
                <li>Select a day from the date bar at the top</li>
                <li>Choose your time increment: <span className="font-medium text-white">1 hour</span>, <span className="font-medium text-white">30 min</span>, or <span className="font-medium text-white">15 min</span></li>
                <li>Each row shows a time slot with who&apos;s available</li>
                <li>
                  Staff names are color-coded:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-0.5 text-gray-400">
                    <li><span className="text-green-400 font-medium">Green</span> = available</li>
                    <li><span className="text-yellow-400 font-medium">Yellow with ?</span> = haven&apos;t submitted availability yet</li>
                    <li><span className="text-red-400 font-medium">Red</span> = off or has time off</li>
                  </ul>
                </li>
              </ul>

              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-2">Assigning Shifts (Admin)</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2 mb-4">
                <li><span className="font-medium text-white">Click a name</span> in the grid to assign them to that time slot — one click</li>
                <li>If the person is available, the shift is created instantly</li>
                <li>If they <span className="text-yellow-400 font-medium">haven&apos;t set availability</span>: you&apos;ll see a yellow warning. They&apos;ll receive a notification asking them to submit availability within 2 days. The shift is tentative.</li>
                <li>If they&apos;re <span className="text-red-400 font-medium">unavailable or on time off</span>: you&apos;ll see a red warning and must add a note explaining the override</li>
                <li>Check <span className="font-medium text-white">&quot;Don&apos;t warn me again this session&quot;</span> if you&apos;re scheduling quickly</li>
                <li>Use the <span className="font-medium text-white">&quot;+&quot; button</span> on any row to assign someone who isn&apos;t showing as available</li>
              </ul>

              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-2">Manual Shift Entry</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2 mb-4">
                <li>Click <span className="font-medium text-white">+ Add Shift</span> for the full form (staff member, date, start/end time, role, notes)</li>
                <li>Useful for custom shifts outside the availability grid</li>
              </ul>

              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-2">Editing/Removing Shifts</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Click <span className="font-medium text-white">Edit</span> on any shift to change the time or role</li>
                <li>Click <span className="font-medium text-white">Remove</span> to delete (you&apos;ll be asked to confirm)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Time Off</h3>
              <p className="text-gray-300 mb-1 font-medium">For staff:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2 mb-3">
                <li>Click <span className="font-medium text-white">+ Request Time Off</span></li>
                <li>Enter start date, end date, and an optional reason</li>
                <li>Submit and wait for approval</li>
              </ul>
              <p className="text-gray-300 mb-1 font-medium">For managers:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Pending requests show with <span className="font-medium text-white">Approve</span> and <span className="font-medium text-white">Deny</span> buttons</li>
                <li>If other staff also have time off during the same period, you&apos;ll see a <span className="text-yellow-400 font-medium">yellow warning</span></li>
                <li>If approving would leave you short-staffed, you&apos;ll see a <span className="text-red-400 font-medium">red warning</span></li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Availability</h3>
              <p className="text-gray-300 mb-1 font-medium">For staff:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2 mb-3">
                <li>Click <span className="font-medium text-white">Edit</span> to set your weekly availability</li>
                <li>For each day, toggle <span className="font-medium text-white">Available</span> or <span className="font-medium text-white">Off</span></li>
                <li>If available, set your start and end times</li>
                <li>Click <span className="font-medium text-white">Save</span> when done</li>
              </ul>
              <p className="text-gray-300 mb-1 font-medium">For managers:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>The <span className="font-medium text-white">Team Availability</span> grid shows everyone&apos;s schedule at a glance</li>
                <li>Time ranges are shown (e.g., &quot;8a-5p&quot;) instead of just Y/N</li>
                <li>Staff who haven&apos;t set their availability show a yellow <span className="text-yellow-400 font-medium">?</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 5 */}
        <section id="sops">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">5. SOPs</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Viewing SOPs</h3>
              <p className="text-gray-300 mb-2">
                Go to <span className="text-orange-400 font-medium">SOPs</span> from the sidebar.
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>SOPs are organized by <span className="font-medium text-white">category</span> (Operations, Front Desk, Sales, etc.)</li>
                <li>Use the <span className="font-medium text-white">search bar</span> to find SOPs by title, content, or tag</li>
                <li>Click <span className="font-medium text-white">category pills</span> to filter by type</li>
                <li>Click <span className="font-medium text-white">tag chips</span> to filter by tag</li>
                <li>Click any SOP to read the full content with formatted text and images</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Creating & Editing SOPs (Admin only)</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Click <span className="font-medium text-white">+ New SOP</span> to create</li>
                <li>Click <span className="font-medium text-white">Edit</span> on any SOP detail page to modify</li>
                <li>Use <span className="font-medium text-white">Markdown</span> for formatting (bold, lists, headings, links, tables)</li>
                <li><span className="font-medium text-white">Add Image</span> button uploads photos directly — or drag and drop</li>
                <li>Toggle <span className="font-medium text-white">Preview</span> to see rendered output while editing</li>
                <li>Each save increments the <span className="font-medium text-white">version number</span> (shown as &quot;v2&quot;, &quot;v3&quot;, etc.)</li>
                <li>Add <span className="font-medium text-white">tags</span> as comma-separated values for searchability</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 6 */}
        <section id="dashboard">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">6. Dashboard Overview</h2>
          <p className="text-gray-300 mb-3">Your dashboard adapts to your role:</p>

          <div className="space-y-4">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Everyone sees</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Today&apos;s checklist progress (completed/total)</li>
                <li>Who&apos;s currently on shift (clocked in)</li>
                <li>Pending time-off requests</li>
                <li>Unread notifications</li>
              </ul>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Admins also see</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Open tasks count</li>
              </ul>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Owners also see</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>New leads count</li>
                <li>Overdue follow-ups</li>
                <li>Cadence due today (leads that need outreach)</li>
                <li>Recent pipeline activity</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 7 */}
        <section id="settings">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">7. Settings Reference</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">General (Settings &gt; General)</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>Organization name and slug (subdomain)</li>
                <li>Timezone</li>
                <li>Logo URL</li>
                <li><span className="font-medium text-white">Business hours</span> — per-day open/close times</li>
                <li><span className="font-medium text-white">Staff shift buffer</span> — minutes before open / after close that staff should be on-site</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Team (Settings &gt; Team)</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li>View all team members and their roles</li>
                <li>Activate/deactivate team members</li>
                <li>Send invite links (48-hour expiry)</li>
                <li>Change roles (admin, staff, viewer)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Integrations (Settings &gt; Integrations)</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                <li><span className="font-medium text-white">Court Reserve</span> — enter API credentials, sync members and attendance data</li>
                <li><span className="font-medium text-white">Google Sheets</span> — import leads from marketing campaign spreadsheets</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 8 */}
        <section id="faq">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">8. FAQ & Troubleshooting</h2>

          <div className="space-y-4">
            {[
              {
                q: "A staff member says they can't log in.",
                a: 'Check Settings > Team — is their account active? Did their invite link expire? Click Resend to generate a new one.',
              },
              {
                q: 'The schedule grid shows the wrong hours.',
                a: 'Go to Settings > General and verify your business hours are correct for each day. The grid uses these hours plus the staff buffer.',
              },
              {
                q: "A checklist item was checked but nobody's name shows.",
                a: 'This happens for items checked before we added name tracking (April 2, 2026). All new completions show who did it and when.',
              },
              {
                q: 'Someone shows as "?" (yellow) in the availability grid.',
                a: "They haven't submitted their availability yet. Ask them to go to Staff > Availability > Edit and set their weekly schedule.",
              },
              {
                q: 'I deactivated someone but they can still log in.',
                a: "Deactivation hides them from staff views but doesn't block login. To fully remove access, you'd need to delete their account from Supabase (not yet available in the UI — coming soon).",
              },
              {
                q: "The \"Import Leads\" button didn't import anything.",
                a: 'Check that the Google Sheet is still published to web. If all leads were already imported (matching by email/phone), it\'ll show "0 new" — that means dedup is working.',
              },
              {
                q: 'I approved time off but the person still shows as available in the schedule.',
                a: "The schedule grid correctly filters approved time off. Make sure the time-off request dates match the day you're viewing. Pending (unapproved) requests don't affect the schedule grid.",
              },
            ].map((faq) => (
              <div key={faq.q} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <p className="font-medium text-white mb-1">Q: {faq.q}</p>
                <p className="text-gray-300 text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-gray-500 text-sm mt-12 text-center italic">Last updated: April 2, 2026</p>
    </div>
  )
}
