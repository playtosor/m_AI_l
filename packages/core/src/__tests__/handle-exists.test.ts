import { handleExists, findRosterEntry } from "../services/mail-routing";
import { RosterEntry } from "../domain/types";

describe("handleExists (V3.0 BAC 2A follow-up)", () => {
  const roster: RosterEntry[] = [
    { handle: "ARCHI", role: "Architect", mailbox: "mailbox_ARCHI.md", status: "active" },
    { handle: "OPS", role: "Ops", mailbox: "mailbox_OPS.md", status: "active" },
    { handle: "HUMAN", role: "User", mailbox: "mailbox_HUMAN.md", status: "active" },
  ];

  describe("happy path", () => {
    it("returns true for an exact-case match", () => {
      expect(handleExists(roster, "ARCHI")).toBe(true);
      expect(handleExists(roster, "OPS")).toBe(true);
    });

    it("returns true regardless of caller casing (V2.11 case-insensitive)", () => {
      expect(handleExists(roster, "archi")).toBe(true);
      expect(handleExists(roster, "Archi")).toBe(true);
      expect(handleExists(roster, "ARCHI")).toBe(true);
    });

    it("returns true when the handle has surrounding whitespace", () => {
      expect(handleExists(roster, "  ARCHI  ")).toBe(true);
      expect(handleExists(roster, "\tarchi\n")).toBe(true);
    });
  });

  describe("negative cases", () => {
    it("returns false for a handle that is not in the roster", () => {
      expect(handleExists(roster, "GHOST")).toBe(false);
      expect(handleExists(roster, "ARCHITECT")).toBe(false);
    });

    it("returns false for an empty roster", () => {
      expect(handleExists([], "ARCHI")).toBe(false);
    });

    it("returns false for empty / nullish input", () => {
      expect(handleExists(roster, "")).toBe(false);
      expect(handleExists(roster, "   ")).toBe(false);
    });
  });

  describe("consistency with findRosterEntry", () => {
    it("agrees with findRosterEntry on every roster entry", () => {
      for (const entry of roster) {
        const found = findRosterEntry(roster, entry.handle);
        expect(handleExists(roster, entry.handle)).toBe(found !== undefined);
      }
    });

    it("agrees with findRosterEntry on a non-existing handle", () => {
      const found = findRosterEntry(roster, "GHOST");
      expect(handleExists(roster, "GHOST")).toBe(found !== undefined);
    });
  });
});
