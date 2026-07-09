' ─────────────────────────────────────────────────────────────────────
'  Noto — silent launcher.  No console window.
'  Starts the local app server (if it isn't already running), waits until
'  it actually answers, then opens Noto in its own app window.
'  Everything stays on this machine.
' ─────────────────────────────────────────────────────────────────────

Option Explicit
Dim fso, shell, root, url, i, exe, browsers, http, ready

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Repo root = the folder that contains this launcher\ folder.
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
url = "http://localhost:4173"

' 1) Build once if the app was never built (hidden, and we wait for it).
If Not fso.FileExists(root & "\dist\index.html") Then
  shell.Run "cmd /c cd /d """ & root & """ && npm run build", 0, True
End If

' 2) Serve the built app, hidden — cd explicitly (don't trust CurrentDirectory).
'    Harmless if the port is already being served.
shell.Run "cmd /c cd /d """ & root & """ && npm run serve", 0, False

' 3) Wait until the server actually answers (up to ~25s) so the window never
'    opens on a dead port — this is what "can't be reached" was.
ready = False
For i = 1 To 50
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 800, 800, 800, 800
  http.open "GET", url, False
  http.send
  If Err.Number = 0 And http.Status = 200 Then ready = True
  On Error GoTo 0
  If ready Then Exit For
  WScript.Sleep 500
Next

' 4) Open Noto in app-mode (its own chromeless window) using whichever
'    Chromium browser is installed; fall back to the default browser.
Dim la, pf, pf86
la   = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
pf   = shell.ExpandEnvironmentStrings("%ProgramFiles%")
pf86 = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")

browsers = Array( _
  la   & "\BraveSoftware\Brave-Browser\Application\brave.exe", _
  pf   & "\BraveSoftware\Brave-Browser\Application\brave.exe", _
  pf86 & "\BraveSoftware\Brave-Browser\Application\brave.exe", _
  pf   & "\Google\Chrome\Application\chrome.exe", _
  pf86 & "\Google\Chrome\Application\chrome.exe", _
  la   & "\Google\Chrome\Application\chrome.exe", _
  pf86 & "\Microsoft\Edge\Application\msedge.exe", _
  pf   & "\Microsoft\Edge\Application\msedge.exe" )

exe = ""
For i = 0 To UBound(browsers)
  If fso.FileExists(browsers(i)) Then
    exe = browsers(i)
    Exit For
  End If
Next

If exe <> "" Then
  shell.Run """" & exe & """ --app=" & url, 1, False
Else
  shell.Run "cmd /c start """" " & url, 0, False
End If
