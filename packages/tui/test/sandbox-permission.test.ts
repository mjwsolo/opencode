import { describe, expect, test } from "bun:test"
import { autoApproves, permissionPresentation, UNSANDBOXED_ACTION } from "../src/util/permission"

describe("leaving the sandbox", () => {
  test("auto-approve never answers it", () => {
    expect(UNSANDBOXED_ACTION).toBe("shell.unsandboxed")
    expect(autoApproves({ action: UNSANDBOXED_ACTION })).toBe(false)
    for (const action of ["shell", "edit", "external_directory", "doom_loop"]) expect(autoApproves({ action })).toBe(true)
  })

  test("the prompt shows the command and what was blocked", () => {
    const view = permissionPresentation(
      {
        action: UNSANDBOXED_ACTION,
        resources: ["python3 steal.py"],
        metadata: { blocked: ["file-read-data /home/u/.ssh/id_rsa"] },
      },
      (value: string) => value,
    )
    expect(view.title).toBe("Run outside the sandbox")
    expect(view.lines).toContain("$ python3 steal.py")
    expect(view.lines).toContain("- file-read-data /home/u/.ssh/id_rsa")
  })
})
