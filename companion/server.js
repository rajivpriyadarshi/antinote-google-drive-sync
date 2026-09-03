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

function page(message) {
  const config = loadConfig();
  const roots = googleDriveRoots();
  const configured = isInsideGoogleDrive(config.folderPath);
  const status = configured ? "Ready to sync" : roots.length ? "Choose a folder to continue" : "Google Drive for desktop not found";
  const detail = configured
    ? config.folderPath
    : roots.length ? "Your Google Drive account is available." : "Install Google Drive for desktop and sign in, then refresh this page.";

  return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>Antinote Drive Sync</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;background:#f4f1e8;color:#20221e;margin:0}main{max-width:700px;margin:9vh auto;padding:32px}h1{font-size:44px;letter-spacing:-2px;line-height:1.05;margin:0 0 12px}.lead{font-size:19px;color:#68685f}.panel{background:#fffdf7;border:1px solid #d8d2c3;border-radius:18px;padding:26px;margin-top:28px}.status{font-size:24px;font-weight:750;color:" + (configured ? "#1f6b45" : "#9b3c2d") + "}.path{padding:13px 15px;background:#efede5;border-radius:9px;overflow-wrap:anywhere}.button{display:inline-block;background:#1f5c45;color:white;border-radius:999px;padding:12px 19px;margin-top:18px;text-decoration:none;font-weight:700}.notice{background:#e7f3e8;border-radius:10px;padding:12px 14px}.muted{color:#68685f}@media(max-width:600px){main{margin:2vh auto;padding:22px}h1{font-size:36px}}</style></head><body><main>" +
    "<h1>Antinote Drive Sync</h1><p class='lead'>Choose a folder once. Sync notes with <code>::drive_sync()</code>.</p>" +
    (message ? "<p class='notice'>" + escapeHTML(message) + "</p>" : "") +
    "<section class='panel'><div class='status'>" + escapeHTML(status) + "</div><p class='path'>" + escapeHTML(detail) + "</p>" +
    (roots.length ? "<a class='button' href='/choose-folder'>" + (configured ? "Change folder" : "Choose Google Drive folder") + "</a>" : "<a class='button' href='https://www.google.com/drive/download/'>Install Google Drive</a>") +
    "<p class='muted'>No Google Cloud project, OAuth client ID, or client secret is needed. Files are written locally and Google Drive syncs them normally.</p></section>" +
    "</main></body></html>";
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
