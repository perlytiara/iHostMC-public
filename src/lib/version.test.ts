import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./version.generated";

describe("version", () => {
  it("APP_VERSION is a non-empty string", () => {
    expect(typeof APP_VERSION).toBe("string");
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  it("APP_VERSION matches semver-like pattern (e.g. 0.5.0 or 1.2.3-beta.4)", () => {
    // Allow x.y.z with optional -prerelease and +build
    const semverLike = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;
    expect(APP_VERSION).toMatch(semverLike);
  });

  it("formatting as v-prefix is consistent", () => {
    const displayed = `v${APP_VERSION}`;
    expect(displayed).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
