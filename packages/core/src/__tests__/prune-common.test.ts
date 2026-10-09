import { isInScope } from "../lib/prune-common";

describe("prune-common V2", () => {
  test("Cas 10: isInScope retourne true pour scope 'mailbox'", () => {
    expect(isInScope("mailbox_ARCHI_archive.md")).toBe(true);
  });

  test("Cas 11: isInScope retourne true pour scope 'outbox'", () => {
    expect(isInScope("outbox_ARCHI.md")).toBe(true);
  });

  test("Cas 12: isInScope retourne false pour scope inconnu", () => {
    expect(isInScope("mailbox_ARCHI.md")).toBe(false);
  });
});
