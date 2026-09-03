# Antinote Google Drive Sync

Back up the current [Antinote](https://antinote.io/) note to a folder in Google Drive with one command.

This project uses Google Drive for desktop instead of the Google Drive API. You do not need a Google Cloud project, OAuth client ID, client secret, or API key.

## How it works

1. The Antinote extension sends the current note to a helper running locally on your Mac.
2. The helper writes a Markdown file into the Google Drive folder you selected.
3. Google Drive for desktop performs the cloud sync.

The helper listens only on `127.0.0.1`. It refuses to write outside a mounted Google Drive folder and uses an atomic file replacement to avoid partially written notes.

## Requirements

- macOS 14 or newer
- Antinote 2.0 or newer
- [Google Drive for desktop](https://www.google.com/drive/download/) installed and signed in
- [Node.js 18 or newer](https://nodejs.org/)

## Installation

### 1. Download the release

Download `Antinote-Google-Drive-Sync.zip` from the [latest release](https://github.com/rajivpriyadarshi/antinote-google-drive-sync/releases/latest) and extract it.

### 2. Run the installer

Double-click `install.command`.

If macOS blocks it, Control-click `install.command`, choose **Open**, then confirm **Open**.

The installer:

- installs the Antinote extension in `~/Library/Application Support/Antinote/Extensions/drive_sync`;
- installs the local helper in `~/Library/Application Support/Antinote Drive Sync`;
- starts the helper automatically at login;
- opens the folder setup page.

### 3. Choose the destination folder

On the setup page, click **Choose Google Drive folder** and select the folder that should contain your notes.

The folder must be inside Google Drive for desktop. You can create a new folder in Finder first if needed.

### 4. Load the extension in Antinote

1. Open **Antinote > Settings > Extensions**.
2. Turn on **Enable extensions**.
3. Under **Custom Extensions**, click **Choose Folder**.
4. Press `Command-Shift-G`, enter `~/Library/Application Support/Antinote/Extensions`, and press Return.
5. Click **Choose Extensions Folder**.
6. Click **Reload Extensions**.
7. Confirm that **drive_sync, 2 commands** appears under Loaded Extensions.

Antinote's default Extensions folder is protected by the macOS sandbox. Selecting the user-accessible folder above is required for manually installed extensions.

### 5. Allow the local connection

Open **Antinote > Settings > Privacy** and enable **Let extensions call their own APIs**. The only endpoint declared by this extension is `http://127.0.0.1:48731` on your Mac.

## Usage

Type a command in an Antinote note and press Return:

```text
::drive_sync()
```

The first non-empty line becomes the filename. For example, a note beginning with `# Project ideas` is stored as `Project ideas.md`.

Set an explicit filename when needed:

```text
::drive_sync(Weekly review)
```

Run the same command again to update the existing file with that name.

Open or change the destination folder with:

```text
::drive_setup()
```

## Privacy and security

- Notes are not sent to this project, its author, or a hosted server.
- No Google credentials are collected or stored.
- The helper binds only to the local loopback address.
- The helper only accepts folders inside `~/Library/CloudStorage/GoogleDrive-*`.
- Notes remain subject to your Google Drive account's normal security and sharing settings.

## Limitations

- Sync is manual because Antinote extensions do not receive background note-change events.
- Notes with the same generated filename update the same Drive file. Use an explicit filename to distinguish them.
- Google Drive for desktop must be running for changes to reach the cloud.
- This release supports macOS only.

## Troubleshooting

### The command does not appear

Open **Settings > Extensions** and confirm:

- extensions are enabled;
- the selected folder is `~/Library/Application Support/Antinote/Extensions`;
- **drive_sync, 2 commands** appears under Loaded Extensions.

Then click **Reload Extensions** and type `::drive_sync` without the parentheses to find it in autocomplete.

### The helper is not running

Run:

```bash
launchctl kickstart -k gui/$(id -u)/io.antinote.drive-sync
```

Logs are stored in `~/Library/Application Support/Antinote Drive Sync/`.

### Google Drive is not detected

Open Google Drive for desktop, sign in, and confirm your Drive appears in Finder under **Locations**. Then reopen `http://127.0.0.1:48731`.

## Uninstall

Double-click `uninstall.command`. It stops the helper and removes only this extension, its helper, and its launch agent. Your synced Markdown files remain in Google Drive.

## Development

Run the helper tests:

```bash
cd companion
npm test
```

The extension metadata and command tests are compatible with the validation tools in the [Antinote extensions repository](https://github.com/johnsonfung/antinote-extensions).

## License

[MIT](LICENSE)
