import { describe, expect, test } from "bun:test"
import { startupConfig } from "../../src/config/plugin/mcp"

const server = (disabled?: boolean) => ({ type: "local" as const, command: ["srv"], disabled })

describe("localcode MCP startup", () => {
  test("minimal mode connects only explicitly enabled servers", () => {
    expect(startupConfig(server(), "minimal").disabled).toBe(true)
    expect(startupConfig(server(false), "minimal").disabled).toBe(false)
    expect(startupConfig(server(true), "minimal").disabled).toBe(true)
  })

  test("other modes keep the configured choice", () => {
    expect(startupConfig(server(), "full").disabled).toBeUndefined()
    expect(startupConfig(server(false), "full").disabled).toBe(false)
    expect(startupConfig(server(true), "full").disabled).toBe(true)
  })
})
