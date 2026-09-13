import { expect, test } from "bun:test"
import { ModelChangeQueue } from "../../src/util/model-change-queue"

test("a model change waits through generation and tools, then starts once", async () => {
  const queue = new ModelChangeQueue()
  let busy = true
  let changes = 0
  try {
    expect(queue.request(() => busy, () => changes++, 5)).toBe(true)
    await Bun.sleep(20)
    expect(changes).toBe(0)
    busy = false
    await Bun.sleep(20)
    expect(changes).toBe(1)
    await Bun.sleep(20)
    expect(changes).toBe(1)
  } finally { queue.cancel() }
})

test("the latest queued choice replaces an earlier one; idle changes start immediately", async () => {
  const queue = new ModelChangeQueue()
  let busy = true
  const changes: string[] = []
  try {
    queue.request(() => busy, () => changes.push("old"), 5)
    queue.request(() => busy, () => changes.push("new"), 5)
    busy = false
    await Bun.sleep(20)
    expect(changes).toEqual(["new"])
    expect(queue.request(() => false, () => changes.push("idle"))).toBe(false)
    expect(changes).toEqual(["new", "idle"])
  } finally { queue.cancel() }
})
