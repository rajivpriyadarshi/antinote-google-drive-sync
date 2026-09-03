#!/bin/zsh
set -euo pipefail

APP_DIR="$HOME/Library/Application Support/Antinote Drive Sync"
EXTENSION_DIR="$HOME/Library/Application Support/Antinote/Extensions/drive_sync"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/io.antinote.drive-sync.plist"

launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT" >/dev/null 2>&1 || true
/bin/rm -f "$LAUNCH_AGENT"
/bin/rm -rf "$APP_DIR"
/bin/rm -rf "$EXTENSION_DIR"

echo "Antinote Google Drive Sync was removed."
echo "Your Markdown files in Google Drive were not changed."
echo "Click Reload Extensions in Antinote to remove the commands from autocomplete."
