import {
  normalizePriority,
  tryParseHeaderLine,
  parseMessage,
  formatMessage,
  escapeDelimiters,
  restoreDelimiters,
  sanitizeSubjectDelimiter,
} from "../lib/message-format";
import { Message } from "../domain/types";

describe("message-format (V3.0 BAC 2A — T1)", () => {
  describe("normalizePriority", () => {
    it("accepts H, M, L and returns them verbatim", () => {
      expect(normalizePriority("H")).toBe("H");
      expect(normalizePriority("M")).toBe("M");
      expect(normalizePriority("L")).toBe("L");
    });

    it("does NOT trim whitespace around the priority (caller must strip it first)", () => {
      // The helper signature is strict equivalence: " H " is not "H" and falls
      // back to "M". Documenting this so callers know they must trim upstream
      // (tryParseHeaderLine does .trim() before calling normalizePriority).
      expect(normalizePriority(" H ")).toBe("M");
      expect(normalizePriority("\tL\n")).toBe("M");
    });

    it("defaults unknown values to M (medium) instead of throwing", () => {
      expect(normalizePriority("X")).toBe("M");
      expect(normalizePriority("")).toBe("M");
      expect(normalizePriority("high")).toBe("M"); // lowercase not H/M/L
      expect(normalizePriority("1")).toBe("M");
    });
  });

  describe("tryParseHeaderLine — canonical 5-field format", () => {
    it("parses a canonical header line with valid priority", () => {
      const line = "ARCHI // 20240115-1430 // H // Hello world // Body content";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual<Message>({
        sender: "ARCHI",
        timestamp: "20240115-1430",
        priority: "H",
        subject: "Hello world",
        body: "Body content",
      });
      expect(result!.warning_count).toBe(0);
    });

    it("accepts all valid priority values", () => {
      for (const priority of ["H", "M", "L"] as const) {
        const line = `HUMAN // 20240115-1430 // ${priority} // Subj // Body`;
        const result = tryParseHeaderLine(line);
        expect(result).not.toBeNull();
        expect(result!.message.priority).toBe(priority);
        expect(result!.warning_count).toBe(0);
      }
    });

    it("preserves an empty body", () => {
      const line = "ARCHI // 20240115-1430 // M // Subj // ";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message.body).toBe("");
      expect(result!.message.subject).toBe("Subj");
    });

    it("strips outer whitespace around subject and sender", () => {
      const line = "  ARCHI  //  20240115-1430  //  M  //   Subj   // Body";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message.sender).toBe("ARCHI");
      expect(result!.message.timestamp).toBe("20240115-1430");
      expect(result!.message.subject).toBe("Subj");
    });

    it("keeps internal spaces inside the body untouched", () => {
      const line = "ARCHI // 20240115-1430 // M // Subj // hello   world  here";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message.body).toBe("hello   world  here");
    });
  });

  describe("tryParseHeaderLine — priority normalisation warnings", () => {
    it("increments warning_count when priority is unknown but line otherwise matches canonical", () => {
      const line = "ARCHI // 20240115-1430 // X // Subj // Body";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message.priority).toBe("M");
      expect(result!.warning_count).toBe(1);
    });

    it("increments warning_count when timestamp is malformed", () => {
      const line = "ARCHI // not-a-timestamp // M // Subj // Body";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message.timestamp).toBe("not-a-timestamp");
      expect(result!.warning_count).toBe(1);
    });

    it("accumulates warnings (priority + timestamp) when both are invalid", () => {
      const line = "ARCHI // garbage // Q // Subj // Body";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.warning_count).toBe(2);
    });
  });

  describe("tryParseHeaderLine — fall-back (no-priority) format", () => {
    it("parses a 4-field header when priority is omitted", () => {
      const line = "ARCHI // 20240115-1430 // Subj // Some body text";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual<Message>({
        sender: "ARCHI",
        timestamp: "20240115-1430",
        priority: "M",
        subject: "Subj",
        body: "Some body text",
      });
      // priority defaulted ⇒ at least 1 warning; timestamp OK => no extra
      expect(result!.warning_count).toBe(1);
    });

    it("adds an extra warning for malformed timestamp in no-priority format", () => {
      const line = "ARCHI // not-a-timestamp // Subj // Body";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.warning_count).toBe(2);
    });
  });

  describe("tryParseHeaderLine — multiline body handling", () => {
    it("returns a single-line body for canonical format", () => {
      const line = "ARCHI // 20240115-1430 // M // Subj // first";
      const result = tryParseHeaderLine(line);

      expect(result!.message.body).toBe("first");
    });

    it("refuses lines that don't match either regex", () => {
      expect(tryParseHeaderLine("Just plain text")).toBeNull();
      expect(tryParseHeaderLine("")).toBeNull();
      expect(tryParseHeaderLine("// // // // //")).toBeNull();
    });

    it("refuses no-priority format with empty subject (sender-only check)", () => {
      // Four-field but sender is empty ⇒ trimmed-empty rejection.
      const line = " // 20240115-1430 // Subj // Body";
      expect(tryParseHeaderLine(line)).toBeNull();
    });

    it("parses sender containing non-alphanumeric characters", () => {
      // The canonical regex is permissive: sender can be anything except ` // `.
      const line = "ACME/OPS // 20240115-1430 // M // Subj // Body";
      const result = tryParseHeaderLine(line);

      expect(result).not.toBeNull();
      expect(result!.message.sender).toBe("ACME/OPS");
    });
  });

  describe("parseMessage — strict variant", () => {
    it("returns the message when format is valid", () => {
      const message = parseMessage("ARCHI // 20240115-1430 // H // Subj // Body");
      expect(message.sender).toBe("ARCHI");
      expect(message.priority).toBe("H");
    });

    it("throws on malformed line with the line itself in the error", () => {
      expect(() => parseMessage("totally not valid")).toThrow(/Invalid message format:/);
    });
  });

  describe("formatMessage — roundtrip", () => {
    it("serializes a Message into the canonical 5-segment line", () => {
      const message: Message = {
        sender: "ARCHI",
        timestamp: "20240115-1430",
        priority: "H",
        subject: "Hello",
        body: "Body text",
      };
      expect(formatMessage(message)).toBe("ARCHI // 20240115-1430 // H // Hello // Body text");
    });

    it("round-trips through parseMessage / formatMessage", () => {
      const original: Message = {
        sender: "OPS",
        timestamp: "20240115-1430",
        priority: "M",
        subject: "Round trip",
        body: "Some body content",
      };
      const serialized = formatMessage(original);
      const parsed = parseMessage(serialized);

      expect(parsed.sender).toBe(original.sender);
      expect(parsed.timestamp).toBe(original.timestamp);
      expect(parsed.priority).toBe(original.priority);
      expect(parsed.subject).toBe(original.subject);
      expect(parsed.body).toBe(original.body);
    });

    it("round-trips a no-priority line through formatMessage back to canonical", () => {
      const noPriorityLine = "OPS // 20240115-1430 // Subj // Body";
      const result = tryParseHeaderLine(noPriorityLine);

      expect(result).not.toBeNull();
      const formatted = formatMessage(result!.message);
      // After formatMessage, priority is filled in (M) and a new canonical line emitted.
      expect(formatted).toBe("OPS // 20240115-1430 // M // Subj // Body");
    });
  });

  describe("sanitizeSubjectDelimiter (Cycle A — G4, SIMPLIFY #9 / D2)", () => {
    it("normalizes ' // ' in a subject to ' ∕∕ ' on write", () => {
      expect(sanitizeSubjectDelimiter("Plan // Execute")).toBe("Plan ∕∕ Execute");
    });

    it("leaves a subject without ' // ' unchanged", () => {
      expect(sanitizeSubjectDelimiter("Plain subject")).toBe("Plain subject");
    });

    it("normalizes every ' // ' occurrence", () => {
      expect(sanitizeSubjectDelimiter("a // b // c")).toBe("a ∕∕ b ∕∕ c");
    });

    it("escapes ' // ' in every field (D3 — no phantom messages on re-read)", () => {
      // formatMessage now escapes ` // ` to `‖` in ALL fields so a body line
      // containing the delimiter can never be re-interpreted as a header.
      const message: Message = {
        sender: "ARCHI",
        timestamp: "20240115-1430",
        priority: "M",
        subject: "a // b",
        body: "Body",
      };
      expect(formatMessage(message)).toBe("ARCHI // 20240115-1430 // M // a‖b // Body");
    });
  });

  describe("escapeDelimiters / restoreDelimiters (Cycle — D3)", () => {
    it("escapeDelimiters replaces every ' // ' with the escape character", () => {
      expect(escapeDelimiters("a // b // c")).toBe("a‖b‖c");
    });

    it("escapeDelimiters leaves text without ' // ' unchanged", () => {
      expect(escapeDelimiters("plain text")).toBe("plain text");
    });

    it("restoreDelimiters reverses escapeDelimiters", () => {
      expect(restoreDelimiters("a‖b‖c")).toBe("a // b // c");
      expect(restoreDelimiters(escapeDelimiters("x // y // z"))).toBe("x // y // z");
    });
  });

  describe("formatMessage / tryParseHeaderLine — ' // ' in body round-trips (D3)", () => {
    it("escapes a body containing ' // ' so it is not re-parsed as a header", () => {
      const message: Message = {
        sender: "ARCHI",
        timestamp: "20240115-1430",
        priority: "M",
        subject: "Subj",
        body: "line one // line two // line three // line four",
      };
      const serialized = formatMessage(message);

      // The delimiter no longer appears inside the body segment.
      expect(serialized).toBe("ARCHI // 20240115-1430 // M // Subj // line one‖line two‖line three‖line four");

      const parsed = tryParseHeaderLine(serialized);
      expect(parsed).not.toBeNull();
      expect(parsed!.message.body).toBe("line one // line two // line three // line four");
      expect(parsed!.message.subject).toBe("Subj");
    });

    it("a body line with ' // ' no longer produces a phantom header", () => {
      // A raw body line carrying >= 3 ` // ` matches NO_PRIORITY_RE and, before
      // D3, spawned a permuted phantom message (sender=timestamp,
      // timestamp=route). The escaped form must not match the header shape.
      const phantomLine = "20261013-0004 // COORDINATEUR/HUMAN -> COORDINATEUR/ARCHI // 3 // note";
      expect(tryParseHeaderLine(phantomLine)).not.toBeNull(); // the bug
      expect(tryParseHeaderLine(escapeDelimiters(phantomLine))).toBeNull(); // the fix
    });
  });
});
