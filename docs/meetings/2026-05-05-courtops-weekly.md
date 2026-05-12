# CourtOps Weekly — 2026-05-05

> Attendees: Sami, Travis Thie, Bilhah Kimondiu (Geneva and Kevin on the invite but barely spoke). Duration: 34 min. Fireflies transcript: `01KQ8PF833HR5Q5E6SP2DSWJN7`.

## Summary

Sami walked Travis through everything shipped from the prior week (PRs #13–#30). Most of the meeting was Sami live-demoing scheduling, magic-schedule, availability submission, and the role-toggle coverage view; Travis asked questions; Bilhah is being assigned cross-check duty against Geneva's existing schedule. Big shift in scope: **Shift Swap V1 is now a same-day commitment** Sami made on the call.

## Sami's specific commitments made on the call

### Same-day "by end of day" promises (highest priority)

- **Shift swap V1 to test** ("actively boo Ben over here" — Sami's words). Mechanic: from schedule view, click a shift → "Open for swap" / "Open for take." Time Off tab becomes Shift Swap, showing open shifts. Restaurant-industry model. Share-able link Geneva can text. **NOT YET BUILT.**
- **Travis password-reset email test** — Sami sent Travis a reset email; Travis asked to forward to Sami when received to confirm the flow works. **Pending Travis.**

### Specific UX commitments (the team noticed these gaps live)

- **A2 — Edit draft shift time + notes in detail popover.** Today only role is editable. Sami: "Ella's available this time but you really only need her nine to noon. I want you to be able to do that without needing to re put in one." **NOT BUILT.**
- **A4 + A5 — Build-mode toggle on Schedule tab.** Sami: "instead of having a fourth spot here, I will have schedule and then I will have sort of a toggle of build the schedule. So it's like everything you do until you hit publish is just behind that toggle wall." Save-draft lives in build mode. Move Magic schedule there too. **NOT BUILT — structural refactor.**
- **A6 — Drag-on-time-grid availability UI** (mobile-friendly). Travis confirmed the painted-grid model is easier: "dragging and each individual day and just filling it in. Because then you don't have to think about if it's the right form format." Sami: "very similar view to our schedule and they just pull in when they are." Big rebuild. **NOT BUILT.**
- **A7 — Window-open share-link** that Geneva can paste into a text/group chat. Spec captured in CURRENT_STATE Q2 answer; **NOT BUILT.**
- **A11 — Availability validation rules** on Submit. Sami: "Can we reasonably understand that you meant that you're available." Robot-readable pass before accepting. **NOT BUILT.**
- **A12 — Fix `approximateHours` parsing edge cases.** Sami noticed Alicia's hours summary is wrong — "it's misreading some of her NA and non like this the blank spaces kind of deal." **NOT FIXED.**

### Bigger asks (V2-ish, queued)

- **B1 — Operational hours background shading on schedule.** Sami's own idea, popped on the call: "different shaded background on operational hours...Tuesdays we're open five to nine, like that being a different shade." Easy. **NOT BUILT.**
- **B2 — Print / export month view** so Geneva can hang it behind the desk. **NOT BUILT.**
- **B3 — Gap analysis flag** for days with no front-desk coverage. "Easy gap analysis where then it can add a flag for a day where there's not coverage." **NOT BUILT.**
- **B4 — Inform magic schedule with coverage minimums.** "At minimum we want at least one person at the front desk at all open hours." Today magic-schedule has no demand model. **NOT BUILT.**
- **B5 — Have magic schedule read CR utilization** to find high-traffic times that need more coverage. Future-state.
- **B6 — Ambassador role** (volunteer / league leader tier). Travis asked: "can we add people who aren't staff so like our ambassadors?" Sami: "right now they would get the same view as staff. Maybe make Mike our test of what we would want an ambassador to be able to view first." Limited view: clock + availability + schedule only. Sami called this "probably more of a version 2."
- **B7 — Ambassador / league leader CR attendance auto-clock** via Court Reserve event sync. "If they are marked attending for whatever that event is, it may be able to automatically mark them as theirs."
- **B8 — Pull business hours from CR** so Geneva doesn't manually maintain them. "I want the hours to actually come from Court Reserve."

### Other rename / restructure decided on the call

- **A9 — Time Off tab → Shift Swap.** Comes with A3.
- **A10 — Click-shift → "Open for swap" flow** on the schedule view.
- **A8 — Shift swap list shows staff who had submitted availability** for that time, with the explicit caveat "this is just submitted availability — they may not still be available." Travis: "you can still send it to everyone, but here..." Sami agreed.

## Verbatim quotes worth preserving

- **On magic-schedule trust:** "Until that's perfected, I just wouldn't blind trust it. Double check folks availability."
- **On demand modeling for magic-schedule:** "How do we inform the magic schedule to know what times you need. What does it read the court reserve schedule and look at high utilization times. Does it... like those are the sorts of things that magic schedule right now is just looking at what folks availability are and adding those in some open spots which is nice but not exactly optimized."
- **On club-specific vs platform-wide:** "I'm trying to balance what makes sense across the board for this. And, like, we can make little quirks for your guys's. I just don't want to. I don't want too much bespoke for every club kind of deal." (Reinforces the per-club-roles deferral; same principle for hours/target sources.)
- **On shift-swap notification:** "The one thing I know I can do ASAP is basically like when I request to open that shift, here's the copy this link for someone to pick it up and then they can text it to the group."
- **On availability submit + drag model:** "In theory, the nice part is it can be like... see through pieces of paper that you can like stack on top of each other. I imagine the robot in the back doing that where it's like, okay, let's stack everything on top and then map it for us."

## What Geneva needs to do this week

1. Test scheduling + availability features.
2. Verify target hours per staffer align with actual staffing needs.
3. Cross-check (with Bilhah) the schedule accuracy against her existing source.
4. Use the system as the source of truth going forward — add shifts in CourtOps instead of the PDF.

## What Travis needs to do this week

1. Test password reset email → forward received email to Sami.
2. Give feedback as he starts using the system.

## Bilhah's role

Internal team — cross-checks Geneva's scheduling data accuracy as a reference to reduce errors for Geneva. Not a CourtOps user, support function only.
