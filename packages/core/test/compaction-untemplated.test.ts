import { expect, test } from "bun:test"
import { untemplated } from "../src/session/compaction"

test("a summary that echoes the template's wrapper tags is saved without them", () => {
  expect(untemplated("<template>\n## Objective\nBuild a CLI\n</template>")).toBe("## Objective\nBuild a CLI")
  expect(untemplated("  <template>\n## Objective\nX\n  </template>  \n")).toBe("## Objective\nX")
})

test("a summary without wrapper tags is unchanged", () => {
  expect(untemplated("## Objective\nUse <template> in docs")).toBe("## Objective\nUse <template> in docs")
})
