# Creates a "Noto" shortcut (with the Noto icon) on your Desktop.
# The shortcut runs the silent launcher — double-clicking it opens Noto in
# its own window with NO console. Run once, via "Install Noto.bat".

$dir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$vbs     = Join-Path $dir 'Noto.vbs'
$ico     = Join-Path $dir 'noto.ico'

$sh  = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path $desktop 'Noto.lnk'))
$lnk.TargetPath       = 'wscript.exe'
$lnk.Arguments        = '"' + $vbs + '"'
$lnk.IconLocation     = $ico
$lnk.WorkingDirectory = $dir
$lnk.Description       = 'Noto - notes that stay'
$lnk.WindowStyle      = 7           # launch wscript minimized (no flash)
$lnk.Save()

Write-Host ''
Write-Host '  Done. "Noto" is now on your Desktop.' -ForegroundColor Green
Write-Host '  Double-click it to launch the app (no console window).'
Write-Host '  Tip: right-click it -> Pin to Start / Pin to taskbar.'
Write-Host ''
