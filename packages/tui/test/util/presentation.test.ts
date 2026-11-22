import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("localcode --resume ses_123")
})

test("picks full, compact or plain wordmark by width", () => {
  const at = (columns: number) => sessionEpilogue({ title: "A session", sessionID: "ses_123", columns }).replace(/\x1b\[[0-9;]*m/g, "")
  const full = at(80)
  expect(full).toContain("█▀▀▀ █▀▀█")
  const mid = at(38)
  expect(mid).toContain("█ █▀█ █▀▀ ▀▀█ █ █▀▀ █▀█ █▀█ █▀█")
  expect(mid).not.toContain("█▀▀▀ █▀▀█")
  const stacked = at(20)
  expect(stacked).toContain("█ █▀█ █▀▀ ▀▀█ █")
  expect(stacked).toContain("\n  █▀▀ █▀█ █▀█ █▀█")
  const tiny = at(12)
  expect(tiny).not.toContain("█")
  expect(tiny).toContain("localcode")
  for (const out of [full, mid, stacked, tiny]) {
    expect(out).toContain("A session")
    expect(out).toContain("localcode --resume ses_123")
  }
})
