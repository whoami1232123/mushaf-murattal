"""
Background prayer/adhkar reminders for the Windows desktop app.

Why this exists separately from the in-page JS timer in alerts.js: when the
window is minimised or hidden, the embedded WebView2 throttles timers heavily
(and stops them entirely once hidden), so the JS alarm silently stops firing.
This runs on a plain Python thread in the host process, which Windows does not
throttle, so reminders keep working while the app sits in the system tray.

Prayer times come from the same Aladhan API and honour the same settings the
web UI writes (location, calculation method, madhab, per-prayer minute tuning),
which are read out of the WebView2 localStorage-backed settings mirror the page
writes to disk - see settings_path().
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import threading
import time
import urllib.parse
import urllib.request

PRAYER_LABELS = {
    "Fajr": "صلاة الفجر",
    "Dhuhr": "صلاة الظهر",
    "Asr": "صلاة العصر",
    "Maghrib": "صلاة المغرب",
    "Isha": "صلاة العشاء",
}

# Adhkar are observed relative to prayer times, not fixed clock times.
ADHKAR_AFTER = {
    "Fajr": ("أذكار الصباح", 20),
    "Asr": ("أذكار المساء", 20),
    "Isha": ("أذكار النوم", 90),
}


def settings_path() -> str:
    """Where the web page mirrors its settings for the host process to read."""
    base = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MushafMurattal")
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "settings.json")


def load_settings() -> dict:
    try:
        with open(settings_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def fetch_timings(lat: float, lng: float, method: str, school: str, day: _dt.date) -> dict | None:
    date_str = day.strftime("%d-%m-%Y")
    query = urllib.parse.urlencode(
        {"latitude": lat, "longitude": lng, "method": method, "school": school}
    )
    url = f"https://api.aladhan.com/v1/timings/{date_str}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            payload = json.load(resp)
        if payload.get("code") != 200:
            return None
        return payload["data"]["timings"]
    except Exception:
        return None


def apply_tune(hhmm: str, key: str, tune: dict) -> str:
    adj = int(tune.get(key, 0) or 0)
    hours, minutes = (int(x) for x in hhmm.split(":")[:2])
    total = (hours * 60 + minutes + adj) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def notify(title: str, body: str) -> None:
    """Windows toast; falls back to a console line if the toast stack is absent."""
    try:
        from win11toast import notify as _toast

        _toast(title, body, duration="short", app_id="المصحف المرتل")
    except Exception:
        print(f"[reminder] {title} - {body}")


class PrayerService:
    """Polls the clock once a minute and fires reminders that have come due."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._fired: set[str] = set()
        self._fired_date: _dt.date | None = None
        self._cached_timings: dict | None = None
        self._cached_date: _dt.date | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="prayer-service", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _timings_for_today(self, settings: dict) -> dict | None:
        today = _dt.date.today()
        if self._cached_date == today and self._cached_timings:
            return self._cached_timings

        coords = settings.get("coords") or {}
        lat, lng = coords.get("lat"), coords.get("lng")
        if lat is None or lng is None:
            return None

        raw = fetch_timings(
            lat, lng,
            str(settings.get("method", 3)),
            str(settings.get("school", 0)),
            today,
        )
        if not raw:
            return None

        tune = settings.get("tune") or {}
        timings = {
            key: apply_tune(raw[key][:5], key, tune)
            for key in PRAYER_LABELS
            if key in raw
        }
        self._cached_timings, self._cached_date = timings, today
        return timings

    def _schedule_for(self, timings: dict, settings: dict) -> list[tuple[int, str, str, str]]:
        """Returns (minute_of_day, unique_key, title, body) for everything today."""
        prefs = settings.get("alerts") or {}
        events: list[tuple[int, str, str, str]] = []

        def to_minutes(hhmm: str) -> int:
            h, m = (int(x) for x in hhmm.split(":")[:2])
            return h * 60 + m

        if prefs.get("prayers", True) is not False:
            for key, label in PRAYER_LABELS.items():
                if key in timings:
                    events.append(
                        (to_minutes(timings[key]), f"p:{key}", f"حان الآن موعد {label}", timings[key])
                    )

        if prefs.get("adhkar", True) is not False:
            for key, (label, offset) in ADHKAR_AFTER.items():
                if key in timings:
                    events.append(
                        (
                            (to_minutes(timings[key]) + offset) % (24 * 60),
                            f"a:{key}",
                            f"حان وقت {label}",
                            "افتح التطبيق لقراءة الأذكار",
                        )
                    )
        return events

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                today = _dt.date.today()
                if self._fired_date != today:
                    # New day: forget yesterday's fired markers and force a refetch.
                    self._fired.clear()
                    self._fired_date = today
                    self._cached_timings = None

                settings = load_settings()
                timings = self._timings_for_today(settings)
                if timings:
                    now = _dt.datetime.now()
                    now_minutes = now.hour * 60 + now.minute
                    for at, key, title, body in self._schedule_for(timings, settings):
                        # A two-minute window absorbs a slow tick without
                        # re-announcing something that passed hours ago.
                        if 0 <= now_minutes - at <= 2 and key not in self._fired:
                            self._fired.add(key)
                            notify(title, body)
            except Exception:
                pass  # a transient failure must never kill the reminder loop

            self._stop.wait(30)
