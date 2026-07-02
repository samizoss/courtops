# 7/2 Meeting — Click-by-Click Walkthrough

Companion to `2026-07-02-agenda.md`. Follow top to bottom; italics = what to say. Log in as **Sami (owner)** on `thepbjar.courtops.app` before the call. Have `courtops.app/releases` and `courtops.app/roadmap` in two background tabs.

---

## Act 1 — Wins (5 min)

1. Background tab → **courtops.app/releases**, July 1 entry on screen.
   *"Everything on this page shipped since we last talked. Let me show you the three you asked for."*

2. **Staff → Clock In/Out** → scroll to **Recent Clock History**.
   - Point at the **From / To date pickers** in the header → set From = `2026-06-01`, To = `2026-06-15` → **Load**.
   *"Full history, any range — this was the 'I can't see before June 3rd' fix."*
   - Click **Back to recent**.

3. Same page → **Hours Summary** → From `2026-06-01`, To `2026-06-30` → **Load Hours**.
   *"Also fixed evening clock-ins landing in the wrong pay period — these totals now tie out."*

4. **Staff → Shift Swap** tab.
   *"Old posts for past shifts clean themselves up now — Alicia's June swap is gone."*

## Act 2 — Schedule demo (10 min)

5. **Staff → Schedule** → month view → navigate back to **June**.
   *"Bonus fix from this morning: the schedule used to go blank past a certain point — Julio's early-June shifts, for example. Now it loads any period."* (Watch for the brief "Loading schedule…" note — that's it working.)

6. Back to **this week** → toggle **Build mode** ON.
   - Click **✨ Magic schedule** → let drafts appear (dashed borders).
   - Click **Release {window}** → **stop on the review screen**: draft count, coverage grid, gap warnings.
   *"One flow now: build, review coverage, release. No more separate publish button."*
   - **Cancel** (don't actually release) → **Clear magic drafts** to clean up.

7. **Staff → Availability** → point at the window pill's **due badge** (color + days remaining) and the **banner** above the calendar.
   *"Staff can't miss a deadline now — red within a day, orange within three."*

8. Background tab → **courtops.app/roadmap**.
   *"Public roadmap — updated yesterday, statuses audited against the actual code. What it says is built, is built."*

## Act 3 — Content (15 min — Maddie on)

9. **Settings → Integrations** → scroll to **Synced Court Reserve Events**.
   *"Your real CR events are flowing into CourtOps — 30 events, sessions with live registration counts. This is the foundation."*

10. **Settings → Content → Pillars**.
    *"Your five pillars from the tracker, already in. Maddie — the descriptions are blank on purpose: your words."*
    Quick peek at **Audiences** (8 seeded), then **Channels** (empty).
    *"Channels start empty by design — enabling them is your 10-minute homework, and it's also our usability test."*

11. **THE MOMENT — build a campaign live.** Sidebar → **Content** → **Campaigns** button → **New campaign**.
    - Name: whatever's real — e.g. **"July Kids Camp"**. Pick a color. Goal: Event attendance. Dates: July.
    - **Create** → on the detail page:
      a. **Add milestone**: "Registration push" + a date. Add a second: "Camp starts July 6".
      b. **+ Link CR event** → search **"Kids Camp"** → click it.
      c. Point at the **Sessions table** populating — July 6, 17 registered.
    *"That's live Court Reserve data inside your campaign. Every sync keeps it current."*
    **Let Geneva or Maddie drive the second campaign if there's appetite — note every hesitation.**

12. Then the design conversation (planning form + unified calendar) and the agenda's decision list — Phase 4 green-light, Maddie's sidebar access, channel list, zero-registration limitation.

## Act 4 — Payroll + priorities (10 min)

13. Per agenda §4–6. Key asks: **nudge ATY**, punch-list re-rank, commission Excel, CR category cleanup.

---

## If something breaks (fallbacks)

- **Schedule looks empty in a past month** → hard-refresh (Ctrl+Shift+R); the loader retries. Worst case: Hours Summary proves the data (Act 1, step 3).
- **Magic schedule proposes nothing** → no submitted availability in range; skip to Release with existing drafts, or just show the Release button and describe the review screen.
- **CR events panel empty** → Settings → Integrations → **Sync Now**, wait ~30s, reload.
- **Campaign create fails** → fall back to the pre-made campaign (MAKE ONE TONIGHT as backup — 2 min) and demo the detail page instead of the create flow.

## Pre-flight (morning of, 3 minutes)

- [ ] Log in, click: Schedule → back to June (Julio's shifts visible) → Clock history range → Campaigns page loads
- [ ] Create one backup campaign (see fallbacks) — name it "Demo backup", archive it after the meeting
- [ ] Phone check: /roadmap + /releases render on mobile
