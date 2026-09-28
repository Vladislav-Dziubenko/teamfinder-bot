"""Developer metrics from recorded activity, not mutable last-seen timestamps."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta


def ordered_funnel(events, stages):
    by_user = defaultdict(list)
    for event in events:
        by_user[event["user_id"]].append(event)
    counts = [0] * len(stages)
    for history in by_user.values():
        history.sort(key=lambda event: (event["created_at"], event.get("id", 0)))
        step = 0
        previous_day = None
        for event in history:
            if step == len(stages):
                break
            stage = stages[step]
            matches = event["event_type"] == stage
            if stage == "returned_later":
                matches = event["event_type"] == "app_open" and event["created_at"][:10] > previous_day
            if matches:
                counts[step] += 1
                previous_day = event["created_at"][:10]
                step += 1
    return [{"event": stage, "users": count,
             "conversion": count / counts[index - 1] if index and counts[index - 1] else None}
            for index, (stage, count) in enumerate(zip(stages, counts))]


def overview(users, events, activity, notifications, purchases, *, days, now, excluded=()):
    excluded = set(excluded)
    users = [dict(u) for u in users if u["user_id"] not in excluded]
    allowed = {u["user_id"] for u in users}
    today = now.strftime("%Y-%m-%d")
    start = (now - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    events = [dict(e) for e in events if e["user_id"] in allowed and e["created_at"][:10] <= today]
    active = {(a["user_id"], a["day"]) for a in activity if a["user_id"] in allowed and a["day"] <= today}
    active.update((e["user_id"], e["created_at"][:10]) for e in events)
    period_events = [e for e in events if e["created_at"][:10] >= start]
    period_users = {uid for uid, day in active if day >= start}
    def active_since(day):
        return len({uid for uid, recorded_day in active if recorded_day >= day})

    retention = {}
    for offset, key in ((1, "d1"), (7, "d7"), (30, "d30")):
        cohort_day = (now - timedelta(days=offset)).strftime("%Y-%m-%d")
        cohort = {u["user_id"] for u in users if u["created_at"][:10] == cohort_day}
        returned = sum((uid, today) in active for uid in cohort)
        retention[key] = {"cohort_day": cohort_day, "cohort": len(cohort), "returned": returned,
                          "rate": returned / len(cohort) if cohort else None}

    search = {}
    for kind in ("teammate_search_started", "teammate_search_empty", "teammate_found"):
        rows = [e for e in period_events if e["event_type"] == kind]
        search[kind] = {"events": len(rows), "users": len({e["user_id"] for e in rows})}

    sent = [n for n in notifications if n["user_id"] in allowed and start <= n["created_at"][:10] <= today]
    sent_users = {n["user_id"] for n in sent}
    sent_at = {}
    for n in sent:
        sent_at[n["user_id"]] = min(sent_at.get(n["user_id"], n["created_at"]), n["created_at"])
    opened = [e for e in period_events if e["event_type"] == "notification_opened"
              and e["user_id"] in sent_users and e["created_at"] >= sent_at[e["user_id"]]]
    opened_users = {e["user_id"] for e in opened}

    paid = [p for p in purchases if p["user_id"] in allowed and start <= p["created_at"][:10] <= today]
    payment_events = period_events + [dict(p, event_type="payment_received") for p in paid]
    new_by_day = Counter(u["created_at"][:10] for u in users)
    active_by_day = Counter(day for _, day in active)
    series = []
    for index in range(days - 1, -1, -1):
        day = (now - timedelta(days=index)).strftime("%Y-%m-%d")
        series.append({"day": day, "new_users": new_by_day[day], "dau": active_by_day[day]})
    return {
        "days": days, "excluded_accounts": len(excluded), "total_users": len(users),
        "new_today": new_by_day[today], "dau": active_since(today),
        "wau": active_since((now - timedelta(days=6)).strftime("%Y-%m-%d")),
        "mau": active_since((now - timedelta(days=29)).strftime("%Y-%m-%d")),
        "returning": sum(u["user_id"] in period_users and u["created_at"][:10] < start for u in users),
        "retention": retention, "search": search, "series": series,
        "notifications": {"sent": len(sent), "sent_users": len(sent_users),
                          "opened_events": len(opened), "opened_users": len(opened_users),
                          "conversion": len(opened_users) / len(sent_users) if sent_users else None},
        "funnel": ordered_funnel(period_events, ["app_open", "teammate_search_started", "teammate_found",
                                                  "teammate_profile_opened", "message_sent", "returned_later"]),
        "payments": {"received": len(paid), "payers": len({p["user_id"] for p in paid}),
                     "gross_stars": sum(p["stars_amount"] for p in paid),
                     "funnel": ordered_funnel(payment_events, ["support_viewed", "invoice_created", "payment_received"])},
    }


async def load_overview(pool, days=30, excluded=()):
    days = days if days in (7, 30, 90) else 30
    now = datetime.utcnow()
    since = (now - timedelta(days=max(days - 1, 30))).strftime("%Y-%m-%d")
    excluded = sorted(set(excluded))
    async with pool.acquire() as conn:
        users = await conn.fetch("SELECT user_id, created_at FROM users WHERE NOT(user_id = ANY($1::bigint[]))", excluded)
        events = await conn.fetch(
            "SELECT id, user_id, event_type, created_at FROM analytics_events WHERE created_at >= $1 AND NOT(user_id = ANY($2::bigint[]))", since, excluded)
        activity = await conn.fetch(
            "SELECT DISTINCT user_id, substr(ts, 1, 10) AS day FROM user_activity_log WHERE ts >= $1 AND NOT(user_id = ANY($2::bigint[]))", since, excluded)
        notifications = await conn.fetch(
            "SELECT user_id, created_at FROM notification_log WHERE kind = 'teammate_found' AND status = 'sent' AND created_at >= $1 AND NOT(user_id = ANY($2::bigint[]))", since, excluded)
        purchases = await conn.fetch(
            "SELECT user_id, created_at, stars_amount FROM purchases WHERE charge_id IS NOT NULL AND created_at >= $1 AND NOT(user_id = ANY($2::bigint[]))", since, excluded)
    return overview(users, events, activity, notifications, purchases, days=days, now=now, excluded=excluded)
