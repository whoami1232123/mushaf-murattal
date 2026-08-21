"""
Build a signed Android App Bundle (.aab) for Google Play.

    python scripts/build_android_release.py

Requires (one-time setup, already done on this machine):
  - JDK 17            (winget install --id EclipseAdoptium.Temurin.17.JDK)
  - Android SDK        platform-tools, platforms;android-34, build-tools;34.0.0
  - android/keystore/mushaf-release.jks + android/keystore.properties
    (see android/KEYSTORE_README.md - back this up, it is irreplaceable)

Every Play Store update needs a HIGHER versionCode than the last release.
Bump `versionCode` (and usually `versionName`) in android/app/build.gradle
before running this for a new release.

Output: android/app/build/outputs/bundle/release/app-release.aab
"""
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ANDROID_DIR = os.path.join(ROOT, "android")
AAB_OUT = os.path.join(ANDROID_DIR, "app", "build", "outputs", "bundle", "release", "app-release.aab")

JAVA_HOME = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot"
ANDROID_HOME = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk")


def main():
    if not os.path.exists(JAVA_HOME):
        raise SystemExit(f"JDK not found at {JAVA_HOME} - install Temurin 17 first")
    if not os.path.exists(os.path.join(ANDROID_DIR, "keystore.properties")):
        raise SystemExit(
            "android/keystore.properties missing - see android/KEYSTORE_README.md.\n"
            "Without it the build produces an UNSIGNED bundle Play Store will reject."
        )

    env = dict(os.environ)
    env["JAVA_HOME"] = JAVA_HOME
    env["ANDROID_HOME"] = ANDROID_HOME
    env["ANDROID_SDK_ROOT"] = ANDROID_HOME

    print("== staging web assets ==")
    rc = subprocess.call([sys.executable, "-c",
        "import subprocess,sys; sys.exit(subprocess.call(['node', 'scripts/prepare-www.mjs']))"],
        cwd=ROOT, env=env)
    if rc != 0:
        raise SystemExit("prepare-www failed")

    print("== syncing Capacitor (copies www/ into the Android project) ==")
    rc = subprocess.call(["npx", "cap", "sync", "android"], cwd=ROOT, env=env, shell=True)
    if rc != 0:
        raise SystemExit("cap sync failed")

    print("== building signed release bundle ==")
    gradlew = os.path.join(ANDROID_DIR, "gradlew.bat")
    rc = subprocess.call([gradlew, "bundleRelease", "--no-daemon"], cwd=ANDROID_DIR, env=env, shell=True)
    if rc != 0:
        raise SystemExit("gradle build failed")

    if not os.path.exists(AAB_OUT):
        raise SystemExit(f"build reported success but {AAB_OUT} is missing")

    size = os.path.getsize(AAB_OUT) / (1024 * 1024)
    print(f"\nSigned bundle ready: {AAB_OUT}  ({size:.1f} MB)")
    print("Upload this .aab file directly to Google Play Console.")


if __name__ == "__main__":
    main()
