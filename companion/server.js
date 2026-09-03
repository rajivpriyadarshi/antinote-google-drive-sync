"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {spawnSync} = require("child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ANTINOTE_DRIVE_SYNC_PORT || 48731);
const APP_HOME = process.env.ANTINOTE_DRIVE_SYNC_HOME || path.join(os.homedir(), "Library", "Application Support", "Antinote Drive Sync");
const CLOUD_ROOT = process.env.ANTINOTE_DRIVE_SYNC_CLOUD_ROOT || path.join(os.homedir(), "Library", "CloudStorage");
const CONFIG_PATH = path.join(APP_HOME, "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    return {folderPath: ""};
  }
}

function saveConfig(config) {
  fs.mkdirSync(APP_HOME, {recursive: true, mode: 0o700});
  const temporaryPath = CONFIG_PATH + ".tmp";
  fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + "\n", {mode: 0o600});
  fs.renameSync(temporaryPath, CONFIG_PATH);
}

function sanitizeFilename(title) {
  const base = String(title || "Untitled note")
    .replace(/[\\/:?*\"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120) || "Untitled note";
  return /\.md$/i.test(base) ? base : base + ".md";
}

function googleDriveRoots() {
  try {
    return fs.readdirSync(CLOUD_ROOT, {withFileTypes: true})
      .filter(function (entry) { return entry.isDirectory() && /^GoogleDrive-/i.test(entry.name); })
      .map(function (entry) { return path.join(CLOUD_ROOT, entry.name); });
  } catch (error) {
    return [];
  }
}

function realPathIfPresent(value) {
  try { return fs.realpathSync(value); } catch (error) { return ""; }
}

function isInsideGoogleDrive(folderPath) {
  const selected = realPathIfPresent(folderPath);
  if (!selected) return false;
  return googleDriveRoots().some(function (root) {
    const resolvedRoot = realPathIfPresent(root);
    return resolvedRoot && (selected === resolvedRoot || selected.startsWith(resolvedRoot + path.sep));
  });
}

function chooseGoogleDriveFolder() {
  const roots = googleDriveRoots();
  if (!roots.length) throw new Error("Google Drive for desktop was not found. Install it and sign in first.");

  const config = loadConfig();
  const startingFolder = isInsideGoogleDrive(config.folderPath) ? config.folderPath : roots[0];
  const script = [
    "on run argv",
    "set startFolder to POSIX file (item 1 of argv) as alias",
    "set pickedFolder to choose folder with prompt \"Choose where Antinote notes should sync\" default location startFolder",
    "return POSIX path of pickedFolder",
    "end run"
  ].join("\n");
  const result = spawnSync("/usr/bin/osascript", ["-e", script, startingFolder], {encoding: "utf8"});

  if (result.status !== 0) {
    if (/User canceled/i.test(result.stderr || "")) return "";
    throw new Error("The folder picker could not be opened.");
  }

  const selected = result.stdout.trim().replace(/\/$/, "");
  if (!isInsideGoogleDrive(selected)) throw new Error("Choose a folder inside Google Drive.");
  saveConfig({folderPath: selected});
  return selected;
}

function syncNote(title, content) {
  const config = loadConfig();
  const folderPath = config.folderPath || "";
  if (!isInsideGoogleDrive(folderPath)) throw new Error("Choose a Google Drive folder first. Run ::drive_setup().");
  if (!String(content || "").trim()) throw new Error("There is no note content to sync.");

  const name = sanitizeFilename(title);
  const targetPath = path.join(folderPath, name);
  const existed = fs.existsSync(targetPath);
  const temporaryPath = path.join(folderPath, ".antinote-" + crypto.randomBytes(10).toString("hex") + ".tmp");

  try {
    fs.writeFileSync(temporaryPath, String(content), {encoding: "utf8", mode: 0o600});
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }

  return {ok: true, action: existed ? "updated" : "created", name: name};
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>\"]/g, function (character) {
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[character];
  });
}

function displayPath(value) {
  const home = os.homedir();
  const shortened = value === home ? "~" : value.startsWith(home + path.sep) ? "~" + value.slice(home.length) : value;
  return shortened.replace(/^~\/Library\/CloudStorage\/GoogleDrive-[^/]+\/My Drive/, "Google Drive");
}

function page(message) {
  const config = loadConfig();
  const roots = googleDriveRoots();
  const configured = isInsideGoogleDrive(config.folderPath);
  const status = configured ? "Ready to sync" : roots.length ? "Choose a folder to continue" : "Google Drive for desktop not found";
  const detail = configured
    ? displayPath(config.folderPath)
    : roots.length ? "Your Google Drive account is available." : "Install Google Drive for desktop and sign in, then refresh this page.";
  const action = roots.length
    ? "<a class='button' href='/choose-folder'>" + (configured ? "Change folder" : "Choose Google Drive folder") + "</a>"
    : "<a class='button' href='https://www.google.com/drive/download/'>Install Google Drive</a>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Antinote Drive Sync</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f5f3ee;
      --ink: #171717;
      --note: #1a1a1a;
      --note-edge: #343434;
      --muted: #929292;
      --mint: #39eba6;
      --orange: #d93900;
      --grid: rgba(23, 23, 23, .055);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      overflow-x: hidden;
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
      background-color: var(--paper);
      background-image:
        linear-gradient(var(--grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--grid) 1px, transparent 1px);
      background-size: 28px 28px;
    }
    main {
      width: min(920px, calc(100% - 40px));
      margin: 0 auto;
      padding: clamp(40px, 8vh, 88px) 0 56px;
    }
    .masthead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .16em;
    }
    .mark {
      position: relative;
      width: 38px;
      height: 38px;
      overflow: hidden;
      border-radius: 10px;
      background: var(--mint);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.48);
    }
    .mark::before {
      content: "";
      position: absolute;
      width: 20px;
      height: 20px;
      left: 9px;
      top: 9px;
      border: 2px solid rgba(255,255,255,.75);
      border-radius: 50%;
    }
    .mark::after {
      content: "";
      position: absolute;
      width: 24px;
      height: 24px;
      right: -2px;
      bottom: -4px;
      border: 3px solid rgba(255,255,255,.72);
      border-radius: 7px;
      transform: rotate(45deg);
    }
    .local-pill {
      padding: 7px 10px 6px;
      border: 1px solid rgba(23,23,23,.2);
      border-radius: 999px;
      font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .intro { max-width: 720px; margin-bottom: 34px; }
    h1 {
      margin: 0;
      font-size: clamp(43px, 7vw, 72px);
      font-weight: 800;
      letter-spacing: -.065em;
      line-height: .96;
    }
    .lead {
      margin: 18px 0 0;
      color: #5e5e59;
      font-size: clamp(18px, 2.5vw, 23px);
      letter-spacing: -.025em;
    }
    code, .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { color: var(--orange); font-size: .9em; font-weight: 700; }
    .note {
      position: relative;
      overflow: hidden;
      min-height: 430px;
      padding: 30px clamp(25px, 5vw, 54px) 38px;
      color: #f7f7f4;
      background: var(--note);
      border: 1px solid var(--note-edge);
      border-radius: 22px;
      box-shadow: 0 24px 70px rgba(23,23,23,.18), 0 2px 4px rgba(23,23,23,.18);
    }
    .note::after {
      content: "";
      position: absolute;
      top: 22px;
      right: 7px;
      width: 4px;
      height: 76px;
      border-radius: 99px;
      background: var(--orange);
    }
    .window-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid #303030;
      color: #757575;
      font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .09em;
      text-transform: uppercase;
    }
    .dots { display: flex; gap: 7px; }
    .dots i { width: 8px; height: 8px; border-radius: 50%; background: #3b3b3b; }
    .dots i:first-child { background: var(--orange); }
    .notice {
      margin: 24px 0 0;
      padding: 13px 16px;
      border: 1px solid rgba(57,235,166,.32);
      border-radius: 10px;
      color: var(--mint);
      background: rgba(57,235,166,.08);
      font: 600 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 32px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: ${configured ? "var(--mint)" : "var(--orange)"};
      box-shadow: 0 0 0 5px ${configured ? "rgba(57,235,166,.11)" : "rgba(217,57,0,.14)"};
    }
    .status {
      color: ${configured ? "var(--mint)" : "#ff7043"};
      font: 650 clamp(20px, 3vw, 27px)/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: -.035em;
    }
    .path {
      margin: 23px 0 0;
      padding: 17px 18px;
      overflow-wrap: anywhere;
      border: 1px solid #353535;
      border-radius: 11px;
      color: #d9d9d3;
      background: #222;
      font-size: 14px;
      line-height: 1.55;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-top: 28px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      min-height: 46px;
      padding: 0 19px;
      border-radius: 9px;
      color: #10241d;
      background: var(--mint);
      text-decoration: none;
      font-size: 15px;
      font-weight: 800;
      box-shadow: inset 0 -2px rgba(0,0,0,.13);
      transition: transform 150ms ease, filter 150ms ease;
    }
    .button::after { content: "↗"; margin-left: 10px; font-size: 17px; }
    .button:hover { filter: brightness(1.06); transform: translateY(-2px); }
    .button:active { transform: translateY(0); }
    .privacy { color: #777; font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      margin-top: 24px;
      color: #74746e;
      font-size: 13px;
    }
    .footer strong { color: #41413d; }
    @media (max-width: 620px) {
      main { width: calc(100% - 24px); padding-top: 24px; }
      .masthead { margin-bottom: 38px; }
      .local-pill { display: none; }
      .note { width: 100%; min-width: 0; min-height: 0; padding: 22px 20px 28px; border-radius: 18px; }
      .actions, .footer { align-items: flex-start; flex-direction: column; }
      .actions { min-width: 0; }
      .button { width: auto; max-width: 100%; }
      .privacy { overflow-wrap: anywhere; }
    }
    @media (prefers-reduced-motion: reduce) { .button { transition: none; } }
  </style>
</head>
<body>
  <main>
    <header class="masthead">
      <div class="brand"><span class="mark" aria-hidden="true"></span><span>ANTINOTE / DRIVE</span></div>
      <span class="local-pill">Local companion</span>
    </header>
    <section class="intro">
      <h1>Your notes.<br>Now with a way out.</h1>
      <p class="lead">Pick a folder once. Send the current note with <code>::drive_sync()</code>.</p>
    </section>
    <section class="note">
      <div class="window-bar"><span>Google Drive</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
      ${message ? "<p class='notice'>" + escapeHTML(message) + "</p>" : ""}
      <div class="status-row"><span class="status-dot" aria-hidden="true"></span><div class="status">${escapeHTML(status)}</div></div>
      <p class="path">${escapeHTML(detail)}</p>
      <div class="actions">${action}<span class="privacy">no account · no oauth · stays local</span></div>
    </section>
    <footer class="footer"><span><strong>Plain text in.</strong> Markdown out.</span><span>Google Drive handles the rest.</span></footer>
  </main>
</body>
</html>`;
}

function readBody(request, limit) {
  return new Promise(function (resolve, reject) {
    let body = "";
    request.on("data", function (chunk) {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", function () { resolve(body); });
    request.on("error", reject);
  });
}

function send(response, status, contentType, body) {
  response.writeHead(status, {"Content-Type": contentType, "Cache-Control": "no-store"});
  response.end(body);
}

async function handle(request, response) {
  const url = new URL(request.url, "http://" + HOST + ":" + PORT);
  try {
    if (request.method === "GET" && url.pathname === "/") return send(response, 200, "text/html; charset=utf-8", page(url.searchParams.get("message") || ""));

    if (request.method === "GET" && url.pathname === "/choose-folder") {
      const selected = chooseGoogleDriveFolder();
      const message = selected ? "Folder selected. You can now sync from Antinote." : "Folder selection cancelled.";
      response.writeHead(303, {Location: "/?message=" + encodeURIComponent(message)});
      return response.end();
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const config = loadConfig();
      return send(response, 200, "application/json", JSON.stringify({ok: true, configured: isInsideGoogleDrive(config.folderPath), folderPath: config.folderPath || ""}));
    }

    if (request.method === "POST" && url.pathname === "/sync") {
      const payload = JSON.parse(await readBody(request, 5 * 1024 * 1024));
      return send(response, 200, "application/json", JSON.stringify(syncNote(payload.title, payload.content)));
    }

    send(response, 404, "application/json", JSON.stringify({ok: false, error: "Not found."}));
  } catch (error) {
    const wantsJSON = url.pathname === "/sync" || url.pathname === "/status";
    send(response, 400, wantsJSON ? "application/json" : "text/html; charset=utf-8", wantsJSON
      ? JSON.stringify({ok: false, error: error.message || "Request failed."})
      : page(error.message || "Request failed."));
  }
}

function start() {
  const server = http.createServer(handle);
  server.listen(PORT, HOST, function () { console.log("Antinote Drive Sync companion running at http://" + HOST + ":" + PORT); });
  return server;
}

if (require.main === module) start();

module.exports = {sanitizeFilename, googleDriveRoots, isInsideGoogleDrive, loadConfig, saveConfig, syncNote, handle, start};
