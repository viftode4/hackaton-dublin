# Save clipboard image to docs/screenshots/
# Triggered by Claude Code UserPromptSubmit hook
# Saves whenever the clipboard contains an image

param()

Add-Type -AssemblyName System.Windows.Forms

# Read hook input from stdin
$input_json = $null
try {
    $input_json = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    # No input or invalid JSON - continue anyway
}

# Check if clipboard has an image
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $img) {
    exit 0
}

# Determine project root from cwd or fallback
$projectRoot = if ($input_json -and $input_json.cwd) { $input_json.cwd } else { $PSScriptRoot | Split-Path | Split-Path }
$screenshotsDir = Join-Path $projectRoot "docs\screenshots"

# Create directory if needed
if (-not (Test-Path $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
}

# Generate filename from timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$filename = "screenshot_$timestamp.png"
$filepath = Join-Path $screenshotsDir $filename

# Save the image
$img.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()

# Output context for Claude so it knows the file was saved
$result = @{
    additionalContext = "Screenshot saved from clipboard to: docs/screenshots/$filename ($('{0:N0}' -f ((Get-Item $filepath).Length / 1KB)) KB). You can reference this file in READMEs."
} | ConvertTo-Json

Write-Output $result
exit 0
