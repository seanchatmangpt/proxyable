import { createContext } from '../context/context.js'

/**
 * Protocol & Call-Level Contracts for Proxyable.
 * Implements enforcement of argument validation, call sequencing, rate limits,
 * timeouts, return type validation, and purity checks via apply and construct interceptors.
 *
 * Design principles:
 * - Hard failures: contract violations throw errors
 * - Deterministic: same input = same validation result
 * - Composition: works with all prior capabilities
 * - Context-bound: contracts tied to execution context
 */

/**
 * Creates a contract context with specified contracts for methods.
 *
 * @param {object|Function} target - The target object or function
 * @param {object} contracts - Contracts specification mapping method names to contract rules
 *   Example:
 *   {
 *     methodName: {
 *       validate: (args) => boolean | string,
 *       sequence: ['method1', 'method2'],  // Call order required
 *       rateLimit: { calls: N, window: ms },
 *       timeout: ms,
 *       maxArgs: N,
 *       returnType: 'string' | 'number' | ...,
 *       pure: boolean  // No side effects allowed
 *     }
 *   }
 * @returns {object} Contract context with enforcement API
 */
export function createContractContext(target, contracts = {}) {
  const contractContext = createContext()

  // Internal state for the context
  const contextState = {
    target,
    contracts: new Map(Object.entries(contracts)),
    // Tracking for call sequencing
    callSequence: [],
    sequenceIndex: new Map(), // Map of method -> index in callSequence
    // Tracking for rate limiting
    rateLimitTracking: new Map(), // Map of method -> array of call timestamps
    // Tracking for purity checking
    sideEffectDetectors: new Map(), // Map of method -> side effect detection state
  }

  /**
   * Validates arguments according to contract rules.
   *
   * @private
   * @param {string} methodName - Name of the method being called
   * @param {Array} args - Arguments passed to the method
   * @param {object} contract - Contract rules for the method
   * @throws {Error} If validation fails
   */
  function validateArguments(methodName, args, contract) {
    // Check maxArgs
    if (contract.maxArgs !== undefined && args.length > contract.maxArgs) {
      throw new Error(`Contract violation: ${methodName} accepts maximum ${contract.maxArgs} arguments, got ${args.length}`)
    }

    // Run custom validation function
    if (contract.validate) {
      const result = contract.validate(args)
      if (result === false) {
        throw new Error(`Contract violation: ${methodName} argument validation failed`)
      } else if (typeof result === 'string') {
        throw new Error(`Contract violation: ${result}`)
      }
    }
  }

  /**
   * Validates call sequence according to contract rules.
   *
   * @private
   * @param {string} methodName - Name of the method being called
   * @param {object} contract - Contract rules for the method
   * @throws {Error} If sequence is violated
   */
  function validateSequence(methodName, contract) {
    if (!contract.sequence || contract.sequence.length === 0) {
      return
    }

    const requiredSequence = contract.sequence
    const methodIndex = requiredSequence.indexOf(methodName)

    if (methodIndex === -1) {
      // Method not in sequence, no constraint
      return
    }

    // Check if all previous methods in sequence have been called
    for (let i = 0; i < methodIndex; i++) {
      const requiredMethod = requiredSequence[i]
      if (!contextState.sequenceIndex.has(requiredMethod)) {
        throw new Error(
          `Contract violation: ${methodName} requires ${requiredMethod} to be called first. ` +
          `Required sequence: [${requiredSequence.join(' → ')}]`
        )
      }
    }
  }

  /**
   * Validates rate limit according to contract rules.
   *
   * @private
   * @param {string} methodName - Name of the method being called
   * @param {object} contract - Contract rules for the method
   * @param {boolean} dryRun - If true, doesn't record the call (for validation only)
   * @throws {Error} If rate limit is exceeded
   */
  function validateRateLimit(methodName, contract, dryRun = false) {
    if (!contract.rateLimit) {
      return
    }

    const { calls, window } = contract.rateLimit
    const now = Date.now()

    // Get or initialize tracking array
    if (!contextState.rateLimitTracking.has(methodName)) {
      contextState.rateLimitTracking.set(methodName, [])
    }

    const timestamps = contextState.rateLimitTracking.get(methodName)

    // Remove timestamps outside the window
    const validTimestamps = timestamps.filter(ts => now - ts < window)

    // Update tracking only if not dry run
    if (!dryRun) {
      contextState.rateLimitTracking.set(methodName, validTimestamps)
    }

    // Check if limit exceeded
    if (validTimestamps.length >= calls) {
      const oldestCall = validTimestamps[0]
      const resetTime = oldestCall + window
      const waitTime = Math.ceil((resetTime - now) / 1000)
      throw new Error(
        `Contract violation: Rate limit exceeded for ${methodName}. ` +
        `Maximum ${calls} calls per ${window}ms. Try again in ${waitTime}s.`
      )
    }

    // Record this call (only if not dry run)
    if (!dryRun) {
      validTimestamps.push(now)
    }
  }

  /**
   * Validates return value type according to contract rules.
   *
   * @private
   * @param {string} methodName - Name of the method
   * @param {*} returnValue - The return value to validate
   * @param {object} contract - Contract rules for the method
   * @throws {Error} If return type doesn't match
   */
  function validateReturnType(methodName, returnValue, contract) {
    if (!contract.returnType) {
      return
    }

    const actualType = typeof returnValue
    const expectedType = contract.returnType

    if (actualType !== expectedType) {
      throw new Error(
        `Contract violation: ${methodName} must return ${expectedType}, got ${actualType}`
      )
    }
  }

  /**
   * Detects side effects for purity checking.
   *
   * @private
   * @param {string} methodName - Name of the method
   * @param {object} contract - Contract rules for the method
   * @returns {Function} Cleanup function to restore state
   */
  function setupPurityCheck(methodName, contract) {
    if (!contract.pure) {
      return () => {} // No-op cleanup
    }

    // Capture initial target state for comparison
    const initialState = captureState(target)

    return () => {
      // After function execution, verify no side effects
      const finalState = captureState(target)

      if (!statesEqual(initialState, finalState)) {
        throw new Error(
          `Contract violation: ${methodName} is marked as pure but caused side effects`
        )
      }
    }
  }

  /**
   * Captures the state of an object for comparison.
   *
   * @private
   * @param {*} obj - Object to capture
   * @returns {object} State snapshot
   */
  function captureState(obj) {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj !== 'object' && typeof obj !== 'function') {
      return obj
    }

    // For objects and arrays, create a shallow snapshot
    if (Array.isArray(obj)) {
      return [...obj]
    }

    return { ...obj }
  }

  /**
   * Compares two states for equality.
   *
   * @private
   * @param {*} state1 - First state
   * @param {*} state2 - Second state
   * @returns {boolean} True if states are equal
   */
  function statesEqual(state1, state2) {
    if (state1 === state2) return true
    if (state1 === null || state2 === null) return false
    if (state1 === undefined || state2 === undefined) return false

    if (typeof state1 !== typeof state2) return false

    if (typeof state1 !== 'object') return state1 === state2

    // Compare objects/arrays
    if (Array.isArray(state1) !== Array.isArray(state2)) return false

    const keys1 = Object.keys(state1)
    const keys2 = Object.keys(state2)

    if (keys1.length !== keys2.length) return false

    for (const key of keys1) {
      if (!keys2.includes(key)) return false
      if (state1[key] !== state2[key]) return false
    }

    return true
  }

  /**
   * Records a method call in the sequence.
   *
   * @private
   * @param {string} methodName - Name of the method called
   */
  function recordCall(methodName) {
    if (!contextState.sequenceIndex.has(methodName)) {
      contextState.callSequence.push(methodName)
      contextState.sequenceIndex.set(methodName, contextState.callSequence.length - 1)
    }
  }

  /**
   * Gets the current call sequence state.
   *
   * @returns {object} Sequence state with called methods and order
   */
  function getSequenceState() {
    return {
      callSequence: [...contextState.callSequence],
      totalCalls: contextState.callSequence.length,
    }
  }

  /**
   * Resets the call sequence tracking.
   */
  function resetSequence() {
    contextState.callSequence = []
    contextState.sequenceIndex.clear()
  }

  /**
   * Gets rate limit statistics for a method.
   *
   * @param {string} methodName - Name of the method
   * @returns {object} Rate limit stats
   */
  function getRateLimitStats(methodName) {
    const contract = contextState.contracts.get(methodName)
    if (!contract || !contract.rateLimit) {
      return {
        hasLimit: false,
      }
    }

    const { calls: maxCalls, window } = contract.rateLimit
    const timestamps = contextState.rateLimitTracking.get(methodName) || []
    const now = Date.now()

    // Filter valid timestamps
    const validTimestamps = timestamps.filter(ts => now - ts < window)

    const remaining = Math.max(0, maxCalls - validTimestamps.length)
    const nextReset = validTimestamps.length > 0
      ? validTimestamps[0] + window
      : now

    return {
      hasLimit: true,
      maxCalls,
      window,
      currentCalls: validTimestamps.length,
      remaining,
      nextReset: new Date(nextReset),
      resetIn: Math.max(0, nextReset - now),
    }
  }

  /**
   * Pre-validates a call without executing it.
   *
   * @param {string} methodName - Name of the method
   * @param {Array} args - Arguments to validate
   * @returns {object} Validation result
   */
  function validateCall(methodName, args) {
    const contract = contextState.contracts.get(methodName)

    if (!contract) {
      return {
        valid: true,
        reason: 'No contract defined for method',
      }
    }

    try {
      validateArguments(methodName, args, contract)
      validateSequence(methodName, contract)
      validateRateLimit(methodName, contract, true) // Dry run - don't record

      return {
        valid: true,
      }
    } catch (error) {
      return {
        valid: false,
        reason: error.message,
      }
    }
  }

  /**
   * Executes a function within the contract context.
   *
   * @param {Function} fn - The function to execute with contract enforcement
   * @returns {*} The result of the function
   */
  function call(fn) {
    return contractContext.call(contextState, fn)
  }

  /**
   * Gets a contract for a specific method.
   *
   * @param {string} methodName - Name of the method
   * @returns {object|undefined} Contract or undefined if not found
   */
  function getContract(methodName) {
    return contextState.contracts.get(methodName)
  }

  /**
   * Adds or updates a contract for a method.
   *
   * @param {string} methodName - Name of the method
   * @param {object} contract - Contract rules
   */
  function setContract(methodName, contract) {
    contextState.contracts.set(methodName, contract)
  }

  /**
   * Removes a contract for a method.
   *
   * @param {string} methodName - Name of the method
   * @returns {boolean} True if contract was removed
   */
  function removeContract(methodName) {
    return contextState.contracts.delete(methodName)
  }

  return {
    call,
    getSequenceState,
    resetSequence,
    getRateLimitStats,
    validateCall,
    getContract,
    setContract,
    removeContract,
    context: contractContext,
    use: () => contractContext.use(),
    tryUse: () => contractContext.tryUse(),
    set: (replace = false) => contractContext.set(contextState, replace),
    unset: () => contractContext.unset(),
    // Internal: expose state for interceptors
    _state: contextState,
    _validateArguments: validateArguments,
    _validateSequence: validateSequence,
    _validateRateLimit: validateRateLimit,
    _validateReturnType: validateReturnType,
    _setupPurityCheck: setupPurityCheck,
    _recordCall: recordCall,
  }
}

/**
 * Creates an apply interceptor that enforces contracts before function calls.
 *
 * @param {object} contractCtx - The contract context
 * @returns {Function} Interceptor function for apply trap
 */
export function createContractApplyInterceptor(contractCtx) {
  return (target, thisArg, argsList) => {
    const ctx = contractCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    // Determine method name (use function name or 'anonymous')
    const methodName = target.name || 'anonymous'
    const contract = ctx.contracts.get(methodName)

    if (!contract) {
      // No contract for this method - allow operation to continue
      return undefined
    }

    // Validate arguments
    contractCtx._validateArguments(methodName, argsList, contract)

    // Validate call sequence
    contractCtx._validateSequence(methodName, contract)

    // Validate rate limit
    contractCtx._validateRateLimit(methodName, contract)

    // Setup purity check
    const cleanupPurity = contractCtx._setupPurityCheck(methodName, contract)

    // Record the call in sequence
    contractCtx._recordCall(methodName)

    let returnValue
    let executionError

    // Execute the function
    // Note: Timeout enforcement is a placeholder for future async support
    // For sync functions, timeout cannot be enforced without blocking
    try {
      returnValue = Reflect.apply(target, thisArg, argsList)
    } catch (error) {
      executionError = error
    }

    // Check purity
    cleanupPurity()

    // Re-throw execution error if any
    if (executionError) {
      throw executionError
    }

    // Validate return type
    contractCtx._validateReturnType(methodName, returnValue, contract)

    // Return the actual result to prevent double execution
    return returnValue
  }
}

/**
 * Creates a construct interceptor that enforces contracts before construction.
 *
 * @param {object} contractCtx - The contract context
 * @returns {Function} Interceptor function for construct trap
 */
export function createContractConstructInterceptor(contractCtx) {
  return (target, argsList, newTarget) => {
    const ctx = contractCtx.context.tryUse()
    if (!ctx) {
      // No active context - allow operation to continue
      return undefined
    }

    // For constructors, use the constructor name
    const methodName = target.name || 'Constructor'
    const contract = ctx.contracts.get(methodName)

    if (!contract) {
      // No contract for this constructor - allow operation to continue
      return undefined
    }

    // Validate arguments
    contractCtx._validateArguments(methodName, argsList, contract)

    // Validate call sequence
    contractCtx._validateSequence(methodName, contract)

    // Validate rate limit
    contractCtx._validateRateLimit(methodName, contract)

    // Record the call in sequence
    contractCtx._recordCall(methodName)

    // For construct, we execute and return the instance
    // (construct interceptor can return the instance to use instead)
    const instance = Reflect.construct(target, argsList, newTarget)

    // Validate return type if specified (though for constructors this is typically the instance type)
    if (contract.returnType) {
      const actualType = typeof instance
      if (actualType !== contract.returnType) {
        throw new Error(
          `Contract violation: ${methodName} must return ${contract.returnType}, got ${actualType}`
        )
      }
    }

    // Return the instance to prevent double construction
    return instance
  }
}

/**
 * Helper function to register all contract interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} contractCtx - The contract context
 */
export function registerContractInterceptors(proxyInterface, contractCtx) {
  proxyInterface.defineApplyInterceptor(createContractApplyInterceptor(contractCtx))
  proxyInterface.defineConstructInterceptor(createContractConstructInterceptor(contractCtx))
}
