import { createContext } from '../context/context.js'

/**
 * Invariant enforcement system for Proxyable.
 * Implements fail-closed invariant checking that prevents state transitions
 * that violate specified rules.
 *
 * Invariants are checked BEFORE state changes are applied.
 * If any invariant fails, the operation is rejected.
 *
 * Design principles:
 * - Fail closed: operations denied unless all invariants pass
 * - Composition: works with ACL > Invariants > Transactions
 * - Context-bound: invariants tied to execution context
 * - No side effects: invariant functions must be pure
 * - Deterministic: same input = same result
 */

/**
 * Creates an invariant context with specified invariants.
 *
 * @param {object} target - The target object (for reference)
 * @param {object|Array} invariants - Invariants specification
 *   - Object: { name: invariantFn, ... }
 *   - Array: [invariantFn, ...]
 * @returns {object} Invariant context with enforcement API
 */
export function createInvariantContext(target, invariants = {}) {
  const invariantContext = createContext()

  // Normalize invariants to a Map for easy management
  const invariantMap = new Map()

  // Initialize with provided invariants
  if (Array.isArray(invariants)) {
    // Array of functions - assign auto-generated names
    invariants.forEach((fn, index) => {
      invariantMap.set(`invariant_${index}`, fn)
    })
  } else if (typeof invariants === 'object') {
    // Object with named invariants
    for (const [name, fn] of Object.entries(invariants)) {
      if (typeof fn === 'function') {
        invariantMap.set(name, fn)
      }
    }
  }

  // Internal state for the context
  const contextState = {
    invariants: invariantMap,
    target,
  }

  /**
   * Adds a new invariant to the context.
   *
   * @param {string} name - Unique name for the invariant
   * @param {Function} invariantFn - Invariant function (target, operation) => boolean|string
   * @throws {Error} If invariant name already exists
   */
  function addInvariant(name, invariantFn) {
    if (typeof invariantFn !== 'function') {
      throw new TypeError('Invariant must be a function')
    }

    if (invariantMap.has(name)) {
      throw new Error(`Invariant "${name}" already exists`)
    }

    invariantMap.set(name, invariantFn)
  }

  /**
   * Removes an invariant from the context.
   *
   * @param {string} name - Name of the invariant to remove
   * @returns {boolean} True if invariant was removed, false if not found
   */
  function removeInvariant(name) {
    return invariantMap.delete(name)
  }

  /**
   * Gets all current invariants.
   *
   * @returns {object} Object mapping names to invariant functions
   */
  function getInvariants() {
    return Object.fromEntries(invariantMap)
  }

  /**
   * Validates an operation against all invariants.
   *
   * @param {object} operation - Operation descriptor
   * @returns {object} { valid: boolean, errors: Array<string> }
   */
  function validateState(operation) {
    const errors = []

    for (const [name, invariantFn] of invariantMap) {
      try {
        const result = invariantFn(target, operation)

        if (result === false) {
          errors.push(`Invariant "${name}" failed`)
        } else if (typeof result === 'string') {
          errors.push(result)
        } else if (result !== true && result !== undefined) {
          // Treat undefined as pass (allows flexible invariants)
          errors.push(`Invariant "${name}" returned invalid result: ${result}`)
        }
      } catch (error) {
        errors.push(`Invariant "${name}" threw error: ${error.message}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Executes a function within the invariant context.
   *
   * @param {Function} fn - The function to execute with invariant enforcement
   * @returns {*} The result of the function
   */
  function call(fn) {
    return invariantContext.call(contextState, fn)
  }

  return {
    addInvariant,
    removeInvariant,
    getInvariants,
    validateState,
    call,
    context: invariantContext,
    use: () => invariantContext.use(),
    tryUse: () => invariantContext.tryUse(),
    set: (replace = false) => invariantContext.set(contextState, replace),
    unset: () => invariantContext.unset(),
    // Internal: expose state for testing
    _state: contextState,
  }
}

/**
 * Creates a set interceptor that enforces invariants before mutations.
 *
 * @param {object} invariantCtx - The invariant context
 * @returns {Function} Interceptor function for set trap
 */
export function createInvariantSetInterceptor(invariantCtx) {
  return (target, prop, value, receiver) => {
    const ctx = invariantCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    // Build operation descriptor
    const operation = {
      trap: 'set',
      property: prop,
      value,
      receiver,
      target,
    }

    // Validate against all invariants
    const validation = invariantCtx.validateState(operation)

    if (!validation.valid) {
      // Short-circuit on first failure
      throw new Error(`Invariant violation: ${validation.errors[0]}`)
    }

    // All invariants passed - allow operation to continue
    return undefined
  }
}

/**
 * Creates a deleteProperty interceptor that enforces invariants before deletions.
 *
 * @param {object} invariantCtx - The invariant context
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createInvariantDeletePropertyInterceptor(invariantCtx) {
  return (target, prop) => {
    const ctx = invariantCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    // Build operation descriptor
    const operation = {
      trap: 'deleteProperty',
      property: prop,
      target,
    }

    // Validate against all invariants
    const validation = invariantCtx.validateState(operation)

    if (!validation.valid) {
      throw new Error(`Invariant violation: ${validation.errors[0]}`)
    }

    // All invariants passed - allow operation to continue
    return undefined
  }
}

/**
 * Creates an apply interceptor that enforces invariants before function calls.
 *
 * @param {object} invariantCtx - The invariant context
 * @returns {Function} Interceptor function for apply trap
 */
export function createInvariantApplyInterceptor(invariantCtx) {
  return (target, thisArg, argsList) => {
    const ctx = invariantCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    // Build operation descriptor
    const operation = {
      trap: 'apply',
      thisArg,
      args: argsList,
      target,
    }

    // Validate against all invariants
    const validation = invariantCtx.validateState(operation)

    if (!validation.valid) {
      throw new Error(`Invariant violation: ${validation.errors[0]}`)
    }

    // All invariants passed - allow operation to continue
    return undefined
  }
}

/**
 * Creates a construct interceptor that enforces invariants before construction.
 *
 * @param {object} invariantCtx - The invariant context
 * @returns {Function} Interceptor function for construct trap
 */
export function createInvariantConstructInterceptor(invariantCtx) {
  return (target, argsList, newTarget) => {
    const ctx = invariantCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    // Build operation descriptor
    const operation = {
      trap: 'construct',
      args: argsList,
      newTarget,
      target,
    }

    // Validate against all invariants
    const validation = invariantCtx.validateState(operation)

    if (!validation.valid) {
      throw new Error(`Invariant violation: ${validation.errors[0]}`)
    }

    // All invariants passed - allow operation to continue
    return undefined
  }
}

/**
 * Helper function to register all invariant interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} invariantCtx - The invariant context
 */
export function registerInvariantInterceptors(proxyInterface, invariantCtx) {
  proxyInterface.defineSetInterceptor(createInvariantSetInterceptor(invariantCtx))
  proxyInterface.defineDeletePropertyInterceptor(createInvariantDeletePropertyInterceptor(invariantCtx))
  proxyInterface.defineApplyInterceptor(createInvariantApplyInterceptor(invariantCtx))
  proxyInterface.defineConstructInterceptor(createInvariantConstructInterceptor(invariantCtx))
}

// ============================================================================
// Common Invariant Patterns
// ============================================================================

/**
 * Creates a type-checking invariant for a specific property.
 *
 * @param {string|symbol} property - Property name to check
 * @param {Function} type - Constructor function (e.g., Number, String)
 * @returns {Function} Invariant function
 *
 * @example
 * typeInvariant('age', Number)
 * typeInvariant('name', String)
 */
export function typeInvariant(property, type) {
  return (target, operation) => {
    if (operation.trap === 'set' && operation.property === property) {
      const isValid = typeof operation.value === type.name.toLowerCase() ||
                      operation.value instanceof type ||
                      operation.value?.constructor === type

      if (!isValid) {
        return `Property "${String(property)}" must be of type ${type.name}`
      }
    }
    return true
  }
}

/**
 * Creates a range-checking invariant for numeric properties.
 *
 * @param {string|symbol} property - Property name to check
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {Function} Invariant function
 *
 * @example
 * rangeInvariant('age', 0, 150)
 * rangeInvariant('temperature', -273.15, Infinity)
 */
export function rangeInvariant(property, min, max) {
  return (target, operation) => {
    if (operation.trap === 'set' && operation.property === property) {
      const value = operation.value

      if (typeof value !== 'number') {
        return `Property "${String(property)}" must be a number`
      }

      if (value < min || value > max) {
        return `Property "${String(property)}" must be between ${min} and ${max}`
      }
    }
    return true
  }
}

/**
 * Creates an immutability invariant for specified properties.
 *
 * @param {Set<string|symbol>} properties - Properties that cannot be modified
 * @returns {Function} Invariant function
 *
 * @example
 * immutableInvariant(new Set(['id', 'createdAt']))
 */
export function immutableInvariant(properties) {
  return (target, operation) => {
    if (operation.trap === 'set' && properties.has(operation.property)) {
      // Allow setting if property doesn't exist yet (initialization)
      if (Reflect.has(target, operation.property)) {
        return `Property "${String(operation.property)}" is immutable`
      }
    }

    if (operation.trap === 'deleteProperty' && properties.has(operation.property)) {
      return `Property "${String(operation.property)}" is immutable and cannot be deleted`
    }

    return true
  }
}

/**
 * Creates a dependency invariant that checks a condition.
 *
 * @param {string} name - Name for the invariant
 * @param {Function} predicate - Predicate function (target) => boolean
 * @returns {Function} Invariant function
 *
 * @example
 * dependencyInvariant('balance', (obj) => obj.balance >= 0)
 * dependencyInvariant('email', (obj) => obj.email && obj.email.includes('@'))
 */
export function dependencyInvariant(name, predicate) {
  return (target, operation) => {
    // Create a simulated next state for validation
    const nextState = { ...target }

    if (operation.trap === 'set') {
      nextState[operation.property] = operation.value
    } else if (operation.trap === 'deleteProperty') {
      delete nextState[operation.property]
    }

    // Check predicate on next state
    if (!predicate(nextState)) {
      return `Dependency invariant "${name}" failed`
    }

    return true
  }
}

/**
 * Creates a uniqueness invariant for a property across a collection.
 *
 * @param {string|symbol} property - Property that must be unique
 * @param {Set} collection - Set to track unique values
 * @returns {Function} Invariant function
 *
 * @example
 * const emails = new Set()
 * uniquenessInvariant('email', emails)
 */
export function uniquenessInvariant(property, collection) {
  return (target, operation) => {
    if (operation.trap === 'set' && operation.property === property) {
      const value = operation.value

      // Check if value already exists in collection (but not as current value)
      const currentValue = target[property]
      if (collection.has(value) && value !== currentValue) {
        return `Property "${String(property)}" must be unique, "${value}" already exists`
      }

      // Track the value in the collection
      // Note: This is a side effect but necessary for uniqueness tracking
      // The caller should manage the collection lifecycle
    }

    return true
  }
}

/**
 * Creates a required fields invariant that ensures properties exist.
 *
 * @param {Set<string|symbol>} properties - Properties that must exist
 * @returns {Function} Invariant function
 *
 * @example
 * requiredInvariant(new Set(['id', 'name', 'email']))
 */
export function requiredInvariant(properties) {
  return (target, operation) => {
    if (operation.trap === 'deleteProperty' && properties.has(operation.property)) {
      return `Property "${String(operation.property)}" is required and cannot be deleted`
    }

    return true
  }
}

/**
 * Creates a pattern-matching invariant for string properties.
 *
 * @param {string|symbol} property - Property to validate
 * @param {RegExp} pattern - Regular expression pattern
 * @param {string} [message] - Custom error message
 * @returns {Function} Invariant function
 *
 * @example
 * patternInvariant('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format')
 * patternInvariant('phone', /^\d{3}-\d{3}-\d{4}$/)
 */
export function patternInvariant(property, pattern, message) {
  return (target, operation) => {
    if (operation.trap === 'set' && operation.property === property) {
      const value = operation.value

      if (typeof value !== 'string') {
        return `Property "${String(property)}" must be a string`
      }

      if (!pattern.test(value)) {
        return message || `Property "${String(property)}" does not match required pattern`
      }
    }

    return true
  }
}
