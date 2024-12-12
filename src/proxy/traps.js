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
 * If any interceptor returns `false`, the operation is blocked. Otherwise, the fallback is executed.
 *
 * @param {Function[]} interceptors - An array of interceptor functions.
 * @param {Function} fallback - The Reflect operation to call if all interceptors allow.
 * @param {...any} args - Arguments to pass to the interceptors and the fallback.
 * @returns {boolean|*} - `false` if any interceptor denies, or the fallback result.
 */
export const runBooleanInterceptors = (interceptors, fallback, ...args) => {
  for (const interceptor of interceptors) {
    const allowed = interceptor(...args)
    if (allowed === false) return false
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
      additionalKeys.forEach((key) => keys.add(key))
    }
  }
  return Array.from(keys)
}
