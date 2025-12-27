import { createContext } from '../context/context.js'

/**
 * Transaction journal system for Proxyable.
 * Implements transactional mutations with commit/rollback support.
 *
 * Mutations are intercepted and journaled instead of being applied immediately.
 * The journal can be inspected (dry-run), committed (applied via Reflect), or rolled back (discarded).
 */

/**
 * Creates a transaction context with journaling and commit/rollback support.
 *
 * @param {object} target - The target object to track mutations for
 * @returns {object} Transaction API with call, commit, rollback, getDryRun, isActive, getJournal methods
 */
export function createTransactionContext(target) {
  const transactionContext = createContext()

  // Internal transaction state - shared with interceptors
  const transactionState = {
    journal: [],
    journalIndex: 0,
    isActive: false,
  }

  /**
   * Executes a function within a transaction context.
   * All mutations during execution are journaled instead of applied.
   *
   * @param {Function} fn - The function to execute within transaction context
   * @returns {*} The result of the function
   */
  function call(fn) {
    if (transactionState.isActive) {
      // Already in a transaction, just execute the function
      return fn()
    }

    transactionState.isActive = true
    try {
      return transactionContext.call({ active: true, state: transactionState }, fn)
    } finally {
      // Note: We don't reset isActive here to allow commit/rollback after call()
    }
  }

  /**
   * Commits all pending mutations.
   * Mutations were already applied during the transaction, so this just clears the journal.
   * @returns {boolean} True if commit succeeded
   */
  function commit() {
    if (!transactionState.isActive) {
      throw new Error('No active transaction to commit')
    }

    // Mutations were already applied during transaction
    // Commit just means "keep them" and clear the journal
    transactionState.journal = []
    transactionState.journalIndex = 0
    transactionState.isActive = false
    transactionContext.unset()

    return true
  }

  /**
   * Rolls back all pending mutations by restoring previous values.
   */
  function rollback() {
    if (!transactionState.isActive) {
      throw new Error('No active transaction to rollback')
    }

    // Restore previous values in reverse order
    for (let i = transactionState.journal.length - 1; i >= 0; i--) {
      const entry = transactionState.journal[i]

      switch (entry.operation) {
        case 'set': {
          if (entry.previousValue === undefined && !Reflect.has(target, entry.property)) {
            // Property didn't exist before, delete it
            Reflect.deleteProperty(target, entry.property)
          } else {
            // Restore previous value
            Reflect.set(target, entry.property, entry.previousValue)
          }
          break
        }

        case 'delete': {
          // Restore deleted property
          if (entry.previousValue !== undefined || entry.hadProperty) {
            Reflect.set(target, entry.property, entry.previousValue)
          }
          break
        }

        case 'apply':
        case 'construct': {
          // Function calls and constructions can't be rolled back
          // They're journaled for audit purposes only
          break
        }

        default: {
          // Unknown operation type, skip
          break
        }
      }
    }

    // Clear transaction state
    transactionState.journal = []
    transactionState.journalIndex = 0
    transactionState.isActive = false
    transactionContext.unset()
  }

  /**
   * Gets a dry-run view of what would change if committed.
   * Returns a copy of the journal without applying mutations.
   *
   * @returns {Array} Array of journal entries
   */
  function getDryRun() {
    // Return a shallow copy to prevent external modification
    return transactionState.journal.map(entry => ({ ...entry }))
  }

  /**
   * Checks if a transaction is currently active.
   *
   * @returns {boolean} True if transaction is active
   */
  function isActive() {
    return transactionState.isActive
  }

  /**
   * Gets the complete mutation journal.
   *
   * @returns {Array} Array of all journal entries
   */
  function getJournal() {
    return transactionState.journal.map(entry => ({ ...entry }))
  }

  return {
    call,
    commit,
    rollback,
    getDryRun,
    isActive,
    getJournal,
    context: transactionContext,
    // Internal: expose state for interceptors
    _state: transactionState,
  }
}

/**
 * Creates a set interceptor that journals mutations.
 * Mutations are applied to the target but journaled with previous values for rollback.
 *
 * @param {object} transactionCtx - The transaction context created by createTransactionContext
 * @returns {Function} Interceptor function for set trap
 */
export function createTransactionSetInterceptor(transactionCtx) {
  return (target, prop, value, receiver) => {
    const txState = transactionCtx.context.tryUse()
    if (!txState || !txState.active) {
      // No active transaction - allow operation to continue
      return undefined
    }

    // Get previous value for journal BEFORE applying the mutation
    const hadProperty = Reflect.has(target, prop)
    const previousValue = hadProperty ? Reflect.get(target, prop, receiver) : undefined

    // Record in journal using internal state
    const entry = {
      operation: 'set',
      property: prop,
      value,
      previousValue,
      hadProperty,
      timestamp: Date.now(),
      index: transactionCtx._state.journalIndex++,
    }

    transactionCtx._state.journal.push(entry)

    // Allow the operation to continue (mutation will be applied)
    // This allows subsequent reads to see the new value during the transaction
    return undefined
  }
}

/**
 * Creates a deleteProperty interceptor that journals deletions.
 * Deletions are applied to the target but journaled with previous values for rollback.
 *
 * @param {object} transactionCtx - The transaction context created by createTransactionContext
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createTransactionDeletePropertyInterceptor(transactionCtx) {
  return (target, prop) => {
    const txState = transactionCtx.context.tryUse()
    if (!txState || !txState.active) {
      // No active transaction - allow operation to continue
      return undefined
    }

    // Get previous value for journal BEFORE applying the deletion
    const hadProperty = Reflect.has(target, prop)
    const previousValue = hadProperty ? Reflect.get(target, prop) : undefined

    // Record in journal using internal state
    const entry = {
      operation: 'delete',
      property: prop,
      previousValue,
      hadProperty,
      timestamp: Date.now(),
      index: transactionCtx._state.journalIndex++,
    }

    transactionCtx._state.journal.push(entry)

    // Allow the operation to continue (deletion will be applied)
    return undefined
  }
}

/**
 * Creates an apply interceptor that journals function calls.
 *
 * @param {object} transactionCtx - The transaction context created by createTransactionContext
 * @returns {Function} Interceptor function for apply trap
 */
export function createTransactionApplyInterceptor(transactionCtx) {
  return (target, thisArg, argsList) => {
    const txState = transactionCtx.context.tryUse()
    if (!txState || !txState.active) {
      // No active transaction - allow operation to continue
      return undefined
    }

    // Execute the function and capture the result
    const result = Reflect.apply(target, thisArg, argsList)

    // Record in journal using internal state
    const entry = {
      operation: 'apply',
      args: argsList,
      thisArg,
      result,
      timestamp: Date.now(),
      index: transactionCtx._state.journalIndex++,
    }

    transactionCtx._state.journal.push(entry)

    // Return the result of the function call
    return result
  }
}

/**
 * Creates a construct interceptor that journals constructor calls.
 *
 * @param {object} transactionCtx - The transaction context created by createTransactionContext
 * @returns {Function} Interceptor function for construct trap
 */
export function createTransactionConstructInterceptor(transactionCtx) {
  return (target, argsList, newTarget) => {
    const txState = transactionCtx.context.tryUse()
    if (!txState || !txState.active) {
      // No active transaction - allow operation to continue
      return undefined
    }

    // Execute the constructor and capture the result
    const result = Reflect.construct(target, argsList, newTarget)

    // Record in journal using internal state
    const entry = {
      operation: 'construct',
      args: argsList,
      result,
      timestamp: Date.now(),
      index: transactionCtx._state.journalIndex++,
    }

    transactionCtx._state.journal.push(entry)

    // Return the constructed instance
    return result
  }
}

/**
 * Helper function to register all transaction interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} transactionCtx - The transaction context
 */
export function registerTransactionInterceptors(proxyInterface, transactionCtx) {
  proxyInterface.defineSetInterceptor(createTransactionSetInterceptor(transactionCtx))
  proxyInterface.defineDeletePropertyInterceptor(createTransactionDeletePropertyInterceptor(transactionCtx))
  proxyInterface.defineApplyInterceptor(createTransactionApplyInterceptor(transactionCtx))
  proxyInterface.defineConstructInterceptor(createTransactionConstructInterceptor(transactionCtx))
}
