import { expect, test } from "bun:test"
import { epilogue } from "../../src/util/presentation"

const at = (columns: number) =>
  (epilogue({ session: { title: "A session", sessionID: "ses_123" }, columns }) ?? "").replace(/\x1b\[[0-9;]*m/g, "")

test("formats session continuation summary", () => {
  const out = at(80)
  expect(out).toContain("A session")
  expect(out).toContain("localcode --resume ses_123")
})

test("picks the widest logo that fits", () => {
  const full = at(80)
  expect(full).toContain("█▀▀▀ █▀▀█")
  const small = at(38)
  expect(small).toContain("█ █▀█ █▀▀ ▀▀█ █ █▀▀ █▀█ █▀█ █▀█")
  expect(small).not.toContain("█▀▀▀ █▀▀█")
  const stacked = at(20)
  expect(stacked).toContain("█ █▀█ █▀▀ ▀▀█ █")
  expect(stacked).toContain("\n  █▀▀ █▀█ █▀█ █▀█")
  const tiny = at(12)
  expect(tiny).not.toContain("█")
  expect(tiny).toContain("localcode")
  for (const out of [full, small, stacked, tiny]) {
    expect(out).toContain("A session")
    expect(out).toContain("localcode --resume ses_123")
  }
})
