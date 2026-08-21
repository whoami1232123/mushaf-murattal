; Inno Setup script for the Mushaf Murattal desktop app.
;
; Installs the single self-contained executable produced by desktop/build_exe.py
; into Program Files, with Start Menu and optional desktop shortcuts, an entry in
; Add/Remove Programs, and an Arabic-first wizard.
;
; Build with:  installer\build_installer.py
; Output:      installer\output\MushafMurattal-Setup.exe
;
; All [Files]/SetupIconFile sources point into .\stage\, which build_installer.py
; populates before compiling. Do NOT reference ..\dist or ..\icons directly here:
; this script must compile with only the "installer" folder present (e.g. if it
; is copied alone to a build machine, or opened directly in the Inno Setup IDE
; without the rest of the project tree alongside it).

#define MyAppName "المصحف المرتل"
#define MyAppNameEn "Mushaf Murattal"
#define MyAppVersion "1.0.0"
#define MyAppExeName "MushafMurattal.exe"

[Setup]
; A stable AppId is what lets a later version upgrade this install in place
; instead of appearing as a second program.
AppId={{7C4B1E92-3A6D-4F58-9B21-5E8D0A4C7F13}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
VersionInfoDescription={#MyAppNameEn} - Quran with Tajweed
VersionInfoVersion={#MyAppVersion}

DefaultDirName={autopf}\MushafMurattal
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
AllowNoIcons=yes

OutputDir=.\output
OutputBaseFilename=MushafMurattal-Setup
SetupIconFile=.\stage\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Per-user install by default needs no admin rights; the wizard offers both.
PrivilegesRequiredOverridesAllowed=dialog
PrivilegesRequired=lowest

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; README.md is deliberately not bundled: it is developer documentation, adds
; nothing at runtime, and a file left open in an Explorer preview pane or editor
; from browsing the install folder can lock it on reinstall/upgrade and abort
; the whole setup (observed as exit code 5, "user canceled").
Source: ".\stage\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; The WebView2 profile the app creates at runtime is not tracked by the
; installer, so remove it explicitly rather than leaving it behind.
Type: filesandordirs; Name: "{localappdata}\MushafMurattal"

[Code]
{ WebView2 renders the whole UI. It ships with Windows 10/11, but on an older or
  stripped image it can be missing - warn rather than install something broken. }
function IsWebView2Installed(): Boolean;
var
  Value: string;
begin
  Result :=
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Value) or
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Value) or
    RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Value);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  { A blocking confirmation MsgBox here is unsafe under /VERYSILENT: unlike the
    wizard's own dialogs, a MsgBox from [Code] is not suppressed by
    /SUPPRESSMSGBOXES, and its behavior when no one is present to click it is
    unreliable - it previously made silent installs abort with exit code 5
    (setup "cancelled"). WizardSilent() keeps this purely informational there,
    while an interactive install still gets the heads-up before proceeding. }
  if (not IsWebView2Installed()) and (not WizardSilent()) then
  begin
    MsgBox(
      'هذا التطبيق يحتاج إلى Microsoft Edge WebView2 وهو غير موجود على هذا الجهاز.' + #13#10 +
      'يتوفر مجاناً من مايكروسوفت وقد يثبَّت تلقائياً مع ويندوز 10/11.' + #13#10#13#10 +
      'سيتابع التثبيت الآن؛ إن لم يعمل التطبيق بعد التثبيت، نزّل WebView2 Runtime وأعد المحاولة.',
      mbInformation, MB_OK);
  end;
end;
