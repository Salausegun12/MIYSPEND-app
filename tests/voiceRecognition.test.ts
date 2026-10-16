import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapExpoRecognitionError } from "../src/services/voice/recognitionErrors.ts";
import {
  PREFERRED_LOCALES,
  pickPreferredLocale,
} from "../src/services/voice/language.ts";

describe("expo speech recognition error mapping", () => {
  it("maps denied permissions to a permission_denied error", () => {
    const error = mapExpoRecognitionError("not-allowed");
    assert.equal(error.kind, "permission_denied");
    assert.equal(error.message.includes("permission"), true);
  });

  it("maps silence to a no_speech error", () => {
    for (const code of ["no-speech", "speech-timeout"]) {
      assert.equal(mapExpoRecognitionError(code).kind, "no_speech");
    }
  });

  it("maps network-reliant failures to an unavailable error", () => {
    for (const code of ["network", "service-not-allowed", "audio-capture", "busy"]) {
      assert.equal(mapExpoRecognitionError(code).kind, "unavailable");
    }
    assert.equal(
      mapExpoRecognitionError("network").message.includes("internet"),
      true
    );
  });

  it("explains an unsupported language without promising offline mode", () => {
    const error = mapExpoRecognitionError("language-not-supported");
    assert.equal(error.kind, "unavailable");
    assert.equal(error.message.includes("language"), true);
    assert.equal(error.message.includes("offline"), false);
  });

  it("never leaks a raw engine message when the code is unknown", () => {
    const error = mapExpoRecognitionError("something-weird");
    assert.equal(error.kind, "unknown");
    assert.equal(error.message, "I couldn't hear you clearly. Please try again.");
  });
});

describe("recognizer locale selection", () => {
  it("prefers the app's locales when the device supports them", () => {
    assert.equal(pickPreferredLocale(["fr-FR", "en-GB", "en-US"]), "en-US");
    assert.equal(pickPreferredLocale(["fr-FR", "en-GB"]), "en-GB");
    assert.equal(pickPreferredLocale(["en-NG", "fr-FR"]), "en-NG");
  });

  it("falls back to any English locale, then to any locale", () => {
    assert.equal(pickPreferredLocale(["fr-FR", "en-ZA"]), "en-ZA");
    assert.equal(pickPreferredLocale(["fr-FR", "de-DE"]), "fr-FR");
  });

  it("matches locales case-insensitively", () => {
    assert.equal(pickPreferredLocale(["EN-us"]), "en-US");
  });

  it("falls back to the default when the device reports nothing", () => {
    assert.equal(pickPreferredLocale([]), PREFERRED_LOCALES[0]);
    assert.equal(pickPreferredLocale(["   "]), PREFERRED_LOCALES[0]);
  });
});
