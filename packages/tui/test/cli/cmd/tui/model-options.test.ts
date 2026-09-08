import { describe, expect, test } from "bun:test"
import { sortModelOptions } from "../../../../src/component/dialog-model"

describe("sortModelOptions", () => {
  test("orders provider-scoped model choices by newest release first", () => {
    const sorted = sortModelOptions(
      [
        { title: "GPT 5.2", releaseDate: "2025-12-11" },
        { title: "GPT 5.4", releaseDate: "2026-03-05" },
        { title: "GPT 5.1", releaseDate: "2025-11-13" },
      ],
      true,
    )

    expect(sorted.map((model) => model.title)).toEqual(["GPT 5.4", "GPT 5.2", "GPT 5.1"])
  })

  test("orders regular model choices newest-first", () => {
    const sorted = sortModelOptions(
      [
        { title: "Qwen3 Coder 30B", releaseDate: "2025-07-28" },
        { title: "Gemma 4 26B", releaseDate: "2025-12-09" },
        { title: "GLM 5.2", releaseDate: "2026-02-16" },
      ],
      false,
    )

    expect(sorted.map((model) => model.title)).toEqual(["GLM 5.2", "Gemma 4 26B", "Qwen3 Coder 30B"])
  })
})
