(function () {
  const extensionName = "drive_sync";
  const bridgeURL = "http://127.0.0.1:48731";

  const extensionRoot = new Extension({
    name: extensionName,
    version: "1.1.1",
    endpoints: [bridgeURL],
    requiredAPIKeys: [],
    author: "rajivpriyadarshi",
    category: "Productivity",
    dataScope: "full",
    dependencies: []
  });

  function asString(value) {
    return value == null ? "" : String(value);
  }

  function noteWithoutCommand(text) {
    return asString(text)
      .split(/\r?\n/)
      .filter(function (line) {
        return !/^\s*::drive_sync(?:\([^)]*\))?\s*$/.test(line);
      })
      .join("\n")
      .replace(/\n{3,}$/g, "\n\n");
  }

  function inferredTitle(text) {
    const firstContentLine = asString(text)
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .find(function (line) { return line.length > 0; });

    return (firstContentLine || "Untitled note")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .slice(0, 100);
  }

  function parseResponse(result) {
    if (!result || !result.success) {
      return {
        ok: false,
        message: result && result.error ? asString(result.error) : "The Drive companion is not running. Run the installer, then try again."
      };
    }

    try {
      return { ok: true, data: JSON.parse(result.data) };
    } catch (error) {
      return { ok: false, message: "The Drive companion returned an invalid response." };
    }
  }

  const driveSync = new Command({
    name: "drive_sync",
    parameters: [
      new Parameter({
        type: "string",
        name: "filename",
        helpText: "Optional Drive filename. Defaults to the first line of the note.",
        default: "",
        required: false
      })
    ],
    type: "replaceAll",
    helpText: "Upload or update this note as a Markdown file in Google Drive.",
    tutorials: [
      new TutorialCommand({command: "drive_sync", description: "Sync using the note's first line as its filename."}),
      new TutorialCommand({command: "drive_sync(Project ideas)", description: "Sync as Project ideas.md."})
    ],
    extension: extensionRoot
  });

  driveSync.execute = function (payload) {
    const params = this.getParsedParams(payload);
    const content = noteWithoutCommand(payload.fullText);
    const requestedTitle = asString(params[0]).trim();

    if (!content.trim()) {
      return new ReturnObject({status: "error", message: "There is no note content to sync.", payload: content});
    }

    const result = callAPI(
      "",
      bridgeURL + "/sync",
      "POST",
      JSON.stringify({"Content-Type": "application/json"}),
      JSON.stringify({
        title: requestedTitle || inferredTitle(content),
        content: content
      })
    );
    const response = parseResponse(result);

    if (!response.ok || !response.data || response.data.ok !== true) {
      const message = response.ok && response.data && response.data.error
        ? response.data.error
        : response.message;
      return new ReturnObject({status: "error", message: message || "Google Drive sync failed.", payload: content});
    }

    return new ReturnObject({
      status: "success",
      message: response.data.action === "updated"
        ? "Updated " + response.data.name + " in Google Drive."
        : "Uploaded " + response.data.name + " to Google Drive.",
      payload: content
    });
  };

  const driveSetup = new Command({
    name: "drive_setup",
    parameters: [],
    type: "openURL",
    helpText: "Choose the Google Drive folder used for Antinote backups.",
    tutorials: [
      new TutorialCommand({command: "drive_setup", description: "Open Drive Sync setup."})
    ],
    extension: extensionRoot
  });

  driveSetup.execute = function () {
    return new ReturnObject({
      status: "success",
      message: "Opening Google Drive Sync settings.",
      payload: bridgeURL + "/"
    });
  };
})();
