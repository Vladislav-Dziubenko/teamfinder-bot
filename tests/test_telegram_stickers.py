import unittest

from services.telegram_stickers import normalize_sticker_set, sticker_set_name, is_sticker_message


class StickerSetTests(unittest.TestCase):
    def test_shared_telegram_links_and_names(self):
        for value in ("My_pack", "https://t.me/addstickers/My_pack",
                      "https://telegram.me/addstickers/My_pack/",
                      "tg://addstickers?set=My_pack"):
            self.assertEqual(sticker_set_name(value), "My_pack")

    def test_does_not_accept_arbitrary_remote_urls(self):
        for value in ("https://evil.test/addstickers/Pack",
                      "https://t.me.evil.test/addstickers/Pack",
                      "https://t.me@evil.test/addstickers/Pack",
                      "http://localhost/Pack", "../../Pack", "https://t.me/other/Pack", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                sticker_set_name(value)

    def test_current_telegram_thumbnail_and_format_flags(self):
        pack = normalize_sticker_set({"name": "Pack", "stickers": [{
            "file_id": "a" * 200, "thumbnail": {"file_id": "preview"},
            "is_animated": True, "is_video": False, "emoji": "👍",
        }]})
        sticker = pack["stickers"][0]
        self.assertEqual(sticker["thumb_file_id"], "preview")
        self.assertTrue(sticker["is_animated"])
        self.assertFalse(sticker["is_video"])
        self.assertEqual(len(sticker["file_id"]), 200)

    def test_pack_is_not_silently_truncated_at_fifty(self):
        pack = normalize_sticker_set({"name": "Pack", "stickers": [
            {"file_id": str(i), "thumb": {"file_id": "old_preview"}} for i in range(120)
        ]})
        self.assertEqual(len(pack["stickers"]), 120)
        self.assertEqual(pack["stickers"][0]["thumb_file_id"], "old_preview")

    def test_long_sticker_tokens_do_not_get_chat_text_limit(self):
        token = "tg_sticker:Pack:" + "a" * 300 + ":" + "b" * 300 + ":animated"
        self.assertTrue(is_sticker_message(token))
        self.assertFalse(is_sticker_message(token[:500]))
        self.assertFalse(is_sticker_message("tg_sticker:Pack:https://evil.test"))


if __name__ == "__main__":
    unittest.main()
