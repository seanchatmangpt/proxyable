import { createContext as unctxCreateContext, createNamespace as unctxCreateNamespace } from 'unctx'

// Proxyable's global namespace to avoid context conflicts
const proxyableNamespace = unctxCreateNamespace('proxyable')

/**
 * Creates a new context for Proxyable.
 * A context stores a specific state that can be accessed or modified dynamically.
 *
 * @returns {object} An object containing methods to manage the context.
 */
export function createContext() {
  const ctx = unctxCreateContext()

  return {
    /**
     * Retrieve the current context.
     * Throws an error if no context is active.
     */
    use: () => ctx.use(),

    /**
     * Try to retrieve the current context.
     * Returns undefined if no context is active.
     */
    tryUse: () => ctx.tryUse(),

    /**
     * Set a new context for a specific callback execution.
     * Ensures the context is reset after the callback completes.
     *
     * @param {*} value - The value to set as the context.
     * @param {Function} callback - The callback to execute with the set context.
     * @returns {*} - The result of the callback.
     * @throws {Error} If a context conflict occurs.
     */
    call: (value, callback) => ctx.call(value, callback),

    /**
     * Set the context globally without a callback scope.
     *
     * @param {*} value - The value to set as the context.
     * @param {boolean} [replace=false] - Whether to replace an existing context.
     * @throws {Error} If a context conflict occurs and replace is not true.
     */
    set: (value, replace = false) => ctx.set(value, replace),

    /**
     * Unset the current context.
     * Clears the active context globally.
     */
    unset: () => ctx.unset()
  }
}
