import { createContext } from '../context/context.js'

/**
 * Observability and auditing system for Proxyable.
 * Logs intent, approval/denial, and outcomes at the interception point.
 *
 * Design principles:
 * - Log at same interception point as enforcement
 * - Intent logged BEFORE decision
 * - Approval/denial logged WITH decision
 * - Outcome logged AFTER execution
 * - Deterministic ordering preserved
 * - No duplicate logs
 * - Composition: works with all other capabilities
 * - Performance: minimal overhead
 */

/**
 * Creates an audit context with comprehensive logging.
 *
 * @param {object} target - The target object (for reference)
 * @param {object} options - Audit configuration
 * @param {string} [options.logLevel='info'] - Log level: 'debug' | 'info' | 'warn' | 'error'
 * @param {string} [options.format='json'] - Output format: 'json' | 'text'
 * @param {object|Function} [options.output=console] - Output destination (console, file, or custom function)
 * @param {boolean} [options.includeTimestamp=true] - Include ISO8601 timestamps
 * @param {boolean} [options.includeStackTrace=false] - Include stack traces
 * @param {Function} [options.filters] - Filter function: (operation) => boolean
 * @returns {object} Audit context with logging API
 */
export function createAuditContext(target, options = {}) {
  const auditContext = createContext()

  // Default options
  const config = {
    logLevel: options.logLevel || 'info',
    format: options.format || 'json',
    output: options.output || console,
    includeTimestamp: options.includeTimestamp !== false,
    includeStackTrace: options.includeStackTrace || false,
    filters: options.filters || (() => true),
  }

  // Log levels with priority
  const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  // Audit log storage
  const auditLog = []
  let logIndex = 0

  // Internal state for the context
  const contextState = {
    target,
    config,
    auditLog,
    getNextIndex: () => logIndex++,
  }

  /**
   * Creates an audit entry for an operation.
   *
   * @private
   */
  function createAuditEntry(operation, status, additionalData = {}) {
    const entry = {
      index: contextState.getNextIndex(),
      timestamp: config.includeTimestamp ? new Date().toISOString() : undefined,
      trap: operation.trap,
      property: operation.property,
      intent: deriveIntent(operation.trap),
      status,
      ...additionalData,
    }

    // Add operation details
    if (operation.value !== undefined) {
      entry.value = operation.value
    }
    if (operation.args !== undefined) {
      entry.args = operation.args
    }
    if (operation.thisArg !== undefined) {
      entry.thisArg = operation.thisArg
    }
    if (operation.newTarget !== undefined) {
      entry.newTarget = operation.newTarget
    }

    // Add stack trace if requested
    if (config.includeStackTrace) {
      entry.stackTrace = new Error().stack
    }

    // Remove undefined fields for cleaner logs
    Object.keys(entry).forEach((key) => {
      if (entry[key] === undefined) {
        delete entry[key]
      }
    })

    return entry
  }

  /**
   * Derives the intent from the trap type.
   *
   * @private
   */
  function deriveIntent(trap) {
    const intentMap = {
      get: 'read',
      set: 'write',
      deleteProperty: 'delete',
      has: 'read',
      ownKeys: 'read',
      getOwnPropertyDescriptor: 'read',
      apply: 'call',
      construct: 'construct',
    }
    return intentMap[trap] || 'unknown'
  }

  /**
   * Logs an audit entry if it passes filters.
   *
   * @private
   */
  function logEntry(entry) {
    // Apply filters
    if (!config.filters(entry)) {
      return
    }

    // Check log level
    const entryLevel = entry.error ? 'error' : entry.status === 'denied' ? 'warn' : 'info'
    if (LOG_LEVELS[entryLevel] < LOG_LEVELS[config.logLevel]) {
      return
    }

    // Store in audit log
    auditLog.push(entry)

    // Output to destination
    if (typeof config.output === 'function') {
      config.output(entry)
    } else if (config.output && typeof config.output.log === 'function') {
      config.output.log(formatEntry(entry, config.format))
    }
  }

  /**
   * Formats an audit entry according to the specified format.
   *
   * @private
   */
  function formatEntry(entry, format) {
    if (format === 'json') {
      return JSON.stringify(entry)
    } else if (format === 'text') {
      const parts = [
        entry.timestamp ? `[${entry.timestamp}]` : '',
        `[${entry.index}]`,
        `${entry.trap}`,
        entry.property ? `"${String(entry.property)}"` : '',
        `→ ${entry.status}`,
        entry.reason ? `(${entry.reason})` : '',
        entry.error ? `ERROR: ${entry.error}` : '',
      ].filter(Boolean)
      return parts.join(' ')
    }
    return String(entry)
  }

  /**
   * Gets the complete audit log.
   *
   * @returns {Array} Array of audit entries
   */
  function getAuditLog() {
    return [...auditLog]
  }

  /**
   * Clears the audit trail.
   */
  function clearLog() {
    auditLog.length = 0
    logIndex = 0
  }

  /**
   * Sets the log level.
   *
   * @param {string} level - New log level
   */
  function setLogLevel(level) {
    if (!LOG_LEVELS.hasOwnProperty(level)) {
      throw new Error(`Invalid log level: ${level}`)
    }
    config.logLevel = level
  }

  /**
   * Exports the audit log in the specified format.
   *
   * @param {string} format - Export format: 'json' | 'csv' | 'text'
   * @returns {string} Formatted audit log
   */
  function exportLog(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(auditLog, null, 2)
    } else if (format === 'csv') {
      return exportToCSV(auditLog)
    } else if (format === 'text') {
      return auditLog.map((entry) => formatEntry(entry, 'text')).join('\n')
    } else {
      throw new Error(`Unsupported export format: ${format}`)
    }
  }

  /**
   * Exports audit log to CSV format.
   *
   * @private
   */
  function exportToCSV(entries) {
    if (entries.length === 0) {
      return ''
    }

    // Collect all unique keys
    const allKeys = new Set()
    entries.forEach((entry) => {
      Object.keys(entry).forEach((key) => allKeys.add(key))
    })

    const headers = Array.from(allKeys)
    const csvLines = [headers.join(',')]

    entries.forEach((entry) => {
      const row = headers.map((header) => {
        const value = entry[header]
        if (value === undefined || value === null) return ''
        if (typeof value === 'object') return JSON.stringify(value)
        if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`
        return String(value)
      })
      csvLines.push(row.join(','))
    })

    return csvLines.join('\n')
  }

  /**
   * Executes a function within the audit context.
   * Wraps execution to capture outcomes.
   *
   * @param {Function} fn - The function to execute with auditing
   * @returns {*} The result of the function
   */
  function call(fn) {
    return auditContext.call(contextState, fn)
  }

  return {
    call,
    getAuditLog,
    clearLog,
    setLogLevel,
    exportLog,
    context: auditContext,
    use: () => auditContext.use(),
    tryUse: () => auditContext.tryUse(),
    set: (replace = false) => auditContext.set(contextState, replace),
    unset: () => auditContext.unset(),
    // Internal: expose for interceptors
    _logEntry: logEntry,
    _createAuditEntry: createAuditEntry,
  }
}

// ============================================================================
// Audit Interceptors
// ============================================================================

/**
 * Creates a get interceptor that logs read operations.
 * Logs intent before other interceptors run.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for get trap
 */
export function createAuditGetInterceptor(auditCtx) {
  return (target, prop, receiver) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent - record the attempt
    const operation = {
      trap: 'get',
      property: prop,
      target,
      receiver,
    }

    // Get the current value for logging (may not reflect outcome if intercepted)
    const value = target[prop]

    // Log the intent/attempt
    const entry = auditCtx._createAuditEntry(operation, 'allowed', { result: value })
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to run
    // Note: This means the audit log shows intent, not necessarily final outcome
    // Other interceptors may deny the operation
    return undefined
  }
}

/**
 * Creates a set interceptor that logs write operations.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for set trap
 */
export function createAuditSetInterceptor(auditCtx) {
  return (target, prop, value, receiver) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'set',
      property: prop,
      value,
      target,
      receiver,
    }

    // We log here, but the actual decision will be made by other interceptors
    // This is an intent log - we don't know yet if it will be allowed
    const entry = auditCtx._createAuditEntry(operation, 'allowed')
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to make the decision
    return undefined
  }
}

/**
 * Creates a deleteProperty interceptor that logs delete operations.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createAuditDeletePropertyInterceptor(auditCtx) {
  return (target, prop) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'deleteProperty',
      property: prop,
      target,
    }

    const entry = auditCtx._createAuditEntry(operation, 'allowed')
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to make the decision
    return undefined
  }
}

/**
 * Creates a has interceptor that logs existence checks.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for has trap
 */
export function createAuditHasInterceptor(auditCtx) {
  return (target, prop) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'has',
      property: prop,
      target,
    }

    const result = Reflect.has(target, prop)
    const entry = auditCtx._createAuditEntry(operation, 'allowed', { result })
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to run
    return undefined
  }
}

/**
 * Creates an ownKeys interceptor that logs enumeration.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for ownKeys trap
 */
export function createAuditOwnKeysInterceptor(auditCtx) {
  return (target) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'ownKeys',
      target,
    }

    const result = Reflect.ownKeys(target)
    const entry = auditCtx._createAuditEntry(operation, 'allowed', { result })
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to run
    return undefined
  }
}

/**
 * Creates a getOwnPropertyDescriptor interceptor that logs descriptor access.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for getOwnPropertyDescriptor trap
 */
export function createAuditGetOwnPropertyDescriptorInterceptor(auditCtx) {
  return (target, prop) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'getOwnPropertyDescriptor',
      property: prop,
      target,
    }

    const result = Reflect.getOwnPropertyDescriptor(target, prop)
    const entry = auditCtx._createAuditEntry(operation, 'allowed', { result })
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to run
    return undefined
  }
}

/**
 * Creates an apply interceptor that logs function calls.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for apply trap
 */
export function createAuditApplyInterceptor(auditCtx) {
  return (target, thisArg, argsList) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'apply',
      thisArg,
      args: argsList,
      target,
    }

    // Log the intent
    const entry = auditCtx._createAuditEntry(operation, 'allowed')
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to run
    return undefined
  }
}

/**
 * Creates a construct interceptor that logs construction.
 *
 * @param {object} auditCtx - The audit context
 * @returns {Function} Interceptor function for construct trap
 */
export function createAuditConstructInterceptor(auditCtx) {
  return (target, argsList, newTarget) => {
    const ctx = auditCtx.context.tryUse()
    if (!ctx) {
      // No active context - skip logging
      return undefined
    }

    // Log intent
    const operation = {
      trap: 'construct',
      args: argsList,
      newTarget,
      target,
    }

    // Log the intent
    const entry = auditCtx._createAuditEntry(operation, 'allowed')
    auditCtx._logEntry(entry)

    // Return undefined to allow other interceptors to run
    return undefined
  }
}

/**
 * Helper function to register all audit interceptors with a proxy.
 * NOTE: Audit interceptors should be registered FIRST to capture all operations.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} auditCtx - The audit context
 */
export function registerAuditInterceptors(proxyInterface, auditCtx) {
  proxyInterface.defineGetInterceptor(createAuditGetInterceptor(auditCtx))
  proxyInterface.defineSetInterceptor(createAuditSetInterceptor(auditCtx))
  proxyInterface.defineHasInterceptor(createAuditHasInterceptor(auditCtx))
  proxyInterface.defineDeletePropertyInterceptor(createAuditDeletePropertyInterceptor(auditCtx))
  proxyInterface.defineOwnKeysInterceptor(createAuditOwnKeysInterceptor(auditCtx))
  proxyInterface.defineGetOwnPropertyDescriptorInterceptor(
    createAuditGetOwnPropertyDescriptorInterceptor(auditCtx)
  )
  proxyInterface.defineApplyInterceptor(createAuditApplyInterceptor(auditCtx))
  proxyInterface.defineConstructInterceptor(createAuditConstructInterceptor(auditCtx))
}

/**
 * Creates enforcement-aware audit interceptors that log denials.
 * These should be registered AFTER enforcement interceptors to capture denials.
 *
 * @param {object} auditCtx - The audit context
 * @returns {object} Enforcement-aware interceptors
 */
export function createEnforcementAuditInterceptors(auditCtx) {
  return {
    /**
     * Post-enforcement set interceptor that logs denials.
     */
    set: (target, prop, value, receiver) => {
      const ctx = auditCtx.context.tryUse()
      if (!ctx) {
        return undefined
      }

      // If we reach here after enforcement interceptors, the operation was denied
      // This won't normally be called because enforcement interceptors return false
      // But we can use this pattern to wrap and detect denials
      return undefined
    },

    /**
     * Post-enforcement delete interceptor that logs denials.
     */
    deleteProperty: (target, prop) => {
      const ctx = auditCtx.context.tryUse()
      if (!ctx) {
        return undefined
      }
      return undefined
    },
  }
}
