$ErrorActionPreference = 'Stop'
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
    $entryPath = Join-Path $PSScriptRoot 'main-entry.md'
    $content = [System.IO.File]::ReadAllText($entryPath, [System.Text.Encoding]::UTF8)
    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'UserPromptSubmit'
            additionalContext = "Current instructions from AI/main-entry.md (reloaded for this message):`n`n$content"
        }
    }
    [Console]::WriteLine(($output | ConvertTo-Json -Depth 3 -Compress))
} catch {
    [Console]::Error.WriteLine("Could not read AI/main-entry.md: $($_.Exception.Message)")
    exit 2
}
