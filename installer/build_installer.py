"""
Build the Windows installer.

    python installer/build_installer.py            # build exe first, then installer
    python installer/build_installer.py --no-exe   # installer only, reuse dist/

Produces installer/output/MushafMurattal-Setup.exe
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INSTALLER = os.path.join(ROOT, "installer")
STAGE = os.path.join(INSTALLER, "stage")
ISS = os.path.join(INSTALLER, "setup.iss")
EXE = os.path.join(ROOT, "dist", "MushafMurattal.exe")
ICON = os.path.join(ROOT, "icons", "app.ico")

# Inno Setup does not put ISCC on PATH, so check the usual install locations.
ISCC_CANDIDATES = [
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
    r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    r"C:\Program Files\Inno Setup 6\ISCC.exe",
]


def find_iscc() -> str:
    for path in ISCC_CANDIDATES:
        if os.path.exists(path):
            return path
    raise SystemExit(
        "ISCC.exe not found. Install Inno Setup:\n"
        "    winget install --id JRSoftware.InnoSetup"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-exe", action="store_true", help="skip rebuilding the exe")
    args = ap.parse_args()

    if not args.no_exe:
        print("== building the application exe ==")
        rc = subprocess.call([sys.executable, os.path.join(ROOT, "desktop", "build_exe.py")])
        if rc != 0:
            raise SystemExit("exe build failed")

    if not os.path.exists(EXE):
        raise SystemExit(f"missing {EXE} - run desktop/build_exe.py first")
    if not os.path.exists(ICON):
        raise SystemExit(f"missing {ICON} - this script needs the full project tree, not just installer/")

    # setup.iss deliberately references only files under installer/stage/, so it
    # compiles even if someone opens it (or copies the installer/ folder) without
    # the rest of the project alongside it - that mismatch is what produced the
    # "system cannot find the path specified" error on a machine that only had
    # the installer folder.
    print("== staging files for the installer ==")
    os.makedirs(STAGE, exist_ok=True)
    shutil.copy2(EXE, os.path.join(STAGE, "MushafMurattal.exe"))
    shutil.copy2(ICON, os.path.join(STAGE, "app.ico"))

    iscc = find_iscc()
    print(f"== compiling installer with {iscc} ==")
    rc = subprocess.call([iscc, ISS], cwd=INSTALLER)
    shutil.rmtree(STAGE, ignore_errors=True)
    if rc != 0:
        raise SystemExit("installer compilation failed")

    out = os.path.join(INSTALLER, "output", "MushafMurattal-Setup.exe")
    size = os.path.getsize(out) / (1024 * 1024)
    print(f"\nInstaller ready: {out}  ({size:.1f} MB)")


if __name__ == "__main__":
    main()
