# Schedule Builder Updates — June 2026

Hi team! Here's a walkthrough of the latest schedule builder improvements. These address several items Geneva flagged during the 5/27 meeting.

---

## What Changed

### 1. Instructor & League Leader Shifts Now Work

**Before:** Trying to assign a shift with the "Instructor" or "League Leader" role would fail with a "Failed to update shift" error.

**After:** All six roles work correctly: Front Desk, Coaching, Instructor, League Leader, Management, and Other.

**How to verify:** In Build mode, click any time slot, pick a staff member, and select "Instructor" or "League Leader" from the Role dropdown. The shift should save without errors.

---

### 2. 15-Minute Scheduling

**Before:** Dragging to create a shift snapped to 30-minute blocks (e.g., 8:00, 8:30, 9:00).

**After:** Dragging now snaps to 15-minute blocks (e.g., 8:00, 8:15, 8:30, 8:45). This gives more flexibility for shorter shifts or non-standard start times.

**How to verify:** In Build mode, drag on the schedule grid. You'll see the time range update in 15-minute increments instead of 30.

---

### 3. Dates Are Easier to Read

**Before:** Date numbers in the schedule header were small and gray.

**After:**
- Date numbers are larger and bold white text
- The first day visible in each view shows the month abbreviation (e.g., "Jun 4" instead of just "4")
- Column dividers between days are more visible

This makes it much easier to orient yourself when scanning the schedule, especially in week view.

---

### 4. "My Shifts" Are Highlighted

**Before:** To find your own shifts on the schedule, you had to read each name or switch to the "My schedule" filter.

**After:** Your own published shifts now have an orange ring around them, so they stand out at a glance — even when viewing the full team schedule.

**Note:** This highlight only appears on published shifts, not drafts. Draft shifts already have their own distinct dashed-border styling.

---

### 5. Adding Shifts in Busy Time Slots

**Before:** If a time slot already had someone assigned, you couldn't click or drag on that area to add another person. You had to find an empty spot below and manually adjust the times.

**After:** You can now drag-to-select directly over an existing shift block to add another person to the same time. Clicking an existing shift still opens its detail view as before — the system distinguishes between a click (view details) and a drag (create new shift).

---

## Nothing Changed

- The "My schedule" / "Total schedule" toggle works the same way
- PDF export is unchanged
- Published schedules look the same to non-admin staff (except they'll now see the orange ring on their own shifts)
- Draft/magic draft visual styling is the same
- All existing shifts and data are unaffected

---

## Tips for Walking Geneva Through This

1. **Start with the role fix** — this was her #1 pain point. Have her try creating an Instructor shift to confirm it works.
2. **Show the 15-min drag** — drag a short shift (e.g., 2:00–2:15) to demonstrate the finer control.
3. **Point out the date headers** — scroll through a few weeks to see the month abbreviation appear on the 1st of the month and the first visible day.
4. **Show the orange ring** — switch to "Total schedule" view and point out which shifts are hers.
5. **Demo drag-over-shifts** — in a time slot with an existing shift, drag across it to create a second shift on top.

---

*Deployed June 8, 2026. Questions? Ping Sami.*
