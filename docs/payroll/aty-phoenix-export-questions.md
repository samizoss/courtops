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

**The values in the sample are placeholders** (EmployeeID `1001…`, Pay = `Hourly`) pending your
answers below. We want to confirm the layout and these specifics before we finalize.

---

## Sample columns

| Column | What we put in it | Notes / assumption |
|---|---|---|
| `EmployeeID` | Per-staffer ID we'll store in CourtOps | **Q2** — is this your Employee ID, SSN, or TimeClock ID? |
| `FirstName` | Staffer first name | Optional, for readability in your import preview |
| `LastName` | Staffer last name | Optional |
| `Pay` | Regular-hours pay code | **Q3** — what External ID / description should this be? |
| `Units` | The day's total hours | "We pay by the unit" — units = hours for hourly staff |
| `Hours` | The day's total hours | Same value as Units |
| `WorkDate` | The work date | **Q4** — MM/DD/YYYY shown; confirm preferred format |

---

## Questions

1. **Confirm layout** — is the Phoenix **"Excel Time Clock Import CSV"** the right target, or do
   you want a different Phoenix layout?
2. **EmployeeID** — should this be your **Employee ID**, **SSN**, or **TimeClock ID**? Whatever
   you choose, we'll have Geneva enter that value per staffer in CourtOps so it matches Phoenix.
3. **Pay code** — what value should the `Pay` column hold for regular hourly work (the pay type's
   External ID or description)? And do you want **overtime as a separate code/row**, or will
   Phoenix calculate OT from the hours + work dates we provide? *(Our assumption: we send raw
   daily hours under one code and Phoenix computes OT.)*
4. **WorkDate format** — is MM/DD/YYYY fine, or do you prefer another format?
5. **Extra columns** — do you need **CompanyCode, Dept, Division, or Location** populated? *(Our
   assumption: no — The Jar is a single location.)*
6. **Current SwipeClock sample** — could you send us a sample of the file you import today, so we
   can diff our output against what you're already used to receiving?
7. **Pay-period cadence** — weekly / biweekly / semi-monthly? *(So our export date presets match
   your payroll runs.)*
8. **PTO & holidays** — are those entered separately in Phoenix, or do you expect them in this
   file? *(Our assumption: separate — this file is worked hours only.)*

Thanks — happy to hop on a call to test an import together once you've had a look.

Sami
