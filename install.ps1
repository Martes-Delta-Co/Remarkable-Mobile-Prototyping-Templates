# One-step installer (Windows PowerShell): downloads templates from GitHub and
# copies them to a USB-connected reMarkable. See README / INSTALL guides first.
#   powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"
$Repo   = if ($env:REPO)   { $env:REPO }   else { "YOURNAME/remarkable-mobile-ux-templates" }  # <-- CHANGE
$Branch = if ($env:BRANCH) { $env:BRANCH } else { "main" }
$IP     = if ($env:IP)     { $env:IP }     else { "10.11.99.1" }
$Dest   = "/home/root/.local/share/remarkable/xochitl/"
$opts   = @("-o","StrictHostKeyChecking=no","-o","UserKnownHostsFile=NUL")

Write-Host "reMarkable UX Templates - installer"
Write-Host "  repo:   $Repo ($Branch)"
Write-Host "  device: $IP (over USB)`n"
Write-Host "Make sure: device on USB; (Paper Pro) Developer Mode on; and have the SSH password"
Write-Host "from Settings > General > Help > About > Copyrights and licenses > 'GPLv3 Compliance'."
Read-Host "Press Enter to continue (Ctrl-C to cancel)"

$tmp = Join-Path $env:TEMP ("rmux_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "Downloading templates from GitHub..."
  Invoke-WebRequest "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile "$tmp\repo.zip"
  Expand-Archive "$tmp\repo.zip" -DestinationPath "$tmp\x"
  $tf = Get-ChildItem -Recurse -Filter "uxtpl_*.template" "$tmp\x" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $tf) { throw "No templates found in $Repo ($Branch). Check the repo name." }
  $src = $tf.DirectoryName
  $names = (Get-ChildItem "$src\uxtpl_*").Name
  Write-Host ("Found {0} templates." -f (Get-ChildItem "$src\uxtpl_*.template").Count)
  tar -cf "$tmp\uxtpl.tar" -C "$src" @names
  Write-Host "Copying to device (enter the device password when asked)..."
  scp -O @opts "$tmp\uxtpl.tar" "root@${IP}:/tmp/uxtpl.tar"
  Write-Host "Installing + restarting (enter the password again if asked)..."
  ssh @opts "root@$IP" "rm -rf ${Dest}uxtpl_* ; mkdir -p '$Dest' ; tar xf /tmp/uxtpl.tar -C '$Dest' ; rm -f /tmp/uxtpl.tar ; systemctl restart xochitl"
  Write-Host "`nDone! On the tablet: New page -> Template (look for '1UP COL iPhone', etc.)."
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
