# Google Drive Sync for Antinote

This Antinote extension sends the current note to a folder inside Google Drive for desktop. Choose the folder once, and Google Drive handles cloud syncing normally.

Commands:

- `::drive_sync()` syncs the note using its first non-empty line as the filename.
- `::drive_sync(Project ideas)` uses `Project ideas.md` as the filename.
- `::drive_setup()` opens the companion's setup page.

The command updates an existing file with the same name in the selected folder. It does not require Google developer credentials, delete Drive files, or modify the note.
