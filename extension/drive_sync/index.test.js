var fs = require("fs");
var path = require("path");

function describe(name, fn) {
  console.log("\n" + name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log("  PASS " + name);
  } catch (error) {
    console.log("  FAIL " + name);
    console.log("    Error: " + error.message);
  }
}

function expect(actual) {
  return {
    toBe: function (expected) {
      if (actual !== expected) throw new Error("Expected " + expected + " but got " + actual);
    },
    toContain: function (expected) {
      if (actual.indexOf(expected) === -1) throw new Error("Expected value to contain " + expected);
    },
    toBeArray: function () {
      if (!Array.isArray(actual)) throw new Error("Expected an array");
    }
  };
}

var metadata = JSON.parse(fs.readFileSync(path.join(__dirname, "extension.json"), "utf8"));

describe("Drive Sync metadata", function () {
  it("declares the local companion and both commands", function () {
    expect(metadata.name).toBe("drive_sync");
    expect(metadata.dataScope).toBe("full");
    expect(metadata.endpoints).toContain("http://127.0.0.1:48731");
    expect(metadata.commands).toBeArray();
    expect(metadata.commands.length).toBe(2);
  });
});

describe("Drive Sync command", function () {
  it("uploads the note and preserves its content", function () {
    var captured;
    callAPI = function (key, url, method, headers, body) {
      captured = {key: key, url: url, method: method, headers: JSON.parse(headers), body: JSON.parse(body)};
      return {success: true, data: JSON.stringify({ok: true, action: "created", name: "Ideas.md"})};
    };

    var result = drive_sync.execute({parameters: [], fullText: "# Ideas\nOne thought", userSettings: {}});
    expect(result.status).toBe("success");
    expect(result.payload).toBe("# Ideas\nOne thought");
    expect(captured.method).toBe("POST");
    expect(captured.body.title).toBe("Ideas");
    expect(captured.body.content).toBe("# Ideas\nOne thought");
  });

  it("uses an optional filename and removes the command line", function () {
    var captured;
    callAPI = function (key, url, method, headers, body) {
      captured = JSON.parse(body);
      return {success: true, data: JSON.stringify({ok: true, action: "updated", name: "Weekly.md"})};
    };

    var result = drive_sync.execute({parameters: ["Weekly"], fullText: "Notes\n::drive_sync(Weekly)", userSettings: {}});
    expect(result.status).toBe("success");
    expect(result.payload).toBe("Notes");
    expect(captured.title).toBe("Weekly");
  });

  it("returns the unchanged note when the companion reports an error", function () {
    callAPI = function () {
      return {success: true, data: JSON.stringify({ok: false, error: "Google account is not connected."})};
    };

    var result = drive_sync.execute({parameters: [], fullText: "Important note", userSettings: {}});
    expect(result.status).toBe("error");
    expect(result.message).toContain("not connected");
    expect(result.payload).toBe("Important note");
  });
});

console.log("Running Drive Sync extension tests...");
