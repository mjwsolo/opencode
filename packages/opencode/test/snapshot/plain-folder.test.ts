import { expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Layer } from "effect"
import path from "path"
import { Snapshot } from "../../src/snapshot"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(LayerNode.compile(LayerNode.group([Snapshot.node, FSUtil.node])), testInstanceStoreLayer),
)

it.live("undo and redo restore files in a plain folder without touching a sibling", () =>
  Effect.gen(function* () {
    const root = yield* tmpdirScoped({ git: false }).pipe(Effect.provide(LayerNode.compile(CrossSpawnSpawner.node)))
    const fs = yield* FSUtil.Service
    const directory = path.join(root, "project")
    const sibling = path.join(root, "outside.txt")
    yield* fs.ensureDir(directory)
    yield* fs.writeFileString(sibling, "outside")
    yield* Effect.gen(function* () {
      const snapshot = yield* Snapshot.Service
      const log = path.join(directory, ".localcode-agent", "localcode-plugin.log")
      yield* fs.ensureDir(path.dirname(log))
      yield* fs.writeFileString(log, "before\n")
      const before = yield* snapshot.track()
      expect(before).toBeTruthy()
      const file = path.join(directory, "hello.py")
      yield* fs.writeFileString(file, "def add(a, b): return a + b\n")
      yield* fs.writeFileString(log, "before\nafter\n")
      const patch = yield* snapshot.patch(before!)
      expect(patch.files).toEqual([file])
      const after = yield* snapshot.track()
      const diff = yield* snapshot.diffFull(before!, after!)
      expect(diff.map((item) => item.file)).toEqual(["hello.py"])
      yield* snapshot.revert([patch])
      expect(yield* fs.exists(file)).toBe(false)
      expect(yield* fs.readFileString(sibling)).toBe("outside")
      expect(yield* fs.readFileString(log)).toBe("before\nafter\n")
      yield* snapshot.restore(after!)
      expect(yield* fs.readFileString(file)).toContain("return a + b")
      expect(yield* fs.exists(path.join(directory, ".git"))).toBe(false)
    }).pipe(provideInstance(directory))
  }),
)
