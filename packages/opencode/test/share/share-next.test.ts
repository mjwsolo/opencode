// localcode is local-only: session sharing is permanently disabled. These tests
// guard that property by wiring an HttpClient that dies on any request and
// asserting the share service never persists or transmits anything.
import { beforeEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { SessionProjector } from "@opencode-ai/core/session/projector"

import { AccountRepo } from "../../src/account/repo"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Session } from "@/session/session"
import type { SessionID } from "../../src/session/schema"
import { ShareNext } from "@/share/share-next"
import { SessionShareTable } from "@opencode-ai/core/share/sql"
import { Database } from "@opencode-ai/core/database/database"
import { eq } from "drizzle-orm"
import { provideTmpdirInstance } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"
import { testEffect } from "../lib/effect"

const env = LayerNode.compile(LayerNode.group([CrossSpawnSpawner.node]))
const it = testEffect(env)

const none = HttpClient.make(() => Effect.die("unexpected http call"))

function integrationLayer(client: HttpClient.HttpClient) {
  const replacement = [httpClient, Layer.succeed(HttpClient.HttpClient, client)] as const
  return LayerNode.compile(
    LayerNode.group([
      ShareNext.node,
      EventV2Bridge.node,
      Session.node,
      SessionProjector.node,
      AccountRepo.node,
      Database.node,
    ]),
    [replacement],
  )
}

const share = (id: SessionID) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    return yield* db
      .select()
      .from(SessionShareTable)
      .where(eq(SessionShareTable.session_id, id))
      .get()
      .pipe(Effect.orDie)
  })

beforeEach(async () => {
  await resetDatabase()
})

describe("ShareNext (localcode: disabled)", () => {
  it.live("create never hits the network or persists a share, even with share config set", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const session = yield* (yield* Session.Service).create({ title: "test" })
          const svc = yield* ShareNext.Service
          yield* svc.init()

          const result = yield* svc.create(session.id)
          expect(result).toEqual({ id: "", url: "", secret: "" })

          const row = yield* share(session.id)
          expect(row).toBeUndefined()

          yield* svc.remove(session.id)
        }).pipe(Effect.provide(integrationLayer(none))),
      { config: { share: "auto", enterprise: { url: "https://legacy-share.example.com" } } },
    ),
  )
})
