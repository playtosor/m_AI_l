import { coerceNoArchive } from "../tools/no-archive";

describe("coerceNoArchive (Cycle A — G1, SIMPLIFY HIGH #1/#2)", () => {
  it("treats boolean true as peek (no archive)", () => {
    expect(coerceNoArchive(true)).toBe(true);
  });

  it("treats string 'true' as peek", () => {
    expect(coerceNoArchive("true")).toBe(true);
  });

  it("treats string 'false' as archive (default)", () => {
    expect(coerceNoArchive("false")).toBe(false);
  });

  it("treats absent/undefined as archive (default)", () => {
    expect(coerceNoArchive(undefined)).toBe(false);
  });

  it("treats boolean false as archive (default)", () => {
    expect(coerceNoArchive(false)).toBe(false);
  });

  it("does NOT accept case-insensitive or '1' variants (out of scope LOW)", () => {
    expect(coerceNoArchive("True")).toBe(false);
    expect(coerceNoArchive("1")).toBe(false);
  });
});
