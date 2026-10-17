import { expect, test } from "bun:test"
import { defaultQuant } from "../src/component/dialog-localcode-model"

const q = (alias: string, extra: { current?: boolean; recommended?: boolean; downloaded?: boolean } = {}) => ({ alias, ...extra })

test("the quant list never opens on a download when a quant is on disk", () => {
  // North: the recommended Q8 is not downloaded, Q4 is. Enter must load Q4, not start a 33 GB download.
  expect(defaultQuant([q("IQ2"), q("Q4", { downloaded: true }), q("Q8", { recommended: true })])).toBe("Q4")
})

test("the recommended quant wins among downloaded ones, and the loaded one wins overall", () => {
  const list = [q("IQ2", { downloaded: true }), q("Q8", { downloaded: true, recommended: true })]
  expect(defaultQuant(list)).toBe("Q8")
  expect(defaultQuant([{ ...list[0], current: true }, list[1]])).toBe("IQ2")
})

test("with nothing on disk the recommended download is offered", () => {
  expect(defaultQuant([q("IQ1"), q("Q4", { recommended: true })])).toBe("Q4")
})
