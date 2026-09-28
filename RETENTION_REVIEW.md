# Mini-app entry review - 2026-09-28

Code and interface review only: no production traffic or payment history was
accessed. The findings identify friction, not proven causes of low traffic.

## Fixed in 1.9

- Matchmaking artwork: responsive crop removes letterbox bars embedded in the image.
- Daily reward: the existing server-backed claim is now accessible from Home.
  Loading, eligibility, duplicate-click protection and errors are handled.
  The existing 24-hour rule and server reward amounts are unchanged.
- Support: explicit links from Home and More; current visual styling on the
  support screen; subscription price and auto-renew disclosure remain visible.
- Onboarding: release notes no longer automatically open for first-time users.
  The unread bell remains available, with a corrected accessible label.
- Release notes: version 1.9 describes the updated design and Home changes.

## Verify with production data

The developer Analytics view exposes first opens, registrations, searches,
empty searches, matches, D1/D7 retention and notification opens. Compare
equivalent cohorts before and after release, including cohort sizes.

1. Few first opens: inspect acquisition sources and the bot-to-mini-app entry.
2. Opens without searches: inspect onboarding, errors and Render cold starts.
3. Many empty searches: inspect player availability by game/rank/time. The
   existing opt-in teammate notification helps users return when a match exists.
4. Matches without returns: inspect contact success and repeat play.
5. Support visits without purchases: compare visits, invoices and successful
   server payments. The retention funnel alone cannot explain purchase conversion.

This release does not change prices, send marketing messages, fake online
counts or make purchases. Traffic and revenue improvements require measurement.
