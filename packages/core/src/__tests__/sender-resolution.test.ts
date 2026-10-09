import { resolveEffectiveSender } from "../lib/sender-resolution";

describe("resolveEffectiveSender", () => {
  describe("legacy mode (no senderProjectHandle)", () => {
    it("returns the sender verbatim", () => {
      expect(resolveEffectiveSender("AGENT", undefined, "TEST")).toBe("AGENT");
      expect(resolveEffectiveSender("AGENT", "", "TEST")).toBe("AGENT");
    });
  });

  describe("same-project sender (senderProjectHandle === targetProjectHandle)", () => {
    it("keeps a bare sender as-is", () => {
      expect(resolveEffectiveSender("AGENT", "TEST", "TEST")).toBe("AGENT");
    });

    it("strips the project prefix from a qualified sender", () => {
      expect(resolveEffectiveSender("TEST/AGENT", "TEST", "TEST")).toBe("AGENT");
    });

    it("strips the prefix case-insensitively (mixed-case project handle)", () => {
      expect(resolveEffectiveSender("Messaging/ARCHI", "MESSAGING", "Messaging")).toBe("ARCHI");
    });
  });

  describe("cross-project sender (senderProjectHandle !== targetProjectHandle)", () => {
    it("qualifies a bare sender with the origin project", () => {
      expect(resolveEffectiveSender("AGENT", "MAILEXPORT", "TEST")).toBe("MAILEXPORT/AGENT");
    });

    it("does not double-qualify a sender that already carries the origin prefix", () => {
      expect(resolveEffectiveSender("MAILEXPORT/AGENT", "MAILEXPORT", "TEST")).toBe("MAILEXPORT/AGENT");
    });

    it("does not double-qualify a sender whose prefix differs only in case", () => {
      expect(resolveEffectiveSender("Messaging/ARCHI", "MESSAGING", "OTHER")).toBe("MESSAGING/ARCHI");
    });
  });
});