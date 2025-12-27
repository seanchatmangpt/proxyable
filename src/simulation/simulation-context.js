import { createContext } from '../context/context.js'
import { randomUUID } from 'node:crypto'

/**
 * Simulation & Counterfactual Execution system for Proxyable.
 * Implements speculative execution where code paths never mutate real state.
 *
 * Design principles:
 * - Isolation: Real target is never modified during speculation
 * - Nested: Supports nested speculative contexts
 * - Deterministic: Same input = same changeset
 * - Composable: Works with ACL, Transactions, Invariants
 * - Traceable: Full execution tree tracking
 */

/**
 * Deep clone helper - creates a deep copy of an object
 * @param {*} obj - Object to clone
 * @returns {*} Deep clone of the object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags)
  }

  if (obj instanceof Map) {
    const cloned = new Map()
    for (const [key, value] of obj) {
      cloned.set(key, deepClone(value))
    }
    return cloned
  }

  if (obj instanceof Set) {
    const cloned = new Set()
    for (const value of obj) {
      cloned.add(deepClone(value))
    }
    return cloned
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item))
  }

  const cloned = Object.create(Object.getPrototypeOf(obj))
  for (const key of Object.keys(obj)) {
    cloned[key] = deepClone(obj[key])
  }

  // Copy symbols too
  for (const sym of Object.getOwnPropertySymbols(obj)) {
    cloned[sym] = deepClone(obj[sym])
  }

  return cloned
}

/**
 * Shallow clone helper - creates a shallow copy of an object
 * @param {*} obj - Object to clone
 * @returns {*} Shallow clone of the object
 */
function shallowClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return [...obj]
  }

  return { ...obj }
}

/**
 * Creates a simulation context with speculative execution support.
 *
 * @param {object} target - The target object to simulate operations on
 * @param {object} options - Configuration options
 * @param {boolean} options.shallow - Use shallow copy (default: false)
 * @param {boolean} options.nested - Allow nested simulations (default: true)
 * @param {boolean} options.checkpoint - Enable checkpoint/restore (default: true)
 * @param {string} options.isolation - 'full' or 'partial' (default: 'full')
 * @returns {object} Simulation API
 */
export function createSimulationContext(target, options = {}) {
  const {
    shallow = false,
    nested = true,
    checkpoint = true,
    isolation = 'full',
  } = options

  const simulationContext = createContext()

  // Internal state for simulation
  const simulationState = {
    // Current speculative state (copy of target)
    speculativeState: undefined,
    // Is simulation active?
    isActive: false,
    // Mutations tracked during speculation
    mutations: [],
    // Checkpoints for state restoration
    checkpoints: new Map(),
    // Execution tree
    executionTree: {
      nodes: new Map(),
      rootId: undefined,
      currentId: undefined,
    },
    // Parent simulation (for nested simulations)
    parent: undefined,
    // Depth of nesting
    depth: 0,
    // Original target reference
    target,
    // Options
    options: { shallow, nested, checkpoint, isolation },
  }

  /**
   * Initialize a new speculation session
   * @private
   */
  function initializeSpeculation(parentSim) {
    const cloneFn = shallow ? shallowClone : deepClone

    if (parentSim) {
      // Nested simulation - start from parent's speculative state
      simulationState.speculativeState = cloneFn(parentSim.speculativeState)
      simulationState.parent = parentSim
      simulationState.depth = parentSim.depth + 1
    } else {
      // Root simulation - start from real target
      simulationState.speculativeState = cloneFn(target)
      simulationState.parent = undefined
      simulationState.depth = 0
    }

    simulationState.isActive = true
    simulationState.mutations = []

    // Create execution tree node
    const nodeId = randomUUID()
    const node = {
      id: nodeId,
      parent: simulationState.parent ? simulationState.parent.currentNodeId : undefined,
      depth: simulationState.depth,
      speculations: [],
      timestamp: Date.now(),
      status: 'active',
    }

    simulationState.executionTree.nodes.set(nodeId, node)
    simulationState.executionTree.currentId = nodeId

    if (!simulationState.executionTree.rootId) {
      simulationState.executionTree.rootId = nodeId
    }

    // Store current node ID for this simulation session
    simulationState.currentNodeId = nodeId

    return nodeId
  }

  /**
   * Execute a function within a speculative context.
   * Code runs normally but mutations don't affect the real target.
   *
   * @param {Function} fn - The function to execute speculatively
   * @returns {*} The result of the function
   */
  function speculate(fn) {
    // Check if we're trying to nest
    const currentlyInSpeculation = simulationContext.tryUse()
    const isNesting = Boolean(currentlyInSpeculation && currentlyInSpeculation.active)

    if (isNesting && !nested) {
      throw new Error('Nested simulations not allowed with nested=false option')
    }

    // If starting a new top-level speculation while one is active, clean up the old one
    if (!isNesting && simulationState.isActive) {
      // Auto-abort the previous simulation
      simulationState.isActive = false
      simulationState.speculativeState = undefined
      simulationState.mutations = []
      simulationContext.unset()
    }

    const wasActive = isNesting
    const previousState = wasActive ? { ...simulationState } : undefined

    // Initialize speculation
    const nodeId = initializeSpeculation(wasActive ? simulationState : undefined)

    let result
    let error

    try {
      // Execute within simulation context
      if (wasActive) {
        // Already in a simulation context - just execute directly
        // The context is already set, no need to call() again
        result = fn()
      } else {
        // First simulation - set up the context
        result = simulationContext.call(
          {
            active: true,
            state: simulationState,
            nodeId,
          },
          fn
        )
      }

      // Record successful speculation
      const node = simulationState.executionTree.nodes.get(nodeId)
      node.speculations.push({
        mutations: [...simulationState.mutations],
        result,
        status: 'completed',
        timestamp: Date.now(),
      })
    } catch (error_) {
      error = error_

      // Record failed speculation
      const node = simulationState.executionTree.nodes.get(nodeId)
      node.speculations.push({
        mutations: [...simulationState.mutations],
        error: error_.message,
        status: 'error',
        timestamp: Date.now(),
      })

      // Update node status
      node.status = 'error'
    }

    // If this was a nested simulation, restore parent state
    if (wasActive && previousState) {
      // Keep execution tree but restore other state
      const treeBackup = simulationState.executionTree
      Object.assign(simulationState, previousState)
      simulationState.executionTree = treeBackup
    } else {
      // Top-level simulation completed - keep simulation active but allow next one to start
      // Note: simulation stays active until commit() or abort() is called
      // This allows getChangeSet() and getSpeculativeState() to work after speculate()
    }

    if (error) {
      throw error
    }

    return result
  }

  /**
   * Get the current speculative state.
   * This is what the target would look like if committed.
   *
   * @returns {object} The speculative state
   */
  function getSpeculativeState() {
    if (!simulationState.isActive) {
      throw new Error('No active simulation')
    }

    // Return a copy to prevent external modification
    const cloneFn = shallow ? shallowClone : deepClone
    return cloneFn(simulationState.speculativeState)
  }

  /**
   * Commit speculative changes to the real target.
   * Applies all mutations from the speculative state.
   *
   * @returns {boolean} True if commit succeeded
   */
  function commit() {
    if (!simulationState.isActive) {
      throw new Error('No active simulation to commit')
    }

    // Apply all changes from speculative state to real target
    const changeset = getChangeSet()

    // Apply deletions
    for (const key of Object.keys(changeset.deleted)) {
      Reflect.deleteProperty(target, key)
    }

    // Apply additions and modifications
    for (const [key, value] of Object.entries({ ...changeset.added, ...changeset.modified })) {
      const finalValue = changeset.modified[key] ? changeset.modified[key].to : value
      Reflect.set(target, key, finalValue)
    }

    // Update execution tree
    const node = simulationState.executionTree.nodes.get(simulationState.currentNodeId)
    if (node) {
      node.status = 'committed'
    }

    // Clear simulation state
    simulationState.isActive = false
    simulationState.speculativeState = undefined
    simulationState.mutations = []
    simulationContext.unset()

    return true
  }

  /**
   * Abort the current simulation.
   * Discards all speculative changes without affecting the real target.
   */
  function abort() {
    if (!simulationState.isActive) {
      throw new Error('No active simulation to abort')
    }

    // Update execution tree
    const node = simulationState.executionTree.nodes.get(simulationState.currentNodeId)
    if (node) {
      node.status = 'aborted'
    }

    // Clear simulation state without applying changes
    simulationState.isActive = false
    simulationState.speculativeState = undefined
    simulationState.mutations = []
    simulationContext.unset()
  }

  /**
   * Get a changeset showing what would change if committed.
   *
   * @returns {object} Changeset with added, modified, and deleted properties
   */
  function getChangeSet() {
    if (!simulationState.isActive) {
      return { added: {}, modified: {}, deleted: {} }
    }

    const added = {}
    const modified = {}
    const deleted = {}

    const specState = simulationState.speculativeState
    const targetKeys = new Set(Object.keys(target))
    const specKeys = new Set(Object.keys(specState))

    // Find added and modified
    for (const key of specKeys) {
      if (!targetKeys.has(key)) {
        // Property was added
        added[key] = specState[key]
      } else if (target[key] !== specState[key]) {
        // Property was modified
        modified[key] = {
          from: target[key],
          to: specState[key],
        }
      }
    }

    // Find deleted
    for (const key of targetKeys) {
      if (!specKeys.has(key)) {
        deleted[key] = target[key]
      }
    }

    return { added, modified, deleted }
  }

  /**
   * Create a checkpoint of the current speculative state.
   * Checkpoints can be restored later.
   *
   * @returns {string} Checkpoint ID
   */
  function createCheckpoint() {
    if (!checkpoint) {
      throw new Error('Checkpoints not enabled (use checkpoint: true option)')
    }

    if (!simulationState.isActive) {
      throw new Error('Cannot create checkpoint without active simulation')
    }

    const checkpointId = randomUUID()
    const cloneFn = shallow ? shallowClone : deepClone

    simulationState.checkpoints.set(checkpointId, {
      id: checkpointId,
      speculativeState: cloneFn(simulationState.speculativeState),
      mutations: [...simulationState.mutations],
      timestamp: Date.now(),
    })

    return checkpointId
  }

  /**
   * Restore to a previously created checkpoint.
   *
   * @param {string} checkpointId - The checkpoint ID to restore
   * @throws {Error} If checkpoint not found or checkpoints disabled
   */
  function restore(checkpointId) {
    if (!checkpoint) {
      throw new Error('Checkpoints not enabled (use checkpoint: true option)')
    }

    if (!simulationState.isActive) {
      throw new Error('Cannot restore checkpoint without active simulation')
    }

    const ckpt = simulationState.checkpoints.get(checkpointId)
    if (!ckpt) {
      throw new Error(`Checkpoint "${checkpointId}" not found`)
    }

    const cloneFn = shallow ? shallowClone : deepClone

    // Restore checkpoint state
    simulationState.speculativeState = cloneFn(ckpt.speculativeState)
    simulationState.mutations = [...ckpt.mutations]
  }

  /**
   * Get the execution tree showing all speculation branches.
   *
   * @returns {object} Execution tree structure
   */
  function getExecutionTree() {
    return {
      rootId: simulationState.executionTree.rootId,
      currentId: simulationState.executionTree.currentId,
      nodes: [...simulationState.executionTree.nodes.values()],
    }
  }

  /**
   * Check if simulation is currently active.
   *
   * @returns {boolean} True if simulation is active
   */
  function isActive() {
    return simulationState.isActive
  }

  /**
   * Get all mutations tracked during simulation.
   *
   * @returns {Array} Array of mutation records
   */
  function getMutations() {
    return [...simulationState.mutations]
  }

  return {
    speculate,
    getSpeculativeState,
    commit,
    abort,
    getChangeSet,
    checkpoint: createCheckpoint,
    restore,
    getExecutionTree,
    isActive,
    getMutations,
    context: simulationContext,
    // Internal: expose state for interceptors
    _state: simulationState,
  }
}

/**
 * Creates a set interceptor that routes mutations to speculative state.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for set trap
 */
export function createSimulationSetInterceptor(simCtx) {
  return (target, prop, value, _receiver) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Record mutation
    const mutation = {
      operation: 'set',
      property: prop,
      value,
      previousValue: internalState.speculativeState[prop],
      hadProperty: Reflect.has(internalState.speculativeState, prop),
      timestamp: Date.now(),
    }

    internalState.mutations.push(mutation)

    // Apply to speculative state ONLY - not to real target
    Reflect.set(internalState.speculativeState, prop, value)

    // Return true to indicate operation succeeded (but we handled it)
    return true
  }
}

/**
 * Creates a deleteProperty interceptor that routes deletions to speculative state.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createSimulationDeletePropertyInterceptor(simCtx) {
  return (target, prop) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Record mutation
    const mutation = {
      operation: 'delete',
      property: prop,
      previousValue: internalState.speculativeState[prop],
      hadProperty: Reflect.has(internalState.speculativeState, prop),
      timestamp: Date.now(),
    }

    internalState.mutations.push(mutation)

    // Delete from speculative state ONLY - not from real target
    Reflect.deleteProperty(internalState.speculativeState, prop)

    // Return true to indicate operation succeeded
    return true
  }
}

/**
 * Creates a get interceptor that reads from speculative state during simulation.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for get trap
 */
export function createSimulationGetInterceptor(simCtx) {
  return (target, prop, _receiver) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Read from speculative state instead of real target
    const value = Reflect.get(internalState.speculativeState, prop)

    // Return the value from speculative state
    return value
  }
}

/**
 * Creates a has interceptor that checks speculative state during simulation.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for has trap
 */
export function createSimulationHasInterceptor(simCtx) {
  return (target, prop) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Check in speculative state instead of real target
    return Reflect.has(internalState.speculativeState, prop)
  }
}

/**
 * Creates an ownKeys interceptor that returns keys from speculative state.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for ownKeys trap
 */
export function createSimulationOwnKeysInterceptor(simCtx) {
  return (_target) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Return keys from speculative state
    return Reflect.ownKeys(internalState.speculativeState)
  }
}

/**
 * Creates an apply interceptor that allows function calls during simulation.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for apply trap
 */
export function createSimulationApplyInterceptor(simCtx) {
  return (target, thisArg, argsList) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Execute the function (may have side effects, but that's expected)
    const result = Reflect.apply(target, thisArg, argsList)

    // Record the function call
    const mutation = {
      operation: 'apply',
      args: argsList,
      thisArg,
      result,
      timestamp: Date.now(),
    }

    internalState.mutations.push(mutation)

    // Return the result
    return result
  }
}

/**
 * Creates a construct interceptor that allows construction during simulation.
 *
 * @param {object} simCtx - The simulation context
 * @returns {Function} Interceptor function for construct trap
 */
export function createSimulationConstructInterceptor(simCtx) {
  return (target, argsList, newTarget) => {
    const simState = simCtx.context.tryUse()
    if (!simState || !simState.active) {
      // No active simulation - allow operation to continue normally
      return undefined
    }

    // Get the internal state
    const internalState = simCtx._state

    // Execute the constructor
    const result = Reflect.construct(target, argsList, newTarget)

    // Record the construction
    const mutation = {
      operation: 'construct',
      args: argsList,
      result,
      timestamp: Date.now(),
    }

    internalState.mutations.push(mutation)

    // Return the constructed instance
    return result
  }
}

/**
 * Helper function to register all simulation interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} simCtx - The simulation context
 */
export function registerSimulationInterceptors(proxyInterface, simCtx) {
  proxyInterface.defineGetInterceptor(createSimulationGetInterceptor(simCtx))
  proxyInterface.defineSetInterceptor(createSimulationSetInterceptor(simCtx))
  proxyInterface.defineDeletePropertyInterceptor(createSimulationDeletePropertyInterceptor(simCtx))
  proxyInterface.defineHasInterceptor(createSimulationHasInterceptor(simCtx))
  proxyInterface.defineOwnKeysInterceptor(createSimulationOwnKeysInterceptor(simCtx))
  proxyInterface.defineApplyInterceptor(createSimulationApplyInterceptor(simCtx))
  proxyInterface.defineConstructInterceptor(createSimulationConstructInterceptor(simCtx))
}
