import { normalizeHandle, handlesEqual } from "../lib/handles";

describe("handles (V2.11 case-insensitive helpers)", () => {
  describe("normalizeHandle", () => {
    it("uppercases mixed case", () => {
      expect(normalizeHandle("Beta")).toBe("BETA");
      expect(normalizeHandle("bEtA")).toBe("BETA");
    });

    it("uppercases already-uppercase input unchanged", () => {
      expect(normalizeHandle("BETA")).toBe("BETA");
    });

    it("lowercases for canonical comparison", () => {
      expect(normalizeHandle("beta")).toBe("BETA");
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeHandle("  Beta  ")).toBe("BETA");
      expect(normalizeHandle("\tbeta\n")).toBe("BETA");
    });

    it("returns empty string for null or undefined or empty input", () => {
      expect(normalizeHandle(null)).toBe("");
      expect(normalizeHandle(undefined)).toBe("");
      expect(normalizeHandle("")).toBe("");
      expect(normalizeHandle("   ")).toBe("");
    });
  });

  describe("handlesEqual", () => {
    it("is true regardless of casing", () => {
      expect(handlesEqual("BETA", "beta")).toBe(true);
      expect(handlesEqual("beta", "BETA")).toBe(true);
      expect(handlesEqual("Beta", "bEtA")).toBe(true);
    });

    it("ignores surrounding whitespace", () => {
      expect(handlesEqual("  BETA", "beta  ")).toBe(true);
    });

    it("is false for genuinely different handles", () => {
      expect(handlesEqual("BETA", "GAMMA")).toBe(false);
    });

    it("treats two empty inputs as equal", () => {
      expect(handlesEqual("", "")).toBe(true);
      expect(handlesEqual(null, undefined)).toBe(true);
      expect(handlesEqual(undefined, "")).toBe(true);
    });

    it("treats one empty against one non-empty as non-equal", () => {
      expect(handlesEqual("", "BETA")).toBe(false);
      expect(handlesEqual("BETA", null)).toBe(false);
    });
  });

});
