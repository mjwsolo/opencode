import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("localcode --resume ses_123")
})

test("skips the block-letter wordmark in a narrow terminal", () => {
  const narrow = sessionEpilogue({ title: "A session", sessionID: "ses_123", columns: 40 })
  expect(narrow).not.toContain("█")
  expect(narrow).toContain("A session")
  expect(narrow).toContain("localcode --resume ses_123")
  expect(sessionEpilogue({ title: "A session", sessionID: "ses_123", columns: 80 })).toContain("█")
})
