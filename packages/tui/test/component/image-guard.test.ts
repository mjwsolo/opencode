import { describe, expect, test } from "bun:test"
import { hasImagePart, imageGuard } from "../../src/component/prompt/image-guard"

const img = [{ mime: "image/png", uri: "data:image/png;base64,AA" }]
const txt = [{ mime: "text/plain", uri: "file:///a.txt" }]

describe("imageGuard", () => {
  test("no image sends", () => {
    expect(imageGuard(txt, { current: "m", vision: false })).toEqual({ action: "send" })
    expect(imageGuard(undefined, { current: "m", vision: false })).toEqual({ action: "send" })
  })
  test("image with vision sends", () => {
    expect(imageGuard(img, { current: "m", vision: true })).toEqual({ action: "send" })
  })
  test("unknown status or unknown vision sends", () => {
    expect(imageGuard(img, undefined)).toEqual({ action: "send" })
    expect(imageGuard(img, { current: "m" })).toEqual({ action: "send" })
    expect(imageGuard(img, { vision: false })).toEqual({ action: "send" })
  })
  test("image without vision blocks and offers download when available", () => {
    expect(imageGuard(img, { current: "m", vision: false, vision_available: true, vision_size_gb: 0.9 })).toEqual({
      action: "block",
      model: "m",
      canDownload: true,
      sizeGb: 0.9,
    })
  })
  test("image without vision and no projector cannot download", () => {
    const d = imageGuard(img, { current: "m", vision: false, vision_available: false })
    expect(d).toMatchObject({ action: "block", canDownload: false })
  })
  test("detects images by uri alone", () => {
    expect(hasImagePart([{ uri: "data:image/jpeg;base64,AA" }])).toBe(true)
  })
})

describe("quant row labels", () => {
  test("headroom and marker", async () => {
    const { headroomLabel, quantMarker } = await import("../../src/component/dialog-localcode-model")
    expect(headroomLabel({ fit: "fits", comfortable: true, free_gb: 14.2 })).toBe("leaves ~14.2 GB free")
    expect(headroomLabel({ fit: "fits", comfortable: false, free_gb: 3.1 })).toBe("tight: ~3.1 GB free")
    expect(headroomLabel({ fit: "too_big", comfortable: false, free_gb: 0 })).toBe("")
    expect(quantMarker({ recommended: true }, true)).toBe(" ★")
    expect(quantMarker({ recommended: false }, true)).toBe(" max")
    expect(quantMarker({ recommended: false }, false)).toBe("")
  })
})
