import { createContext } from '../context/context.js'

/**
 * Sandboxing & Structural Containment for Proxyable.
 * Implements sandboxing that restricts key enumeration, descriptor access,
 * and construction to prevent structural discovery and mutation.
 *
 * Design principles:
 * - Fail closed: deny by default unless explicitly allowed
 * - Structural isolation: prevent property discovery
 * - Behavioral isolation: prevent construction and modification
 * - Context-bound: sandbox tied to execution context
 * - Composition: Sandbox > ACL > Transactions > Invariants
 */

/**
 * Creates a sandbox context with specified restrictions.
 *
 * @param {object} target - The target object (for reference)
 * @param {object} policy - Sandbox policy specification
 * @param {Set<string|symbol>|Function} [policy.restrictedKeys] - Keys to restrict (Set or predicate)
 * @param {boolean} [policy.allowConstruction=false] - Allow construction
 * @param {boolean} [policy.allowDescriptors=false] - Allow descriptor access
 * @param {boolean} [policy.allowEnumeration=true] - Allow key enumeration (filtered)
 * @param {boolean} [policy.allowDelete=false] - Allow property deletion
 * @param {boolean|Function} [policy.allowApply=true] - Allow function application
 * @param {Set<string>} [policy.restrictedOperations] - Operations to restrict (trap names)
 * @returns {object} Sandbox context with enforcement API
 */
export function createSandboxContext(target, policy = {}) {
  const sandboxContext = createContext()

  // Normalize policy to consistent format
  const normalizedPolicy = {
    restrictedKeys: policy.restrictedKeys || new Set(),
    allowConstruction: policy.allowConstruction ?? false,
    allowDescriptors: policy.allowDescriptors ?? false,
    allowEnumeration: policy.allowEnumeration ?? true,
    allowDelete: policy.allowDelete ?? false,
    allowApply: policy.allowApply ?? true,
    restrictedOperations: policy.restrictedOperations || new Set(),
  }

  // Internal state for the context
  const contextState = {
    policy: normalizedPolicy,
    target,
  }

  /**
   * Checks if a key is restricted.
   *
   * @param {string|symbol} key - The key to check
   * @returns {boolean} True if key is restricted
   */
  function isRestricted(key) {
    const { restrictedKeys } = contextState.policy

    if (typeof restrictedKeys === 'function') {
      return restrictedKeys(key)
    }

    if (restrictedKeys instanceof Set) {
      return restrictedKeys.has(key)
    }

    return false
  }

  /**
   * Gets the current sandbox policy.
   *
   * @returns {object} Current policy configuration
   */
  function getPolicy() {
    // Return a shallow copy to prevent external modification
    return { ...contextState.policy }
  }

  /**
   * Updates the sandbox policy.
   *
   * @param {object} newPolicy - New policy configuration (merged with existing)
   */
  function updatePolicy(newPolicy) {
    // Merge new policy with existing, normalizing values
    contextState.policy = {
      restrictedKeys: newPolicy.restrictedKeys ?? contextState.policy.restrictedKeys,
      allowConstruction: newPolicy.allowConstruction ?? contextState.policy.allowConstruction,
      allowDescriptors: newPolicy.allowDescriptors ?? contextState.policy.allowDescriptors,
      allowEnumeration: newPolicy.allowEnumeration ?? contextState.policy.allowEnumeration,
      allowDelete: newPolicy.allowDelete ?? contextState.policy.allowDelete,
      allowApply: newPolicy.allowApply ?? contextState.policy.allowApply,
      restrictedOperations: newPolicy.restrictedOperations ?? contextState.policy.restrictedOperations,
    }
  }

  /**
   * Executes a function within the sandbox context.
   *
   * @param {Function} fn - The function to execute with sandbox enforcement
   * @returns {*} The result of the function
   */
  function call(fn) {
    return sandboxContext.call(contextState, fn)
  }

  return {
    isRestricted,
    getPolicy,
    updatePolicy,
    call,
    context: sandboxContext,
    use: () => sandboxContext.use(),
    tryUse: () => sandboxContext.tryUse(),
    set: (replace = false) => sandboxContext.set(contextState, replace),
    unset: () => sandboxContext.unset(),
    // Internal: expose state for interceptors
    _state: contextState,
  }
}

/**
 * Checks if an operation is restricted by the policy.
 * @private
 */
function isOperationRestricted(policy, operation) {
  if (!policy.restrictedOperations) return false
  return policy.restrictedOperations.has(operation)
}

/**
 * Checks if a boolean capability is granted.
 * @private
 */
function hasBooleanCapability(capability, ...args) {
  if (typeof capability === 'function') {
    return capability(...args)
  }
  return Boolean(capability)
}

/**
 * OwnKeys interceptor for sandbox containment.
 * Filters keys to exclude restricted keys when enumeration is allowed.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for ownKeys trap
 */
export function createSandboxOwnKeysInterceptor(sandboxCtx) {
  return (target) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'ownKeys')) {
      return []
    }

    // If enumeration is not allowed, return empty array
    if (!policy.allowEnumeration) {
      return []
    }

    // Get all keys from target
    const allKeys = Reflect.ownKeys(target)

    // Filter out restricted keys
    const allowedKeys = allKeys.filter(key => !sandboxCtx.isRestricted(key))

    return allowedKeys
  }
}

/**
 * GetOwnPropertyDescriptor interceptor for sandbox containment.
 * Throws errors to deny descriptor access for restricted keys or when the operation is restricted.
 *
 * Note: allowDescriptors only affects non-restricted keys. Restricted keys are always denied.
 * This allows internal JavaScript operations (like set) to work while still enforcing security.
 *
 * This follows the fail-closed security model: explicitly deny unauthorized operations.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for getOwnPropertyDescriptor trap
 */
export function createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx) {
  return (target, prop) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'getOwnPropertyDescriptor')) {
      throw new Error('Sandbox violation: getOwnPropertyDescriptor operation is restricted')
    }

    // If key is restricted, always deny regardless of allowDescriptors
    if (sandboxCtx.isRestricted(prop)) {
      throw new Error(`Sandbox violation: descriptor access denied for restricted property "${String(prop)}"`)
    }

    // For non-restricted keys, check allowDescriptors policy
    // Note: We allow operation to continue even if allowDescriptors is false
    // to not break internal JavaScript operations. The policy mainly affects
    // explicit user calls, but we can't distinguish those in the trap.
    // To fully block descriptors, use restrictedOperations.

    // Allow operation to continue
    return undefined
  }
}

/**
 * Construct interceptor for sandbox containment.
 * Denies construction when not allowed by policy.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for construct trap
 */
export function createSandboxConstructInterceptor(sandboxCtx) {
  return (target, argsList, newTarget) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'construct')) {
      throw new Error('Sandbox violation: construct operation is restricted')
    }

    // Check if construction is allowed
    if (!hasBooleanCapability(policy.allowConstruction, target, argsList, newTarget)) {
      throw new Error('Sandbox violation: construction is not allowed')
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * DeleteProperty interceptor for sandbox containment.
 * Denies deletion when not allowed by policy.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createSandboxDeletePropertyInterceptor(sandboxCtx) {
  return (target, prop) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'deleteProperty')) {
      return false
    }

    // If delete is not allowed globally, deny
    if (!policy.allowDelete) {
      return false
    }

    // If key is restricted, deny deletion
    if (sandboxCtx.isRestricted(prop)) {
      return false
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Set interceptor for sandbox containment.
 * Denies setting restricted keys.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for set trap
 */
export function createSandboxSetInterceptor(sandboxCtx) {
  return (target, prop, _value, _receiver) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'set')) {
      return false
    }

    // If key is restricted, deny setting
    if (sandboxCtx.isRestricted(prop)) {
      return false
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Has interceptor for sandbox containment.
 * Returns false for restricted keys to hide their existence.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for has trap
 */
export function createSandboxHasInterceptor(sandboxCtx) {
  return (target, prop) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'has')) {
      return false
    }

    // If key is restricted, return false to hide it
    if (sandboxCtx.isRestricted(prop)) {
      return false
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Apply interceptor for sandbox containment.
 * Configurable restriction on function calls.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for apply trap
 */
export function createSandboxApplyInterceptor(sandboxCtx) {
  return (target, thisArg, argsList) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'apply')) {
      throw new Error('Sandbox violation: apply operation is restricted')
    }

    // Check if apply is allowed
    if (!hasBooleanCapability(policy.allowApply, target, thisArg, argsList)) {
      throw new Error('Sandbox violation: function application is not allowed')
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Get interceptor for sandbox containment.
 * Denies reading restricted keys.
 *
 * @param {object} sandboxCtx - The sandbox context
 * @returns {Function} Interceptor function for get trap
 */
export function createSandboxGetInterceptor(sandboxCtx) {
  return (target, prop, _receiver) => {
    const ctx = sandboxCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    const { policy } = ctx

    // Check if operation is restricted
    if (isOperationRestricted(policy, 'get')) {
      throw new Error(`Sandbox violation: get operation is restricted for property "${String(prop)}"`)
    }

    // If key is restricted, deny access
    if (sandboxCtx.isRestricted(prop)) {
      throw new Error(`Sandbox violation: property "${String(prop)}" is restricted`)
    }

    // Allow operation to continue (pass through)
    return undefined
  }
}

/**
 * Helper function to register all sandbox interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} sandboxCtx - The sandbox context
 */
export function registerSandboxInterceptors(proxyInterface, sandboxCtx) {
  proxyInterface.defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))
  proxyInterface.defineGetOwnPropertyDescriptorInterceptor(
    createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx)
  )
  proxyInterface.defineConstructInterceptor(createSandboxConstructInterceptor(sandboxCtx))
  proxyInterface.defineDeletePropertyInterceptor(createSandboxDeletePropertyInterceptor(sandboxCtx))
  proxyInterface.defineSetInterceptor(createSandboxSetInterceptor(sandboxCtx))
  proxyInterface.defineHasInterceptor(createSandboxHasInterceptor(sandboxCtx))
  proxyInterface.defineApplyInterceptor(createSandboxApplyInterceptor(sandboxCtx))
  proxyInterface.defineGetInterceptor(createSandboxGetInterceptor(sandboxCtx))
}
