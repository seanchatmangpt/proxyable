import { createContext } from '../context/context.js'

/**
 * Capability-based access control for Proxyable.
 * Implements possession-based security: having the context = having the authority.
 *
 * Capabilities are fail-closed: operations are denied unless explicitly granted.
 * All state is bound to execution context - no global state.
 */

/**
 * Creates a capability context with specified permissions.
 *
 * @param {object} target - The target object (for reference, not stored)
 * @param {object} capabilities - Capability specifications
 * @param {Set<string|symbol>|Function} [capabilities.canRead] - Readable properties (Set or predicate function)
 * @param {Set<string|symbol>|Function} [capabilities.canWrite] - Writable properties (Set or predicate function)
 * @param {Set<string|symbol>|Function} [capabilities.canDelete] - Deletable properties (Set or predicate function)
 * @param {boolean|Function} [capabilities.canConstruct] - Construction permission (boolean or predicate)
 * @param {boolean|Function} [capabilities.canApply] - Application permission (boolean or predicate)
 * @returns {object} Context object with methods to manage capability context
 */
export function createCapabilityContext(target, capabilities = {}) {
  const capabilityContext = createContext()

  // Normalize capabilities to a consistent format
  const normalizedCapabilities = {
    canRead: normalizeCapability(capabilities.canRead, new Set()),
    canWrite: normalizeCapability(capabilities.canWrite, new Set()),
    canDelete: normalizeCapability(capabilities.canDelete, new Set()),
    canConstruct: normalizeCapability(capabilities.canConstruct, false),
    canApply: normalizeCapability(capabilities.canApply, false),
  }

  // Return context with capabilities stored for use with call()
  // Do NOT set globally - capabilities should only be active within call() scope
  return {
    context: capabilityContext,
    capabilities: normalizedCapabilities,
    use: () => capabilityContext.use(),
    tryUse: () => capabilityContext.tryUse(),
    call: (callback) => capabilityContext.call(normalizedCapabilities, callback),
    set: (replace = false) => capabilityContext.set(normalizedCapabilities, replace),
    unset: () => capabilityContext.unset(),
  }
}

/**
 * Normalizes a capability specification to a consistent format.
 * @private
 */
function normalizeCapability(capability, defaultValue) {
  if (capability === undefined || capability === null) {
    return defaultValue
  }
  return capability
}

/**
 * Checks if a property capability is granted.
 * @private
 */
function hasPropertyCapability(capability, key) {
  if (!capability) return false

  if (typeof capability === 'function') {
    return capability(key)
  }

  if (capability instanceof Set) {
    return capability.has(key)
  }

  return false
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
 * Get interceptor for capability-based access control.
 * Allows access only if the property is in canRead capabilities.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for get trap
 */
export function createGetInterceptor(capabilityContext) {
  return (target, prop, receiver) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      throw new Error(`Access denied: No capability context for reading property "${String(prop)}"`)
    }

    if (!hasPropertyCapability(capabilities.canRead, prop)) {
      throw new Error(`Access denied: No read capability for property "${String(prop)}"`)
    }

    // Allow operation to continue (return undefined for composition)
    return undefined
  }
}

/**
 * Set interceptor for capability-based access control.
 * Allows writing only if the property is in canWrite capabilities.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for set trap
 */
export function createSetInterceptor(capabilityContext) {
  return (target, prop, value, receiver) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      return false
    }

    if (!hasPropertyCapability(capabilities.canWrite, prop)) {
      return false
    }

    // Allow operation to continue (return undefined to let other interceptors run)
    return undefined
  }
}

/**
 * Has interceptor for capability-based access control.
 * Returns false if the property is not readable.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for has trap
 */
export function createHasInterceptor(capabilityContext) {
  return (target, prop) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      return false
    }

    if (!hasPropertyCapability(capabilities.canRead, prop)) {
      return false
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * DeleteProperty interceptor for capability-based access control.
 * Allows deletion only if the property is in canDelete capabilities.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createDeletePropertyInterceptor(capabilityContext) {
  return (target, prop) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      return false
    }

    if (!hasPropertyCapability(capabilities.canDelete, prop)) {
      return false
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * OwnKeys interceptor for capability-based access control.
 * Filters keys to only those that are readable.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for ownKeys trap
 */
export function createOwnKeysInterceptor(capabilityContext) {
  return (target) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - return empty array
      return []
    }

    // Get all keys from target
    const allKeys = Reflect.ownKeys(target)

    // Filter to only readable keys
    const readableKeys = allKeys.filter(key =>
      hasPropertyCapability(capabilities.canRead, key)
    )

    return readableKeys
  }
}

/**
 * GetOwnPropertyDescriptor interceptor for capability-based access control.
 * Returns undefined if the property is not readable.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for getOwnPropertyDescriptor trap
 */
export function createGetOwnPropertyDescriptorInterceptor(capabilityContext) {
  return (target, prop) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      return undefined
    }

    if (!hasPropertyCapability(capabilities.canRead, prop)) {
      // Return a fake descriptor that prevents access
      return undefined
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Apply interceptor for capability-based access control.
 * Allows function application only if canApply is true.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for apply trap
 */
export function createApplyInterceptor(capabilityContext) {
  return (target, thisArg, argsList) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      throw new Error('Access denied: No capability context for function application')
    }

    if (!hasBooleanCapability(capabilities.canApply, target, thisArg, argsList)) {
      throw new Error('Access denied: No apply capability')
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Construct interceptor for capability-based access control.
 * Allows construction only if canConstruct is true.
 *
 * @param {object} capabilityContext - The capability context
 * @returns {Function} Interceptor function for construct trap
 */
export function createConstructInterceptor(capabilityContext) {
  return (target, argsList, newTarget) => {
    const capabilities = capabilityContext.context.tryUse()
    if (!capabilities) {
      // No capability context active - deny by default
      throw new Error('Access denied: No capability context for construction')
    }

    if (!hasBooleanCapability(capabilities.canConstruct, target, argsList, newTarget)) {
      throw new Error('Access denied: No construct capability')
    }

    // Allow operation to continue
    return undefined
  }
}

/**
 * Helper function to create all interceptors at once and register them with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} capabilityContext - The capability context
 */
export function registerCapabilityInterceptors(proxyInterface, capabilityContext) {
  proxyInterface.defineGetInterceptor(createGetInterceptor(capabilityContext))
  proxyInterface.defineSetInterceptor(createSetInterceptor(capabilityContext))
  proxyInterface.defineHasInterceptor(createHasInterceptor(capabilityContext))
  proxyInterface.defineDeletePropertyInterceptor(createDeletePropertyInterceptor(capabilityContext))
  proxyInterface.defineOwnKeysInterceptor(createOwnKeysInterceptor(capabilityContext))
  proxyInterface.defineGetOwnPropertyDescriptorInterceptor(
    createGetOwnPropertyDescriptorInterceptor(capabilityContext)
  )
  proxyInterface.defineApplyInterceptor(createApplyInterceptor(capabilityContext))
  proxyInterface.defineConstructInterceptor(createConstructInterceptor(capabilityContext))
}
