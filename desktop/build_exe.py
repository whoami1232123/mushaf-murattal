"""
Build the Windows executable.

    python desktop/build_exe.py

Produces dist/MushafMurattal.exe - a single self-contained file. The web assets
are embedded, so the exe needs no other files alongside it.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DESKTOP = os.path.join(ROOT, "desktop")
NAME = "MushafMurattal"

# Web assets to embed. Anything listed here ends up under _MEIPASS/webapp/.
# "assets" carries the bundled male-voice alert clips (assets/audio/alerts/) -
# without it playVoiceClip() 404s on desktop and silently falls back to
# WebView2's system TTS, which is why the male voice previously only worked
# on Android (its build script copies "assets" separately via cap sync).
ASSETS = ["index.html", "manifest.json", "sw.js", "css", "js", "icons", "assets"]


def main():
    staging = os.path.join(DESKTOP, "_webapp")
    if os.path.exists(staging):
        shutil.rmtree(staging)
    os.makedirs(staging)

    for item in ASSETS:
        src = os.path.join(ROOT, item)
        dst = os.path.join(staging, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        elif os.path.exists(src):
            shutil.copy2(src, dst)
        else:
            print(f"  ! missing asset, skipped: {item}")

    sep = ";" if os.name == "nt" else ":"
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--onefile", "--windowed",
        "--name", NAME,
        "--distpath", os.path.join(ROOT, "dist"),
        "--workpath", os.path.join(DESKTOP, "build"),
        "--specpath", DESKTOP,
        "--add-data", f"{staging}{sep}webapp",
        "--icon", os.path.join(ROOT, "icons", "app.ico"),
        # PyInstaller cannot see these through the tray/notification code paths,
        # which import them lazily inside functions.
        "--hidden-import", "pystray._win32",
        "--hidden-import", "win11toast",
        "--hidden-import", "prayer_service",
        "--paths", DESKTOP,
        os.path.join(DESKTOP, "main.py"),
    ]
    print("Running:", " ".join(cmd))
    rc = subprocess.call(cmd)
    shutil.rmtree(staging, ignore_errors=True)

    if rc == 0:
        exe = os.path.join(ROOT, "dist", NAME + ".exe")
        size = os.path.getsize(exe) / (1024 * 1024)
        print(f"\nBuilt: {exe}  ({size:.1f} MB)")
    sys.exit(rc)


if __name__ == "__main__":
    main()
