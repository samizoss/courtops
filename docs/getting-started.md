# CourtOps — Getting Started Guide

Welcome to CourtOps! This guide walks you through initial setup and daily use of each module.

---

## Table of Contents

1. [First-Time Setup (Admin)](#1-first-time-setup-admin)
2. [Inviting Your Team](#2-inviting-your-team)
3. [Daily Checklists](#3-daily-checklists)
4. [Staff & Scheduling](#4-staff--scheduling)
5. [SOPs (Standard Operating Procedures)](#5-sops)
6. [Dashboard Overview](#6-dashboard)
7. [Settings Reference](#7-settings-reference)
8. [FAQ & Troubleshooting](#8-faq--troubleshooting)

---

## 1. First-Time Setup (Admin)

You'll need about 10 minutes to get everything configured.

### Step 1: Set Your Business Hours

Go to **Settings > General** and scroll to **Business Hours**.

- Set the open and close time for each day of the week
- Toggle days off (e.g., Sunday) by clicking the **On/Off** button
- Set **Staff Shift Buffer** if your team needs to arrive early or stay late (e.g., 15 minutes before open for setup)
- Click **Save Changes**

These hours power the scheduling grid — staff availability is shown within your operating hours.

### Step 2: Set Up Checklists

Go to **Checklists > Admin** (button in top right).

1. Click **New Template** and give it a name (e.g., "Opening Checklist")
2. Choose a shift type: Opening, Midday, Closing, or Custom
3. Click **Create**
4. Select your new template from the left panel
5. Click **Add Item** and type each checklist item (e.g., "Turn on lobby lights")
6. Use the **up/down arrows** to reorder items
7. Repeat for each checklist your team needs

Templates can be toggled **Active/Inactive** — inactive templates won't show to staff.

### Step 3: Create Your First SOPs

Go to **SOPs > + New SOP**.

- Give it a title and choose a category (Operations, Front Desk, Sales, etc.)
- Write the content using **Markdown** formatting:
  - `**bold**` for bold text
  - `- item` for bullet lists
  - `# Heading` for section headers
  - `![description](url)` for images
- Click **Add Image** to upload photos directly (useful for step-by-step guides)
- Use the **Preview** button to see how it'll look before publishing
- Add **tags** (comma-separated) for easy searching later
- Check **Publish immediately** or leave unchecked to save as a draft

Staff can view published SOPs but cannot edit them.

---

## 2. Inviting Your Team

Go to **Settings > Team**.

### Sending Invites

1. Enter the staff member's email and choose their role:
   - **Admin** — can manage checklists, schedules, time off approvals, SOPs, and settings
   - **Staff** — can clock in/out, complete checklists, view SOPs, set availability, request time off
   - **Viewer** — read-only access to dashboard, checklists, SOPs
2. Click **Send Invite**
3. Copy the invite link and share it with them (email, text, etc.)

**Important:** Invite links expire in **48 hours**. If they expire, click **Resend** next to the invite to generate a fresh link.

### Managing Team Members

- **Change roles** — click the role dropdown next to any team member
- **Deactivate** — click the green "Active" badge to deactivate someone. They'll disappear from all staff views (schedule, roster, availability, shift dropdowns) but their account isn't deleted. Click "Inactive" to bring them back.

---

## 3. Daily Checklists

### For Staff

Go to **Checklists** from the sidebar.

- You'll see today's checklists organized by shift (Opening, Midday, Closing)
- **Click the checkbox** next to each item as you complete it
- To add a **note** (e.g., "TV was broken, couldn't turn on"), click the speech bubble icon next to any item
- You can add a note before or after checking an item off
- Your name and the time you completed each item are recorded automatically

### For Managers

Everything staff sees, plus:

- **View past days** — use the date picker at the top to check any previous day's checklists. Did the opening checklist get done yesterday? Click yesterday's date and see exactly who completed what and when.
- Past dates are **read-only** — you can't check/uncheck items for previous days
- Click **Admin** (top right) to manage checklist templates and items

---

## 4. Staff & Scheduling

The Staff module has five tabs: **Clock In/Out**, **Roster**, **Schedule**, **Time Off**, and **Availability**.

### Clock In/Out

**For everyone:**
- Click **Clock In** when you start your shift (optionally add a note)
- Click **Clock Out** when you're done
- You can see who else is currently clocked in and for how long

**For managers:**
- **Hours Summary** section (admin only) — pick a date range and click **Load Hours** to see total hours per employee. Useful for payroll.
- **Recent Clock History** shows the last 30 days by default. To see older entries, use the **From / To date pickers** in the section header and click **Load** — any date range works. **Back to recent** returns to the default view.
- Admins can **Edit** or **Delete** any clock entry — both are recorded in the audit history (who changed what, when, and why).

### Roster

Shows all active team members with their name, email, and role. Admins can add new staff members from here (though inviting via **Settings > Team** is recommended).

### Schedule

This is where scheduling happens.

**The Availability Grid:**
- Select a day from the date bar at the top
- Choose your time increment: **1 hour**, **30 min**, or **15 min**
- Each row shows a time slot with who's available
- Staff names are color-coded:
  - **Green** = available (they set this in their availability)
  - **Yellow with ?** = haven't submitted availability yet
  - **Red** = off or has time off

**Assigning shifts (admin):**
- **Click a name** in the grid to assign them to that time slot — that's it, one click
- If the person is available, the shift is created instantly
- If they **haven't set availability**: you'll see a yellow warning. They'll receive a notification asking them to submit their availability within 2 days. The shift is tentative.
- If they're **unavailable or on time off**: you'll see a red warning and must add a note explaining the override
- Check **"Don't warn me again this session"** if you're doing a lot of scheduling and want to move faster
- Use the **"+" button** on any row to assign someone who isn't showing as available

**Manual shift entry:**
- Click **+ Add Shift** for the full form (staff member, date, start/end time, role, notes)
- This is useful for custom shifts outside the availability grid

**Editing/removing shifts:**
- Click **Edit** on any shift to change the time or role
- Click **Remove** to delete (you'll be asked to confirm)

**Drafts and releasing (admin):**
- Shifts you build in **Build mode** (including everything ✨ Magic Schedule proposes) start as **drafts** — staff can't see them yet
- When the schedule is ready, click **Release {window}**. You'll get a review screen first: how many drafts will go live, per-day coverage, and any uncovered days flagged in red
- Releasing is the one way to make a window's drafts live — review, then release
- Your own published shifts are highlighted with an **orange ring** so you can spot them at a glance

### Time Off

**For staff:**
- Click **+ Request Time Off**
- Enter start date, end date, and an optional reason
- Submit and wait for approval

**For managers:**
- Pending requests show with **Approve** and **Deny** buttons
- If other staff also have time off during the same period, you'll see a **yellow warning**
- If approving would leave you short-staffed, you'll see a **red warning**

### Availability

**For staff:**
- Click **Edit** to set your weekly availability
- For each day, toggle **Available** or **Off**
- If available, set your start and end times
- Click **Save** when done

**For managers:**
- The **Team Availability** grid shows everyone's schedule at a glance
- Time ranges are shown (e.g., "8a-5p") instead of just Y/N
- Staff who haven't set their availability show a yellow **?**
- "Not set" next to their name means they need a nudge

**Due dates:**
- Every availability window can have a submission deadline. It shows as a color-coded badge on the window pill — amber normally, **orange when 3 days remain, red when it's due within a day** — with the days remaining spelled out
- If you haven't submitted yet, a banner above the calendar reminds you of your most urgent deadline. It disappears once you submit

---

## 5. SOPs

### Viewing SOPs

Go to **SOPs** from the sidebar.

- SOPs are organized by **category** (Operations, Front Desk, Sales, etc.)
- Use the **search bar** to find SOPs by title, content, or tag
- Click **category pills** to filter by type
- Click **tag chips** (e.g., #opening, #safety) to filter by tag
- Click any SOP to read the full content with formatted text and images

### Creating & Editing SOPs (Admin only)

- Click **+ New SOP** to create
- Click **Edit** on any SOP detail page to modify
- Use **Markdown** for formatting (bold, lists, headings, links, tables)
- **Add Image** button uploads photos directly — or drag and drop images onto the editor
- Toggle **Preview** to see rendered output while editing
- Each save increments the **version number** (shown as "v2", "v3", etc.)
- Add **tags** as comma-separated values for searchability

---

## 6. Dashboard

Your dashboard adapts to your role:

**Everyone sees:**
- Today's checklist progress (completed/total)
- Who's currently on shift (clocked in)
- Pending time-off requests
- Unread notifications

**Admins also see:**
- Open tasks count

**Owners also see:**
- New leads count
- Overdue follow-ups
- Cadence due today (leads that need outreach)
- Recent pipeline activity

---

## 7. Settings Reference

### General (Settings > General)
- Organization name and slug (subdomain)
- Timezone
- Logo URL
- **Business hours** — per-day open/close times
- **Staff shift buffer** — minutes before open / after close that staff should be on-site

### Team (Settings > Team)
- View all team members and their roles
- Activate/deactivate team members
- Send invite links (48-hour expiry)
- Change roles (admin, staff, viewer)

### Integrations (Settings > Integrations)
- **Court Reserve** — enter API credentials, sync members and attendance data
- **Synced Court Reserve Events** — read-only preview of your CR events and upcoming sessions with registration counts, refreshed on each sync. These will anchor content campaigns. (Note: CR only exposes events that have at least one registration.)
- **Google Sheets** — import leads from marketing campaign spreadsheets

### Content (Settings > Content)
Configuration for content planning — set these up once and the planning tools use them everywhere:
- **Channels** — enable the places you publish (Instagram, Facebook Page, Facebook Groups, CourtReserve email/text/push, in-clubhouse flyers and displays, TikTok). For each channel, prune the formats you actually use. Facebook Groups support multiple instances (e.g. a members-only group and a public one).
- **Pillars** — your content themes (The Jar starts with Community, Programming, Education, Tech, Differentiator). Add descriptions and colors; reorder or archive as your strategy evolves.
- **Audiences** — who content targets (Members, Daily players, Beginners, LTP grads, etc.). Content can target multiple audiences.

---

## 8. FAQ & Troubleshooting

**Q: A staff member says they can't log in.**
Check Settings > Team — is their account active? Did their invite link expire? Click **Resend** to generate a new one.

**Q: The schedule grid shows the wrong hours.**
Go to Settings > General and verify your business hours are correct for each day. The grid uses these hours plus the staff buffer.

**Q: A checklist item was checked but nobody's name shows.**
This happens for items checked before we added name tracking (April 2, 2026). All new completions show who did it and when.

**Q: Someone shows as "?" (yellow) in the availability grid.**
They haven't submitted their availability yet. Ask them to go to Staff > Availability > Edit and set their weekly schedule.

**Q: I deactivated someone but they can still log in.**
Deactivation hides them from staff views but doesn't block login. To fully remove access, you'd need to delete their account from Supabase (not yet available in the UI — coming soon).

**Q: The "Import Leads" button didn't import anything.**
Check that the Google Sheet is still published to web. If all leads were already imported (matching by email/phone), it'll show "0 new" — that means dedup is working.

**Q: I approved time off but the person still shows as available in the schedule.**
The schedule grid correctly filters approved time off. Make sure the time-off request dates match the day you're viewing. Pending (unapproved) requests don't affect the schedule grid.

---

*Last updated: July 1, 2026*
