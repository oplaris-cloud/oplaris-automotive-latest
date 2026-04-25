/**
 * P2.1 — server-side gate that wraps libphonenumber-js's parser into a
 * single canonical entry point with a typed error. Same metadata path
 * as the client-side `<PhoneInput>` so a number that lights the Submit
 * button up will also pass the action's normalisePhone() call.
 */
import { describe, expect, it } from "vitest";

import {
  PhoneParseError,
  isValidPhoneNumberInput,
  normalisePhone,
  normalisePhoneSafe,
} from "@/lib/validation/phone";

describe("normalisePhone", () => {
  it("converts a UK mobile in local form to E.164", () => {
    expect(normalisePhone("07911 123456")).toBe("+447911123456");
  });

  it("strips spaces / dashes from a +44-prefixed input", () => {
    expect(normalisePhone("+44 7911 123456")).toBe("+447911123456");
    expect(normalisePhone("+44-7911-123456")).toBe("+447911123456");
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(normalisePhone("  07911 123456  ")).toBe("+447911123456");
  });

  it("throws PhoneParseError when the input has no digits", () => {
    expect(() => normalisePhone("not-a-number")).toThrow(PhoneParseError);
  });

  it("throws PhoneParseError when the input parses but isn't a valid number", () => {
    // Too short — parses as a possible number but isValid() returns false.
    expect(() => normalisePhone("07")).toThrow(PhoneParseError);
  });

  it("attaches the raw input to the thrown error for log correlation", () => {
    try {
      normalisePhone("not-a-number");
      throw new Error("expected normalisePhone to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PhoneParseError);
      if (e instanceof PhoneParseError) {
        expect(e.raw).toBe("not-a-number");
        expect(e.name).toBe("PhoneParseError");
      }
    }
  });
});

describe("normalisePhoneSafe", () => {
  it("returns the E.164 string on success", () => {
    expect(normalisePhoneSafe("07911 123456")).toBe("+447911123456");
  });

  it("returns null on parse failure (anti-enumeration contract)", () => {
    expect(normalisePhoneSafe("not-a-number")).toBeNull();
    expect(normalisePhoneSafe("")).toBeNull();
  });
});

describe("isValidPhoneNumberInput", () => {
  it("returns true for a valid UK mobile", () => {
    expect(isValidPhoneNumberInput("07911 123456")).toBe(true);
    expect(isValidPhoneNumberInput("+44 7911 123456")).toBe(true);
  });

  it("returns false for empty / whitespace-only input", () => {
    expect(isValidPhoneNumberInput("")).toBe(false);
    expect(isValidPhoneNumberInput("   ")).toBe(false);
  });

  it("returns false for malformed input (no throw)", () => {
    expect(isValidPhoneNumberInput("not-a-number")).toBe(false);
    expect(isValidPhoneNumberInput("07")).toBe(false);
  });
});
