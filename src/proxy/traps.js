/**
 * Executes interceptors for a given trap and returns the first definitive result.
 * If no interceptor returns a definitive result, the fallback Reflect operation is called.
 *
 * @param {Function[]} interceptors - An array of interceptor functions.
 * @param {Function} fallback - The Reflect operation to call if no interceptors handle the trap.
 * @param {...any} args - Arguments to pass to the interceptors and the fallback.
 * @returns {*} - The result from the first definitive interceptor or the fallback.
 */
export const runInterceptors = (interceptors, fallback, ...args) => {
  for (const interceptor of interceptors) {
    const result = interceptor(...args)
    if (result !== undefined) return result
  }
  return fallback(...args)
}

/**
 * Executes boolean interceptors for traps that require approval (e.g., `set`, `deleteProperty`).
 * If any interceptor returns `false`, the operation is blocked.
 * If any interceptor returns `true`, the operation is considered handled (fallback not called).
 * Otherwise, the fallback is executed.
 *
 * @param {Function[]} interceptors - An array of interceptor functions.
 * @param {Function} fallback - The Reflect operation to call if all interceptors allow.
 * @param {...any} args - Arguments to pass to the interceptors and the fallback.
 * @returns {boolean|*} - `false` if any interceptor denies, `true` if handled, or the fallback result.
 */
export const runBooleanInterceptors = (interceptors, fallback, ...args) => {
  for (const interceptor of interceptors) {
    const result = interceptor(...args)
    if (result === false) return false
    if (result === true) return true // Operation handled, skip fallback
  }
  return fallback(...args)
}

/**
 * Executes interceptors for `ownKeys` and merges additional keys returned by interceptors.
 *
 * @param {Function[]} interceptors - An array of interceptor functions.
 * @param {Function} fallback - The Reflect operation to call for default keys.
 * @param {object} target - The target object.
 * @returns {string[]|symbol[]} - The final array of keys, including additional keys from interceptors.
 */
export const runOwnKeysInterceptors = (interceptors, fallback, target) => {
  const keys = new Set(fallback(target))
  for (const interceptor of interceptors) {
    const additionalKeys = interceptor(target)
    if (Array.isArray(additionalKeys)) {
      for (const key of additionalKeys) keys.add(key)
    }
  }
  return [...keys]
}
