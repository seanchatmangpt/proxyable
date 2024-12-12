import { describe, it, expect } from "vitest"
import { createContext } from "../../src/context/context.js"

describe("Context - Happy Path", () => {
  it("should set and retrieve context with `call`", () => {
    const ctx = createContext()

    const value = "Happy Path"
    const result = ctx.call(value, () => {
      // Inside the context
      expect(ctx.use()).toBe(value)
      return "Success"
    })

    // Ensure the callback result is returned
    expect(result).toBe("Success")

    // Outside the context
    expect(ctx.tryUse()).toBeUndefined()
  })

  it("should set and retrieve context globally with `set` and `unset`", () => {
    const ctx = createContext()

    const globalValue = { key: "global" }
    ctx.set(globalValue)

    // Verify global context is set
    expect(ctx.use()).toBe(globalValue)

    // Unset the global context
    ctx.unset()
    expect(ctx.tryUse()).toBeUndefined()
  })

  it("should replace an existing context using `set` with replace flag", () => {
    const ctx = createContext()

    ctx.set("Old Value")
    expect(ctx.use()).toBe("Old Value")

    ctx.set("New Value", true) // Replace the existing context
    expect(ctx.use()).toBe("New Value")

    ctx.unset()
    expect(ctx.tryUse()).toBeUndefined()
  })

})
