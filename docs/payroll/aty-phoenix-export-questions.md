# CourtOps → Phoenix time clock export — sample + open questions

**For:** Chris Bochmann (Accountable to You) / Shannon Kopka (CyberPay)
**From:** Sami Zoss (CourtOps)
**Re:** Time clock export for The PB Jar, to import into CPO Phoenix
**Date:** 2026-06-09

---

## Summary

CourtOps is the operations software The Jar is moving to; it includes the clock-in/clock-out
mechanism replacing SwipeClock this summer. Per Shannon's recommendation, we're building the
export to import into **Phoenix** (KB 622), starting with the **"Excel Time Clock Import CSV"**
layout since the KB notes it's the easiest to start with.

Attached is a **sample export** (`sample-phoenix-time-clock-export.csv`) showing the shape we
intend to produce. It's one row **per employee, per day**, with the day's total hours — which
mirrors the per-punch-date granularity SwipeClock already sends you today.

**The values in the sample are placeholders** (EmployeeID `1001…`, Pay = `Hourly`, and we've
guessed that Units = Hours) pending your answers below. We want to confirm the layout and these
specifics before we finalize.

---

## Sample columns

| Column | What we put in it | Notes / question |
|---|---|---|
| `EmployeeID` | Per-staffer ID we'll store in CourtOps | **Q2** — we'd prefer your **Employee ID or TimeClock ID** (not SSN). Confirm? |
| `FirstName` | Staffer first name | Optional, for readability in your import preview |
| `LastName` | Staffer last name | Optional |
| `Pay` | Regular-hours pay code | **Q3** — what External ID / description? |
| `Units` | The day's total hours (guess) | **Q4** — is Units = worked hours for an hourly code? |
| `Hours` | The day's total hours (guess) | **Q4** — should Hours also be populated, and differ from Units? |
| `WorkDate` | The work date | **Q10** — MM/DD/YYYY shown; confirm format |

---

## Questions

1. **Confirm layout** — is the Phoenix **"Excel Time Clock Import CSV"** the right target, or a
   different Phoenix layout?
2. **EmployeeID** — we'd like to use your **Employee ID** or **TimeClock ID** (we'd rather not
   store/transmit SSNs). Which should we use? Geneva will enter that value per staffer in
   CourtOps so it matches Phoenix.
3. **Pay code** — what value should the `Pay` column hold for regular hourly work (the pay type's
   External ID or description)?
4. **Units vs Hours** *(most important)* — for an hourly pay code, should **Units** equal worked
   hours? Should **Hours** also be populated, and do the two ever differ? The KB note "we pay by
   the unit" makes us want to confirm rather than assume. (Our sample shows them equal as a
   guess.)
5. **Overtime** — can we send raw **daily** hours under one pay code and let Phoenix calculate OT
   from the hours + work dates? Or do you want OT split into a separate code/row on our side?
6. **Re-import behavior** — if we export a range, then fix a correction and **re-import an
   overlapping range**, does Phoenix **replace** the prior hours or **append** them (i.e., is
   there a double-pay risk on re-import)?
7. **Work week** — what day does your work week start, and do your pay-period boundaries line up
   with work-week ends? (We want our export ranges to not bisect a work week for OT purposes.)
8. **Rounding** — how does Phoenix round hours (how many decimals, round-half-up vs truncate)? We
   want our totals to tie out to yours.
9. **Overnight punches** — how does SwipeClock attribute a shift that crosses midnight today
   (e.g. 10pm–2am)? We want to match whatever you're used to.
10. **WorkDate format** — is MM/DD/YYYY fine, or do you prefer another format?
11. **Extra columns** — do you need **CompanyCode, Dept, Division, or Location** populated? *(We
    assume no — The Jar is a single location.)*
12. **Terminated / inactive employees** — if someone has hours in the range but has left, should
    they be in the file or excluded?
13. **Multiple pay rates** — does any staffer work two roles at two different rates (e.g. front
    desk vs coaching)? *(Our current design uses one pay code per club, so we want to know if
    that's a gap for you.)*
14. **PTO & holidays** — entered separately in Phoenix, or expected in this file? *(We assume
    separate — this file is worked hours only.)*
15. **Current SwipeClock sample** — could you send a sample of the file you import today, so we
    can diff our output against what you're already used to receiving?

Thanks — happy to hop on a call to test an import together once you've had a look.

Sami
