import { describe, expect, it } from "vitest";
import { nameFromEmail } from "./signin";

describe("nameFromEmail", () => {
  it("turns an email into a friendly starting name", () => {
    expect(nameFromEmail("priya.k@example.com")).toBe("Priya K");
    expect(nameFromEmail("mani_2026@example.com")).toBe("Mani");
    expect(nameFromEmail("1234@example.com")).toBe("Friend");
    expect(nameFromEmail(`${"a".repeat(80)}@x.com`).length).toBeLessThanOrEqual(40);
  });
});
