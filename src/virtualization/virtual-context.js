import { createContext } from '../context/context.js'

/**
 * Virtual Context for Lazy Computation & Virtual Objects
 *
 * Implements a system where GET interceptors can synthesize values, memoize per context,
 * and redirect to alternate storage, making virtual fields indistinguishable from real ones.
 */

/**
 * Creates a virtual context with lazy computation and memoization support.
 *
 * @param {object} target - The target object to virtualize
 * @param {object} virtualSpec - Virtualization specification
 * @param {object} virtualSpec.virtualFields - Map of virtual field definitions
 * @param {Map|object} [virtualSpec.alternateStorage] - External storage backend
 * @param {object} [virtualSpec.redirects] - Map of real fields to virtual fields
 * @returns {object} Virtual API with call, invalidateCache, getVirtualValue, etc.
 */
export function createVirtualContext(target, virtualSpec = {}) {
  const virtualContext = createContext()

  const {
    virtualFields = {},
    alternateStorage = null,
    redirects = {}
  } = virtualSpec

  /**
   * Executes a function within a virtual context.
   * All virtual fields will be computed lazily and memoized per context.
   *
   * @param {Function} fn - The function to execute within virtual context
   * @returns {*} The result of the function
   */
  function call(fn) {
    const contextLocalCache = new Map()
    const ttlTimestamps = new Map()

    const contextState = {
      active: true,
      cache: contextLocalCache,
      ttlTimestamps,
      virtualFields,
      alternateStorage,
      redirects,
      target
    }

    // Define virtual fields as accessors on target to make them fully functional
    const descriptorsToRestore = new Map()

    for (const fieldName of Object.keys(virtualFields)) {
      const virtualDef = virtualFields[fieldName]

      // Save existing descriptor if present
      if (Reflect.has(target, fieldName)) {
        descriptorsToRestore.set(fieldName, Object.getOwnPropertyDescriptor(target, fieldName))
      } else {
        descriptorsToRestore.set(fieldName, null)
      }

      // Define accessor property that integrates with our interceptors
      try {
        Object.defineProperty(target, fieldName, {
          configurable: true,
          enumerable: true,
          get() {
            // This getter is a fallback - the get interceptor should handle it first
            // But if it doesn't, compute the value
            if (virtualDef.compute) {
              return virtualDef.compute(target, contextState)
            }
            return undefined
          },
          set(value) {
            // Store the value in the appropriate storage
            const storageType = virtualDef.storage || 'context'

            if (storageType === 'context') {
              contextState.cache.set(fieldName, value)
              if (virtualDef.ttl) {
                contextState.ttlTimestamps.set(fieldName, Date.now())
              }
            } else if (storageType === 'target') {
              const storageKey = `__virtual_${fieldName}`
              Reflect.set(target, storageKey, value)
            } else if (storageType === 'external' && alternateStorage) {
              if (typeof alternateStorage.set === 'function') {
                alternateStorage.set(fieldName, value)
              } else {
                alternateStorage[fieldName] = value
              }
            }
          }
        })
      } catch {
        // If defineProperty fails, skip this field
      }
    }

    // Handle redirected fields
    for (const [sourceName, targetName] of Object.entries(redirects)) {
      if (!descriptorsToRestore.has(sourceName)) {
        if (Reflect.has(target, sourceName)) {
          descriptorsToRestore.set(sourceName, Object.getOwnPropertyDescriptor(target, sourceName))
        } else {
          descriptorsToRestore.set(sourceName, null)

          try {
            Object.defineProperty(target, sourceName, {
              configurable: true,
              enumerable: true,
              get() {
                // Redirect to the target virtual field
                const virtualDef = virtualFields[targetName]
                if (virtualDef && virtualDef.compute) {
                  return virtualDef.compute(target, contextState)
                }
                return undefined
              },
              set(value) {
                // Redirect writes to the target virtual field's storage
                const virtualDef = virtualFields[targetName]
                if (!virtualDef) return

                const storageType = virtualDef.storage || 'context'
                if (storageType === 'context') {
                  contextState.cache.set(targetName, value)
                } else if (storageType === 'target') {
                  const storageKey = `__virtual_${targetName}`
                  Reflect.set(target, storageKey, value)
                } else if (storageType === 'external' && alternateStorage) {
                  if (typeof alternateStorage.set === 'function') {
                    alternateStorage.set(targetName, value)
                  } else {
                    alternateStorage[targetName] = value
                  }
                }
              }
            })
          } catch {
            // If defineProperty fails, skip
          }
        }
      }
    }

    try {
      return virtualContext.call(contextState, fn)
    } finally {
      // Restore original descriptors
      for (const [fieldName, descriptor] of descriptorsToRestore) {
        if (descriptor) {
          Object.defineProperty(target, fieldName, descriptor)
        } else {
          delete target[fieldName]
        }
      }
    }
  }

  /**
   * Invalidates the cached value for a virtual field.
   * This only affects the current context if inside call().
   *
   * @param {string} field - The field to invalidate
   */
  function invalidateCache(field) {
    const state = virtualContext.tryUse()
    if (!state || !state.active) {
      return
    }

    state.cache.delete(field)
    state.ttlTimestamps.delete(field)
  }

  /**
   * Computes a virtual value directly, bypassing cache.
   *
   * @param {string} field - The field to compute
   * @returns {*} The computed value
   */
  function getVirtualValue(field) {
    const virtualDef = virtualFields[field]
    if (!virtualDef || !virtualDef.compute) {
      return undefined
    }

    const state = virtualContext.tryUse()
    const context = state || { target }

    return virtualDef.compute(target, context)
  }

  /**
   * Gets the memoized value for a field if available.
   *
   * @param {string} field - The field to retrieve
   * @returns {*} The cached value or undefined
   */
  function getMemoized(field) {
    const state = virtualContext.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    return state.cache.get(field)
  }

  /**
   * Sets a value in alternate storage.
   *
   * @param {string} field - The field to set
   * @param {*} value - The value to store
   */
  function setStorage(field, value) {
    if (!alternateStorage) {
      return
    }

    if (typeof alternateStorage.set === 'function') {
      alternateStorage.set(field, value)
    } else {
      alternateStorage[field] = value
    }
  }

  /**
   * Gets a value from alternate storage.
   *
   * @param {string} field - The field to retrieve
   * @returns {*} The value from storage
   */
  function getFromStorage(field) {
    if (!alternateStorage) {
      return undefined
    }

    if (typeof alternateStorage.get === 'function') {
      return alternateStorage.get(field)
    }

    return alternateStorage[field]
  }

  /**
   * Checks if a field is virtual.
   *
   * @param {string} field - The field to check
   * @returns {boolean} True if the field is virtual
   */
  function isVirtualField(field) {
    return field in virtualFields
  }

  /**
   * Gets all virtual field names.
   *
   * @returns {string[]} Array of virtual field names
   */
  function getVirtualFields() {
    return Object.keys(virtualFields)
  }

  return {
    call,
    invalidateCache,
    getVirtualValue,
    getMemoized,
    setStorage,
    getFromStorage,
    isVirtualField,
    getVirtualFields,
    context: virtualContext,
    // Internal: expose for interceptors
    _virtualFields: virtualFields,
    _alternateStorage: alternateStorage,
    _redirects: redirects,
    _target: target
  }
}

/**
 * Creates a get interceptor for virtual fields.
 * Handles computed values, memoization, TTL, and redirects.
 *
 * @param {object} virtualCtx - The virtual context created by createVirtualContext
 * @returns {Function} Interceptor function for get trap
 */
export function createVirtualGetInterceptor(virtualCtx) {
  return (target, prop, receiver) => {
    const state = virtualCtx.context.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    // Check if this property is redirected to a virtual field
    const redirectedField = state.redirects[prop]
    const effectiveField = redirectedField || prop

    // Check if this is a virtual field
    const virtualDef = state.virtualFields[effectiveField]
    if (!virtualDef) {
      return undefined
    }

    // If the virtual field has a compute function
    if (!virtualDef.compute) {
      return undefined
    }

    const storageType = virtualDef.storage || 'context'

    // Always check for stored/written values first, regardless of memoize setting
    // This allows writes to override computed values
    if (storageType === 'context') {
      if (state.cache.has(effectiveField)) {
        // Check TTL expiration if applicable
        if (virtualDef.ttl) {
          const cachedTime = state.ttlTimestamps.get(effectiveField)
          if (cachedTime && (Date.now() - cachedTime) > virtualDef.ttl) {
            // Expired - invalidate cache
            state.cache.delete(effectiveField)
            state.ttlTimestamps.delete(effectiveField)
          } else {
            // Not expired, return cached value
            return state.cache.get(effectiveField)
          }
        } else {
          // No TTL, return cached value
          return state.cache.get(effectiveField)
        }
      }
    } else if (storageType === 'target') {
      // Check if stored on target (with special prefix to avoid conflicts)
      const storageKey = `__virtual_${effectiveField}`
      if (Reflect.has(target, storageKey)) {
        return Reflect.get(target, storageKey)
      }
    } else if (storageType === 'external') {
      // Check alternate storage
      if (state.alternateStorage) {
        const hasValue = typeof state.alternateStorage.has === 'function'
          ? state.alternateStorage.has(effectiveField)
          : effectiveField in state.alternateStorage

        if (hasValue) {
          const value = typeof state.alternateStorage.get === 'function'
            ? state.alternateStorage.get(effectiveField)
            : state.alternateStorage[effectiveField]
          return value
        }
      }
    }

    // No stored value found, compute the value
    const computedValue = virtualDef.compute(target, state)

    // Store based on memoization setting or if explicit storage type is specified
    // Auto-enable memoization for fields with explicit storage
    const shouldMemoize = virtualDef.memoize === true ||
                          (virtualDef.memoize !== false && storageType !== 'context')

    if (shouldMemoize || virtualDef.memoize === true) {
      if (storageType === 'context') {
        state.cache.set(effectiveField, computedValue)
        if (virtualDef.ttl) {
          state.ttlTimestamps.set(effectiveField, Date.now())
        }
      } else if (storageType === 'target') {
        const storageKey = `__virtual_${effectiveField}`
        Reflect.set(target, storageKey, computedValue)
      } else if (storageType === 'external' && state.alternateStorage) {
        if (typeof state.alternateStorage.set === 'function') {
          state.alternateStorage.set(effectiveField, computedValue)
        } else {
          state.alternateStorage[effectiveField] = computedValue
        }
      }
    }

    return computedValue
  }
}

/**
 * Creates a has interceptor for virtual fields.
 * Makes virtual fields appear as if they exist on the object.
 *
 * @param {object} virtualCtx - The virtual context created by createVirtualContext
 * @returns {Function} Interceptor function for has trap
 */
export function createVirtualHasInterceptor(virtualCtx) {
  return (target, prop) => {
    const state = virtualCtx.context.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    // Check redirects
    const redirectedField = state.redirects[prop]
    const effectiveField = redirectedField || prop

    // If it's a virtual field, return true
    if (effectiveField in state.virtualFields) {
      return true
    }

    return undefined
  }
}

/**
 * Creates an ownKeys interceptor for virtual fields.
 * Includes virtual fields in enumeration.
 *
 * @param {object} virtualCtx - The virtual context created by createVirtualContext
 * @returns {Function} Interceptor function for ownKeys trap
 */
export function createVirtualOwnKeysInterceptor(virtualCtx) {
  return (target) => {
    const state = virtualCtx.context.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    // Get real keys from target
    const realKeys = Reflect.ownKeys(target)

    // Get virtual field names
    const virtualKeys = Object.keys(state.virtualFields)

    // Get redirect source keys
    const redirectKeys = Object.keys(state.redirects)

    // Merge all keys (use Set to avoid duplicates)
    const allKeys = new Set([...realKeys, ...virtualKeys, ...redirectKeys])

    return Array.from(allKeys)
  }
}

/**
 * Creates a getOwnPropertyDescriptor interceptor for virtual fields.
 * Returns property descriptors for virtual fields.
 *
 * @param {object} virtualCtx - The virtual context created by createVirtualContext
 * @returns {Function} Interceptor function for getOwnPropertyDescriptor trap
 */
export function createVirtualGetOwnPropertyDescriptorInterceptor(virtualCtx) {
  return (target, prop) => {
    const state = virtualCtx.context.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    // Check redirects
    const redirectedField = state.redirects[prop]
    const effectiveField = redirectedField || prop

    // If it's a virtual field, return a descriptor
    if (effectiveField in state.virtualFields) {
      const virtualDef = state.virtualFields[effectiveField]

      return {
        enumerable: true,
        configurable: true,
        // Virtual fields with writable storage can be written to
        writable: virtualDef.storage === 'external' || virtualDef.storage === 'target'
      }
    }

    return undefined
  }
}

/**
 * Creates a set interceptor for virtual fields.
 * Handles writes to virtual fields based on storage strategy.
 *
 * @param {object} virtualCtx - The virtual context created by createVirtualContext
 * @returns {Function} Interceptor function for set trap
 */
export function createVirtualSetInterceptor(virtualCtx) {
  return (target, prop, value, receiver) => {
    const state = virtualCtx.context.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    // Check redirects
    const redirectedField = state.redirects[prop]
    const effectiveField = redirectedField || prop

    // If it's a virtual field
    const virtualDef = state.virtualFields[effectiveField]
    if (!virtualDef) {
      return undefined
    }

    const storageType = virtualDef.storage || 'context'

    // Handle writes based on storage type
    if (storageType === 'context') {
      // Write to context cache
      state.cache.set(effectiveField, value)
      if (virtualDef.ttl) {
        state.ttlTimestamps.set(effectiveField, Date.now())
      }
      // Return undefined to allow the operation to continue through other interceptors
      // The actual blocking/allowing is handled by the boolean interceptor pattern
      return undefined
    } else if (storageType === 'target') {
      // Write to target with special prefix
      const storageKey = `__virtual_${effectiveField}`
      Reflect.set(target, storageKey, value)
      return undefined
    } else if (storageType === 'external') {
      // Write to alternate storage
      if (state.alternateStorage) {
        if (typeof state.alternateStorage.set === 'function') {
          state.alternateStorage.set(effectiveField, value)
        } else {
          state.alternateStorage[effectiveField] = value
        }
        return undefined
      }
      return false
    } else {
      // For computed-only (no storage), block writes
      return false
    }
  }
}

/**
 * Creates a deleteProperty interceptor for virtual fields.
 * Handles deletion by invalidating cache.
 *
 * @param {object} virtualCtx - The virtual context created by createVirtualContext
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createVirtualDeletePropertyInterceptor(virtualCtx) {
  return (target, prop) => {
    const state = virtualCtx.context.tryUse()
    if (!state || !state.active) {
      return undefined
    }

    // Check redirects
    const redirectedField = state.redirects[prop]
    const effectiveField = redirectedField || prop

    // If it's a virtual field
    const virtualDef = state.virtualFields[effectiveField]
    if (!virtualDef) {
      return undefined
    }

    const storageType = virtualDef.storage || 'context'

    // Invalidate cache/storage based on storage type
    if (storageType === 'context') {
      state.cache.delete(effectiveField)
      state.ttlTimestamps.delete(effectiveField)
      return true
    } else if (storageType === 'target') {
      const storageKey = `__virtual_${effectiveField}`
      return Reflect.deleteProperty(target, storageKey)
    } else if (storageType === 'external') {
      if (state.alternateStorage) {
        if (typeof state.alternateStorage.delete === 'function') {
          return state.alternateStorage.delete(effectiveField)
        } else {
          delete state.alternateStorage[effectiveField]
          return true
        }
      }
      return false
    } else {
      // For computed-only, just clear from cache
      state.cache.delete(effectiveField)
      state.ttlTimestamps.delete(effectiveField)
      return true
    }
  }
}

/**
 * Helper function to register all virtual interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} virtualCtx - The virtual context
 */
export function registerVirtualInterceptors(proxyInterface, virtualCtx) {
  proxyInterface.defineGetInterceptor(createVirtualGetInterceptor(virtualCtx))
  proxyInterface.defineHasInterceptor(createVirtualHasInterceptor(virtualCtx))
  proxyInterface.defineOwnKeysInterceptor(createVirtualOwnKeysInterceptor(virtualCtx))
  proxyInterface.defineGetOwnPropertyDescriptorInterceptor(
    createVirtualGetOwnPropertyDescriptorInterceptor(virtualCtx)
  )
  proxyInterface.defineSetInterceptor(createVirtualSetInterceptor(virtualCtx))
  proxyInterface.defineDeletePropertyInterceptor(createVirtualDeletePropertyInterceptor(virtualCtx))
}
