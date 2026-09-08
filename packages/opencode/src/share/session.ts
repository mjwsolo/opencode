import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Effect, Layer, Context } from "effect"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ShareNext } from "./share-next"

export interface Interface {
  readonly create: (input?: Session.CreateInput) => Effect.Effect<Session.Info>
  readonly share: (sessionID: SessionID) => Effect.Effect<{ url: string }, unknown>
  readonly unshare: (sessionID: SessionID) => Effect.Effect<void, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionShare") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const session = yield* Session.Service
    const shareNext = yield* ShareNext.Service

    // localcode is local-only: sharing is not available and cannot be enabled
    // via config or env. This always fails without touching the network.
    const share = Effect.fn("SessionShare.share")(function* (_sessionID: SessionID) {
      return yield* Effect.fail(new Error("Sharing is not available in localcode"))
    })

    const unshare = Effect.fn("SessionShare.unshare")(function* (sessionID: SessionID) {
      yield* shareNext.remove(sessionID)
      yield* session.setShare({ sessionID, share: undefined })
    })

    // No auto-share path: sessions are never shared, regardless of `share: "auto"`
    // config or the --share runtime flag.
    const create = Effect.fn("SessionShare.create")(function* (input?: Session.CreateInput) {
      return yield* session.create(input)
    })

    return Service.of({ create, share, unshare })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, Session.node, ShareNext.node, RuntimeFlags.node],
})

export * as SessionShare from "./session"
