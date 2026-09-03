"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const testRoot = path.join(os.tmpdir(), "antinote-drive-sync-test-" + process.pid);
process.env.ANTINOTE_DRIVE_SYNC_HOME = path.join(testRoot, "app");
process.env.ANTINOTE_DRIVE_SYNC_CLOUD_ROOT = path.join(testRoot, "CloudStorage");
const notesFolder = path.join(process.env.ANTINOTE_DRIVE_SYNC_CLOUD_ROOT, "GoogleDrive-test", "My Drive", "Antinote");
fs.mkdirSync(notesFolder, {recursive: true});

const companion = require("./server");

test("sanitizeFilename creates safe Markdown names", function () {
  assert.equal(companion.sanitizeFilename("Project: Ideas"), "Project- Ideas.md");
  assert.equal(companion.sanitizeFilename("already.md"), "already.md");
  assert.equal(companion.sanitizeFilename("../secret"), "-secret.md");
});

test("only accepts folders inside a Google Drive mount", function () {
  assert.equal(companion.isInsideGoogleDrive(notesFolder), true);
  assert.equal(companion.isInsideGoogleDrive(testRoot), false);
});

test("config round-trips locally", function () {
  const expected = {folderPath: notesFolder};
  companion.saveConfig(expected);
  assert.deepEqual(companion.loadConfig(), expected);
});

test("syncNote creates and atomically updates a Markdown file", function () {
  companion.saveConfig({folderPath: notesFolder});
  const created = companion.syncNote("Project", "# Project\nFirst version");
  assert.equal(created.action, "created");
  assert.equal(fs.readFileSync(path.join(notesFolder, "Project.md"), "utf8"), "# Project\nFirst version");

  const updated = companion.syncNote("Project", "# Project\nSecond version");
  assert.equal(updated.action, "updated");
  assert.equal(fs.readFileSync(path.join(notesFolder, "Project.md"), "utf8"), "# Project\nSecond version");
  assert.deepEqual(fs.readdirSync(notesFolder), ["Project.md"]);
});
