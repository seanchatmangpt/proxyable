import { createContext } from '../context/context.js'
import { createProxy } from '../proxy/create-proxy.js'

/**
 * Deterministic replay system for Proxyable.
 * Records ordered trap invocations and replays them deterministically in isolated contexts.
 *
 * Features:
 * - Records all trap invocations with parameters and results
 * - Deterministic replay in isolated contexts
 * - No external state observation during replay
 * - Composes transparently with ACL and Transactions
 * - Supports multiple recordings via unique IDs
 */

/**
 * Generates a simple unique ID for recordings.
 * @private
 */
function generateId() {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Creates a replay context for a target object.
 *
 * @param {object} target - The target object to record/replay operations on
 * @returns {object} Replay API with record, replay, getRecording, clearRecording, isRecording methods
 */
export function createReplayContext(target) {
  const replayContext = createContext()

  // Internal replay state
  const replayState = {
    recordings: new Map(), // Map of recordingId -> recording
    currentRecording: undefined,
    isRecording: false,
    invocationIndex: 0,
  }

  /**
   * Records proxy trap invocations during function execution.
   *
   * @param {Function} fn - Function to execute while recording
   * @returns {string} Recording ID for the captured invocations
   */
  function record(fn) {
    if (replayState.isRecording) {
      throw new Error('Already recording. Nested recordings are not supported.')
    }

    const recordingId = generateId()
    // Snapshot the target at recording time for accurate replay
    const targetSnapshot = Array.isArray(target) ? [...target] : { ...target }

    const recording = {
      recordingId,
      startTime: Date.now(),
      invocations: [],
      target: targetSnapshot,
    }

    replayState.currentRecording = recording
    replayState.isRecording = true
    replayState.invocationIndex = 0

    try {
      replayContext.call({ active: true, recording }, fn)
    } finally {
      replayState.isRecording = false
      replayState.recordings.set(recordingId, recording)
      replayState.currentRecording = undefined
    }

    return recordingId
  }

  /**
   * Replays a recording deterministically in an isolated context.
   *
   * @param {string} recordingId - The ID of the recording to replay
   * @returns {object} Replay results with invocations and final state
   */
  function replay(recordingId) {
    const recording = replayState.recordings.get(recordingId)
    if (!recording) {
      throw new Error(`Recording "${recordingId}" not found`)
    }

    // Create isolated replay target (clone of original)
    const replayTarget = Array.isArray(recording.target)
      ? [...recording.target]
      : { ...recording.target }

    // Create isolated proxy for replay
    const { proxy: replayProxy } = createProxy(replayTarget)

    const replayResults = {
      recordingId,
      originalInvocations: recording.invocations,
      replayedInvocations: [],
      startTime: Date.now(),
      endTime: undefined,
    }

    // Replay each invocation in order
    for (const invocation of recording.invocations) {
      const replayStart = Date.now()
      let replayResult

      try {
        switch (invocation.trap) {
          case 'get': {
            replayResult = replayProxy[invocation.property]
            break
          }

          case 'set': {
            replayProxy[invocation.property] = invocation.args[0]
            replayResult = true
            break
          }

          case 'has': {
            replayResult = invocation.property in replayProxy
            break
          }

          case 'deleteProperty': {
            replayResult = delete replayProxy[invocation.property]
            break
          }

          case 'ownKeys': {
            replayResult = Object.keys(replayProxy)
            break
          }

          case 'getOwnPropertyDescriptor': {
            replayResult = Object.getOwnPropertyDescriptor(replayProxy, invocation.property)
            break
          }

          case 'apply': {
            if (typeof replayTarget === 'function') {
              replayResult = replayTarget.apply(invocation.thisArg, invocation.args)
            }
            break
          }

          case 'construct': {
            if (typeof replayTarget === 'function') {
              replayResult = new replayTarget(...invocation.args)
            }
            break
          }

          default: {
            break
          }
        }

        replayResults.replayedInvocations.push({
          ...invocation,
          replayTimestamp: Date.now(),
          replayDuration: Date.now() - replayStart,
          replayResult,
        })
      } catch (error) {
        replayResults.replayedInvocations.push({
          ...invocation,
          replayTimestamp: Date.now(),
          replayDuration: Date.now() - replayStart,
          replayError: error.message,
        })
      }
    }

    replayResults.endTime = Date.now()
    replayResults.duration = replayResults.endTime - replayResults.startTime

    return replayResults
  }

  /**
   * Gets the current or specified recording.
   *
   * @param {string} [recordingId] - Optional recording ID. If not provided, returns the current recording.
   * @returns {object|undefined} The recording object or undefined if not found
   */
  function getRecording(recordingId) {
    if (recordingId) {
      return replayState.recordings.get(recordingId)
    }
    return replayState.currentRecording
  }

  /**
   * Clears a specific recording or all recordings.
   *
   * @param {string} [recordingId] - Optional recording ID. If not provided, clears all recordings.
   */
  function clearRecording(recordingId) {
    if (recordingId) {
      replayState.recordings.delete(recordingId)
    } else {
      replayState.recordings.clear()
      replayState.currentRecording = undefined
    }
  }

  /**
   * Checks if currently recording.
   *
   * @returns {boolean} True if recording is active
   */
  function isRecording() {
    return replayState.isRecording
  }

  /**
   * Gets all recording IDs.
   *
   * @returns {string[]} Array of recording IDs
   */
  function getRecordingIds() {
    return [...replayState.recordings.keys()]
  }

  return {
    record,
    replay,
    getRecording,
    clearRecording,
    isRecording,
    getRecordingIds,
    context: replayContext,
    // Internal: expose state for interceptors
    _state: replayState,
  }
}

/**
 * Creates a get interceptor that records get operations.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for get trap
 */
export function createReplayGetInterceptor(replayCtx) {
  return (target, property, receiver) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Get the return value by executing the operation
    const returnValue = Reflect.get(target, property, receiver)

    // Record the invocation
    const invocation = {
      trap: 'get',
      property,
      returnValue,
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue (return undefined for composition)
    return undefined
  }
}

/**
 * Creates a set interceptor that records set operations.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for set trap
 */
export function createReplaySetInterceptor(replayCtx) {
  return (target, property, value, _receiver) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Record the invocation (don't execute - let other interceptors and fallback handle it)
    const invocation = {
      trap: 'set',
      property,
      args: [value],
      returnValue: true, // Assume success - actual result determined by fallback
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue (return undefined for composition)
    return undefined
  }
}

/**
 * Creates a has interceptor that records has operations.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for has trap
 */
export function createReplayHasInterceptor(replayCtx) {
  return (target, property) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Execute the operation
    const returnValue = Reflect.has(target, property)

    // Record the invocation
    const invocation = {
      trap: 'has',
      property,
      returnValue,
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue
    return undefined
  }
}

/**
 * Creates a deleteProperty interceptor that records delete operations.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for deleteProperty trap
 */
export function createReplayDeletePropertyInterceptor(replayCtx) {
  return (target, property) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Record the invocation (don't execute - let other interceptors and fallback handle it)
    const invocation = {
      trap: 'deleteProperty',
      property,
      returnValue: true, // Assume success - actual result determined by fallback
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue
    return undefined
  }
}

/**
 * Creates an ownKeys interceptor that records ownKeys operations.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for ownKeys trap
 */
export function createReplayOwnKeysInterceptor(replayCtx) {
  return (target) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Execute the operation
    const returnValue = Reflect.ownKeys(target)

    // Record the invocation
    const invocation = {
      trap: 'ownKeys',
      returnValue,
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue
    return undefined
  }
}

/**
 * Creates a getOwnPropertyDescriptor interceptor that records descriptor operations.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for getOwnPropertyDescriptor trap
 */
export function createReplayGetOwnPropertyDescriptorInterceptor(replayCtx) {
  return (target, property) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Execute the operation
    const returnValue = Reflect.getOwnPropertyDescriptor(target, property)

    // Record the invocation
    const invocation = {
      trap: 'getOwnPropertyDescriptor',
      property,
      returnValue,
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue
    return undefined
  }
}

/**
 * Creates an apply interceptor that records function applications.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for apply trap
 */
export function createReplayApplyInterceptor(replayCtx) {
  return (target, thisArg, argsList) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Execute the operation
    const returnValue = Reflect.apply(target, thisArg, argsList)

    // Record the invocation
    const invocation = {
      trap: 'apply',
      thisArg,
      args: argsList,
      returnValue,
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue (return undefined for composition)
    return undefined
  }
}

/**
 * Creates a construct interceptor that records constructor calls.
 *
 * @param {object} replayCtx - The replay context created by createReplayContext
 * @returns {Function} Interceptor function for construct trap
 */
export function createReplayConstructInterceptor(replayCtx) {
  return (target, argsList, newTarget) => {
    const state = replayCtx.context.tryUse()
    if (!state || !state.active) {
      // No active recording - allow operation to continue
      return undefined
    }

    // Execute the operation
    const returnValue = Reflect.construct(target, argsList, newTarget)

    // Record the invocation
    const invocation = {
      trap: 'construct',
      args: argsList,
      returnValue,
      timestamp: Date.now(),
      index: replayCtx._state.invocationIndex++,
    }

    state.recording.invocations.push(invocation)

    // Allow operation to continue (return undefined for composition)
    return undefined
  }
}

/**
 * Helper function to register all replay interceptors with a proxy.
 *
 * @param {object} proxyInterface - The proxy interface returned by createProxy
 * @param {object} replayCtx - The replay context
 */
export function registerReplayInterceptors(proxyInterface, replayCtx) {
  proxyInterface.defineGetInterceptor(createReplayGetInterceptor(replayCtx))
  proxyInterface.defineSetInterceptor(createReplaySetInterceptor(replayCtx))
  proxyInterface.defineHasInterceptor(createReplayHasInterceptor(replayCtx))
  proxyInterface.defineDeletePropertyInterceptor(createReplayDeletePropertyInterceptor(replayCtx))
  proxyInterface.defineOwnKeysInterceptor(createReplayOwnKeysInterceptor(replayCtx))
  proxyInterface.defineGetOwnPropertyDescriptorInterceptor(
    createReplayGetOwnPropertyDescriptorInterceptor(replayCtx)
  )
  proxyInterface.defineApplyInterceptor(createReplayApplyInterceptor(replayCtx))
  proxyInterface.defineConstructInterceptor(createReplayConstructInterceptor(replayCtx))
}
