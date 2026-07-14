param(
  [string]$AndroidRoot = (Join-Path $PSScriptRoot "..\android")
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$brand = [System.Drawing.ColorTranslator]::FromHtml("#0B6B3A")
$accent = [System.Drawing.ColorTranslator]::FromHtml("#35A668")
$canvas = [System.Drawing.ColorTranslator]::FromHtml("#F2F5F3")
$ink = [System.Drawing.ColorTranslator]::FromHtml("#19211D")
$white = [System.Drawing.Color]::White
$transparent = [System.Drawing.Color]::Transparent
$resRoot = Join-Path $AndroidRoot "app\src\main\res"

function Get-ImageSize([string]$Path) {
  $source = [System.Drawing.Image]::FromFile($Path)
  try { return @($source.Width, $source.Height) } finally { $source.Dispose() }
}

function New-Canvas([int]$Width, [int]$Height, [System.Drawing.Color]$Background) {
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear($Background)
  return @($bitmap, $graphics)
}

function Draw-CenteredText($Graphics, [string]$Text, [System.Drawing.RectangleF]$Bounds, [float]$Size, [System.Drawing.Color]$Color, [System.Drawing.FontStyle]$Style) {
  $font = [System.Drawing.Font]::new("Segoe UI", $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new($Color)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
  try { $Graphics.DrawString($Text, $font, $brush, $Bounds, $format) }
  finally { $format.Dispose(); $brush.Dispose(); $font.Dispose() }
}

function Save-Launcher([string]$Path, [bool]$Foreground, [bool]$Round) {
  $size = Get-ImageSize $Path
  $pair = New-Canvas $size[0] $size[1] ($(if ($Foreground -or $Round) { $transparent } else { $brand }))
  $bitmap, $graphics = $pair
  try {
    [float]$w = $size[0]; [float]$h = $size[1]
    if ($Round) {
      $brush = [System.Drawing.SolidBrush]::new($brand)
      try { $graphics.FillEllipse($brush, 0, 0, $w, $h) } finally { $brush.Dispose() }
    }
    $left = if ($Foreground) { $w * 0.27 } else { $w * 0.12 }
    $top = if ($Foreground) { $h * 0.34 } else { $h * 0.17 }
    $width = if ($Foreground) { $w * 0.46 } else { $w * 0.76 }
    $height = if ($Foreground) { $h * 0.32 } else { $h * 0.66 }
    $bar = [System.Drawing.SolidBrush]::new($accent)
    try { $graphics.FillRectangle($bar, $left, $top + $height * 0.12, [Math]::Max(2, $width * 0.055), $height * 0.76) } finally { $bar.Dispose() }
    $textBounds = [System.Drawing.RectangleF]::new([float]($left + $width * 0.08), [float]$top, [float]($width * 0.92), [float]$height)
    Draw-CenteredText $graphics "STS" $textBounds ($height * 0.43) $white ([System.Drawing.FontStyle]::Bold)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}

function Save-Splash([string]$Path) {
  $size = Get-ImageSize $Path
  $pair = New-Canvas $size[0] $size[1] $canvas
  $bitmap, $graphics = $pair
  try {
    [float]$w = $size[0]; [float]$h = $size[1]; [float]$short = [Math]::Min($w, $h)
    $mark = $short * 0.22; $x = ($w - $mark) / 2; $y = ($h - $mark) / 2 - $short * 0.09
    $brandBrush = [System.Drawing.SolidBrush]::new($brand)
    $accentBrush = [System.Drawing.SolidBrush]::new($accent)
    try {
      $graphics.FillRectangle($brandBrush, $x, $y, $mark, $mark)
      $graphics.FillRectangle($accentBrush, $x + $mark * 0.12, $y + $mark * 0.2, [Math]::Max(2, $mark * 0.055), $mark * 0.6)
    } finally { $brandBrush.Dispose(); $accentBrush.Dispose() }
    $markText = [System.Drawing.RectangleF]::new([float]($x + $mark * 0.12), [float]$y, [float]($mark * 0.84), [float]$mark)
    Draw-CenteredText $graphics "STS" $markText ($mark * 0.32) $white ([System.Drawing.FontStyle]::Bold)
    $title = [System.Drawing.RectangleF]::new(0, [float]($y + $mark + $short * 0.035), $w, [float]($short * 0.08))
    Draw-CenteredText $graphics "STS GEOFLOW" $title ($short * 0.045) $ink ([System.Drawing.FontStyle]::Bold)
    $sub = [System.Drawing.RectangleF]::new(0, [float]($y + $mark + $short * 0.095), $w, [float]($short * 0.055))
    Draw-CenteredText $graphics "FIELD WORKSPACE" $sub ($short * 0.022) $brand ([System.Drawing.FontStyle]::Regular)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}

Get-ChildItem -Path $resRoot -Recurse -Filter "ic_launcher*.png" | ForEach-Object {
  Save-Launcher $_.FullName ($_.BaseName -eq "ic_launcher_foreground") ($_.BaseName -eq "ic_launcher_round")
}
Get-ChildItem -Path $resRoot -Recurse -Filter "splash.png" | ForEach-Object { Save-Splash $_.FullName }

Write-Host "Generated STS GeoFlow Android launcher and splash assets."
