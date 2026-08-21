"""
Desktop wrapper for the Quran app.

Serves the web app from a local HTTP server (not file://, so the service worker
and localStorage behave exactly as they do in a browser) and shows it in a native
window via pywebview's Edge WebView2 backend.

Closing the window hides it to the system tray rather than quitting, so the
background prayer/adhkar reminder service keeps running - WebView2 throttles JS
timers to a standstill once hidden, so the reminders are driven by a plain
Python thread instead (see prayer_service.py). Quit properly from the tray menu.
"""
import json
import os
import sys
import socket
import threading
import http.server
import socketserver

import webview

from prayer_service import PrayerService, settings_path

APP_TITLE = "المصحف المرتل - تجويد وحفظ"


def app_dir() -> str:
    """Web assets live next to the exe when frozen, one level up in the repo."""
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "webapp")
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=app_dir(), **kwargs)

    def end_headers(self):
        # The app updates in place; never let the local server hand back stale files.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        """
        The page posts its settings here whenever they change. localStorage lives
        inside WebView2 and is not readable from Python, so this endpoint is the
        bridge that lets the background reminder thread see the user's location,
        calculation method, madhab and per-prayer tuning.
        """
        if self.path != "/__settings":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            with open(settings_path(), "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False)
            self.send_response(204)
            self.end_headers()
        except Exception:
            self.send_error(400)

    def log_message(self, *args):
        pass  # keep the console quiet


def serve(port: int):
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        httpd.serve_forever()


AUTOSTART_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
AUTOSTART_NAME = "MushafMurattal"


def set_autostart(enabled: bool) -> bool:
    """Register (or clear) the app in the per-user Windows startup list."""
    try:
        import winreg

        target = sys.executable if getattr(sys, "frozen", False) else None
        if target is None:
            return False  # only meaningful for the packaged exe
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTOSTART_KEY, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                # --tray starts hidden so login is not interrupted by a window.
                winreg.SetValueEx(key, AUTOSTART_NAME, 0, winreg.REG_SZ, f'"{target}" --tray')
            else:
                try:
                    winreg.DeleteValue(key, AUTOSTART_NAME)
                except FileNotFoundError:
                    pass
        return True
    except Exception:
        return False


def tray_icon_image():
    from PIL import Image

    icon_path = os.path.join(app_dir(), "icons", "icon-192.png")
    if os.path.exists(icon_path):
        return Image.open(icon_path)
    return Image.new("RGB", (64, 64), (10, 79, 66))


def start_tray(window, service):
    """
    System tray icon. Runs on its own thread because pystray's run() blocks, and
    the main thread belongs to webview's GUI loop.
    """
    try:
        import pystray
    except Exception:
        return None

    def do_show(icon=None, item=None):
        try:
            window.show()
            window.restore()
        except Exception:
            pass

    def do_quit(icon=None, item=None):
        service.stop()
        try:
            icon.stop()
        except Exception:
            pass
        try:
            window.destroy()
        except Exception:
            pass
        os._exit(0)

    def autostart_enabled(item=None) -> bool:
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTOSTART_KEY, 0, winreg.KEY_READ) as key:
                winreg.QueryValueEx(key, AUTOSTART_NAME)
                return True
        except Exception:
            return False

    def toggle_autostart(icon=None, item=None):
        set_autostart(not autostart_enabled())

    menu = pystray.Menu(
        pystray.MenuItem("فتح المصحف", do_show, default=True),
        pystray.MenuItem("تشغيل تلقائي مع ويندوز", toggle_autostart, checked=autostart_enabled),
        pystray.MenuItem("خروج", do_quit),
    )
    icon = pystray.Icon(AUTOSTART_NAME, tray_icon_image(), APP_TITLE, menu)
    threading.Thread(target=icon.run, name="tray", daemon=True).start()
    return icon


def main():
    start_hidden = "--tray" in sys.argv

    port = free_port()
    threading.Thread(target=serve, args=(port,), daemon=True).start()

    service = PrayerService()
    service.start()

    window = webview.create_window(
        APP_TITLE,
        f"http://127.0.0.1:{port}/index.html",
        width=1180,
        height=820,
        min_size=(380, 600),
        text_select=True,
        hidden=start_hidden,
    )

    state = {"icon": None}

    def on_closing():
        # Hide to tray instead of quitting, so reminders keep running; quitting
        # for real is done from the tray menu.
        #
        # Returning False is what cancels the close: pywebview's Event.set()
        # reports "cancel" when any handler returned exactly False, and the
        # WinForms backend maps that to args.Cancel. Returning True does NOT
        # cancel - it lets the window close.
        window.hide()
        return False

    window.events.closing += on_closing

    def on_loaded():
        state["icon"] = start_tray(window, service)

    window.events.loaded += on_loaded

    # Registered on every launch so a reinstall or move of the exe keeps the
    # startup entry pointing at the right path.
    set_autostart(True)

    webview.start()


if __name__ == "__main__":
    main()
