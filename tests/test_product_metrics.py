import unittest
from datetime import datetime

from services.product_metrics import is_suspicious_account, ordered_funnel, overview


def event(uid, kind, timestamp):
    return dict(user_id=uid, event_type=kind, created_at=timestamp)


class ProductMetricsTests(unittest.TestCase):
    def report(self, events=(), activity=(), purchases=(), notifications=(), excluded=()):
        return overview(
            [dict(user_id=1, created_at="2026-09-27T10:00:00"),
             dict(user_id=2, created_at="2026-08-01T10:00:00")],
            events, activity, notifications, purchases, days=30,
            now=datetime(2026, 9, 28, 12), excluded=excluded,
        )

    def test_independent_users_do_not_make_two_hundred_percent(self):
        rows = [event(1, "app_open", "2026-09-28T10:00:00"),
                event(1, "teammate_search_started", "2026-09-28T10:01:00"),
                event(1, "teammate_found", "2026-09-28T10:02:00"),
                event(1, "teammate_profile_opened", "2026-09-28T10:03:00"),
                event(2, "teammate_profile_opened", "2026-09-28T10:04:00")]
        funnel = self.report(events=rows)["funnel"]
        self.assertEqual([s["users"] for s in funnel], [1, 1, 1, 1, 0, 0])
        self.assertTrue(all(s["conversion"] is None or s["conversion"] <= 1 for s in funnel))

    def test_order_and_duplicate_events(self):
        rows = [event(1, "b", "2026-09-28T10:00:00"),
                event(1, "a", "2026-09-28T10:01:00"),
                event(1, "a", "2026-09-28T10:02:00"),
                event(1, "b", "2026-09-28T10:03:00")]
        self.assertEqual([s["users"] for s in ordered_funnel(rows, ["a", "b"])], [1, 1])
        self.assertEqual([s["users"] for s in ordered_funnel(rows[:-1], ["a", "b"])], [1, 0])

    def test_return_requires_later_calendar_day(self):
        rows = [event(1, "message_sent", "2026-09-27T10:00:00"),
                event(1, "app_open", "2026-09-27T11:00:00")]
        stages = ["message_sent", "returned_later"]
        self.assertEqual(ordered_funnel(rows, stages)[1]["users"], 0)
        rows.append(event(1, "app_open", "2026-09-28T11:00:00"))
        self.assertEqual(ordered_funnel(rows, stages)[1]["users"], 1)

    def test_activity_preserves_prior_days_and_deduplicates(self):
        report = self.report(
            events=[event(1, "app_open", "2026-09-28T10:00:00")],
            activity=[dict(user_id=1, day=day) for day in ["2026-09-27", "2026-09-28", "2026-09-28"]],
        )
        self.assertEqual([s["dau"] for s in report["series"][-2:]], [1, 1])
        self.assertEqual((report["dau"], report["wau"], report["mau"]), (1, 1, 1))

    def test_retention_uses_exact_day_and_empty_cohort_is_unknown(self):
        report = self.report(activity=[dict(user_id=1, day="2026-09-27")])
        self.assertEqual(report["retention"]["d1"]["rate"], 0)
        self.assertIsNone(report["retention"]["d7"]["rate"])
        report = self.report(activity=[dict(user_id=1, day="2026-09-28")])
        self.assertEqual(report["retention"]["d1"]["rate"], 1)

    def test_developer_excluded_from_every_metric(self):
        report = self.report(
            events=[event(1, "app_open", "2026-09-28T10:00:00")],
            activity=[dict(user_id=1, day="2026-09-28")],
            purchases=[dict(user_id=1, created_at="2026-09-28T10:00:00", stars_amount=100)],
            notifications=[dict(user_id=1, created_at="2026-09-28T10:00:00")], excluded=[1],
        )
        self.assertEqual(report["total_users"], 1)
        self.assertEqual(report["dau"], 0)
        self.assertEqual(report["payments"]["gross_stars"], 0)
        self.assertEqual(report["notifications"]["sent"], 0)
        self.assertEqual(report["retention"]["d1"]["cohort"], 0)

    def test_gross_payments_include_purchases_outside_support_funnel(self):
        report = self.report(
            events=[event(1, "support_viewed", "2026-09-28T10:00:00"),
                    event(1, "invoice_created", "2026-09-28T10:01:00")],
            purchases=[dict(user_id=uid, created_at="2026-09-28T10:02:00", stars_amount=100) for uid in [1, 2]],
        )
        self.assertEqual(report["payments"]["gross_stars"], 200)
        self.assertEqual(report["payments"]["payers"], 2)
        self.assertEqual([s["users"] for s in report["payments"]["funnel"]], [1, 1, 1])

    def test_suspicious_flags_only_quiet_users_without_profile(self):
        self.assertTrue(is_suspicious_account(0, False))
        self.assertTrue(is_suspicious_account(2, False))
        self.assertFalse(is_suspicious_account(3, False))
        self.assertFalse(is_suspicious_account(1, True))
        self.assertFalse(is_suspicious_account(0, True))
        self.assertFalse(is_suspicious_account("x", False))

    def test_notification_open_requires_prior_send(self):
        report = self.report(
            events=[event(1, "notification_opened", "2026-09-28T09:00:00"),
                    event(2, "notification_opened", "2026-09-28T11:00:00")],
            notifications=[dict(user_id=1, created_at="2026-09-28T10:00:00")],
        )
        self.assertEqual(report["notifications"]["opened_users"], 0)
        self.assertEqual(report["notifications"]["conversion"], 0)


if __name__ == "__main__":
    unittest.main()
