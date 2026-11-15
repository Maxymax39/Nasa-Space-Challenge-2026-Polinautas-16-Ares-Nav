# Static file server for local use on Windows. Needs nothing but PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 [-Port 5173] [-Open]
#
# If the port is taken we walk up to the next free one (up to +9) instead of
# dying, because the usual cause is a previous copy still running.
param([int]$Port = 5173, [switch]$Open)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.mp3' = 'audio/mpeg'; '.ico' = 'image/x-icon'
}

$listener = $null
foreach ($candidate in $Port..($Port + 9)) {
  $try = New-Object System.Net.HttpListener
  $try.Prefixes.Add("http://localhost:$candidate/")
  try {
    $try.Start()
    $listener = $try
    if ($candidate -ne $Port) { Write-Host "Puerto $Port ocupado; usando $candidate." }
    $Port = $candidate
    break
  } catch {
    $try.Close()
  }
}
if (-not $listener) {
  Write-Host "No hay ningun puerto libre entre $Port y $($Port + 9). Cierra otras copias de ARES-NAV e intenta de nuevo."
  exit 1
}

$url = "http://localhost:$Port/"
Write-Host "ARES-NAV en $url  (Ctrl+C para detener)"
if ($Open) { Start-Process $url }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      # GetFullPath collapses any "..", so this check keeps requests inside the project
      if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        Write-Host "404  /$rel"
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
