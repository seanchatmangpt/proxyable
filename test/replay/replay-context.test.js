import { describe, it, expect } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createReplayContext,
  registerReplayInterceptors,
} from '../../src/replay/replay-context.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../../src/transactions/transaction-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../../src/security/capability-acl.js'

describe('Replay Context', () => {
  describe('Basic Recording', () => {
    it('should record get operations', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _a = proxyInterface.proxy.x
        const _b = proxyInterface.proxy.y
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording).toBeDefined()
      expect(recording.invocations).toHaveLength(2)
      expect(recording.invocations[0].trap).toBe('get')
      expect(recording.invocations[0].property).toBe('x')
      expect(recording.invocations[0].returnValue).toBe(10)
      expect(recording.invocations[1].trap).toBe('get')
      expect(recording.invocations[1].property).toBe('y')
      expect(recording.invocations[1].returnValue).toBe(20)
    })

    it('should record set operations', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        proxyInterface.proxy.x = 20
        proxyInterface.proxy.y = 30
      })

      const recording = replayCtx.getRecording(recordingId)
      const setInvocations = recording.invocations.filter((inv) => inv.trap === 'set')
      expect(setInvocations).toHaveLength(2)
      expect(setInvocations[0].property).toBe('x')
      expect(setInvocations[0].args[0]).toBe(20)
      expect(setInvocations[1].property).toBe('y')
      expect(setInvocations[1].args[0]).toBe(30)
    })

    it('should record has operations', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _hasX = 'x' in proxyInterface.proxy
        const _hasY = 'y' in proxyInterface.proxy
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations).toHaveLength(2)
      expect(recording.invocations[0].trap).toBe('has')
      expect(recording.invocations[0].property).toBe('x')
      expect(recording.invocations[0].returnValue).toBe(true)
      expect(recording.invocations[1].trap).toBe('has')
      expect(recording.invocations[1].property).toBe('y')
      expect(recording.invocations[1].returnValue).toBe(false)
    })

    it('should record deleteProperty operations', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        delete proxyInterface.proxy.x
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations).toHaveLength(1)
      expect(recording.invocations[0].trap).toBe('deleteProperty')
      expect(recording.invocations[0].property).toBe('x')
      expect(recording.invocations[0].returnValue).toBe(true)
    })

    it('should record ownKeys operations', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _keys = Object.keys(proxyInterface.proxy)
      })

      const recording = replayCtx.getRecording(recordingId)
      const ownKeysInvocations = recording.invocations.filter((inv) => inv.trap === 'ownKeys')
      expect(ownKeysInvocations.length).toBeGreaterThanOrEqual(1)
      expect(ownKeysInvocations[0].returnValue).toContain('x')
      expect(ownKeysInvocations[0].returnValue).toContain('y')
    })

    it('should record getOwnPropertyDescriptor operations', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _descriptor = Object.getOwnPropertyDescriptor(proxyInterface.proxy, 'x')
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations).toHaveLength(1)
      expect(recording.invocations[0].trap).toBe('getOwnPropertyDescriptor')
      expect(recording.invocations[0].property).toBe('x')
      expect(recording.invocations[0].returnValue).toBeDefined()
    })

    it('should record apply operations', () => {
      const target = function (a, b) {
        return a + b
      }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _result = proxyInterface.proxy(5, 10)
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations).toHaveLength(1)
      expect(recording.invocations[0].trap).toBe('apply')
      expect(recording.invocations[0].args).toEqual([5, 10])
      expect(recording.invocations[0].returnValue).toBe(15)
    })

    it('should record construct operations', () => {
      const target = function (x, y) {
        this.x = x
        this.y = y
      }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _instance = new proxyInterface.proxy(5, 10)
      })

      const recording = replayCtx.getRecording(recordingId)
      const constructInvocations = recording.invocations.filter((inv) => inv.trap === 'construct')
      expect(constructInvocations).toHaveLength(1)
      expect(constructInvocations[0].args).toEqual([5, 10])
      expect(constructInvocations[0].returnValue).toBeDefined()
    })
  })

  describe('Recording Structure', () => {
    it('should include timestamp and index in each invocation', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
        proxyInterface.proxy.x = 20
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations[0].timestamp).toBeDefined()
      expect(recording.invocations[0].index).toBe(0)
      expect(recording.invocations[1].timestamp).toBeDefined()
      expect(recording.invocations[1].index).toBe(1)
      expect(recording.invocations[1].timestamp).toBeGreaterThanOrEqual(
        recording.invocations[0].timestamp
      )
    })

    it('should include recordingId and startTime in recording', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.recordingId).toBe(recordingId)
      expect(recording.startTime).toBeDefined()
      expect(typeof recording.startTime).toBe('number')
    })
  })

  describe('Recording State Management', () => {
    it('should track recording state', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      expect(replayCtx.isRecording()).toBe(false)

      let isRecordingDuringExecution = false
      replayCtx.record(() => {
        isRecordingDuringExecution = replayCtx.isRecording()
        const _x = proxyInterface.proxy.x
      })

      expect(isRecordingDuringExecution).toBe(true)
      expect(replayCtx.isRecording()).toBe(false)
    })

    it('should throw error on nested recordings', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      expect(() => {
        replayCtx.record(() => {
          replayCtx.record(() => {
            const _x = proxyInterface.proxy.x
          })
        })
      }).toThrow('Already recording')
    })

    it('should support multiple sequential recordings', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId1 = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
      })

      const recordingId2 = replayCtx.record(() => {
        proxyInterface.proxy.x = 20
      })

      expect(recordingId1).not.toBe(recordingId2)
      const rec1Gets = replayCtx
        .getRecording(recordingId1)
        .invocations.filter((inv) => inv.trap === 'get')
      const rec2Sets = replayCtx
        .getRecording(recordingId2)
        .invocations.filter((inv) => inv.trap === 'set')
      expect(rec1Gets).toHaveLength(1)
      expect(rec2Sets).toHaveLength(1)
    })

    it('should list all recording IDs', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId1 = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
      })
      const recordingId2 = replayCtx.record(() => {
        proxyInterface.proxy.x = 20
      })

      const ids = replayCtx.getRecordingIds()
      expect(ids).toContain(recordingId1)
      expect(ids).toContain(recordingId2)
      expect(ids).toHaveLength(2)
    })

    it('should clear specific recording', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId1 = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
      })
      const recordingId2 = replayCtx.record(() => {
        proxyInterface.proxy.x = 20
      })

      replayCtx.clearRecording(recordingId1)

      expect(replayCtx.getRecording(recordingId1)).toBeUndefined()
      expect(replayCtx.getRecording(recordingId2)).toBeDefined()
    })

    it('should clear all recordings', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId1 = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
      })
      const recordingId2 = replayCtx.record(() => {
        proxyInterface.proxy.x = 20
      })

      replayCtx.clearRecording()

      expect(replayCtx.getRecording(recordingId1)).toBeUndefined()
      expect(replayCtx.getRecording(recordingId2)).toBeUndefined()
      expect(replayCtx.getRecordingIds()).toHaveLength(0)
    })
  })

  describe('Deterministic Replay', () => {
    it('should replay operations deterministically', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x1 = proxyInterface.proxy.x
        proxyInterface.proxy.x = 30
        const _y = proxyInterface.proxy.y
      })

      const replayResults = replayCtx.replay(recordingId)

      expect(replayResults.recordingId).toBe(recordingId)
      const replayedGets = replayResults.replayedInvocations.filter((inv) => inv.trap === 'get')
      const replayedSets = replayResults.replayedInvocations.filter((inv) => inv.trap === 'set')
      expect(replayedGets).toHaveLength(2)
      expect(replayedSets).toHaveLength(1)
    })

    it('should replay in same order as recording', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x1 = proxyInterface.proxy.x
        proxyInterface.proxy.x = 20
        const _x2 = proxyInterface.proxy.x
        proxyInterface.proxy.x = 30
      })

      const replayResults = replayCtx.replay(recordingId)

      expect(replayResults.replayedInvocations[0].index).toBe(0)
      expect(replayResults.replayedInvocations[1].index).toBe(1)
      expect(replayResults.replayedInvocations[2].index).toBe(2)
      expect(replayResults.replayedInvocations[3].index).toBe(3)
    })

    it('should replay multiple times with same result', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
        proxyInterface.proxy.x = 20
      })

      const replay1 = replayCtx.replay(recordingId)
      const replay2 = replayCtx.replay(recordingId)

      expect(replay1.replayedInvocations.length).toBe(replay2.replayedInvocations.length)
      expect(replay1.replayedInvocations[0].trap).toBe(replay2.replayedInvocations[0].trap)
      expect(replay1.replayedInvocations[1].trap).toBe(replay2.replayedInvocations[1].trap)
    })

    it('should throw error when replaying non-existent recording', () => {
      const target = { x: 10 }
      const replayCtx = createReplayContext(target)

      expect(() => {
        replayCtx.replay('non-existent-id')
      }).toThrow('Recording "non-existent-id" not found')
    })
  })

  describe('Isolated Replay Context', () => {
    it('should not observe external state changes during replay', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x
        proxyInterface.proxy.x = 20
      })

      // Modify external state after recording
      target.x = 999

      const replayResults = replayCtx.replay(recordingId)

      // Replay should use original state, not external change
      const firstGetReplay = replayResults.replayedInvocations.find((inv) => inv.trap === 'get')
      expect(firstGetReplay.replayResult).toBe(10)
      expect(target.x).toBe(999) // External state unchanged
    })

    it('should create isolated replay target', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        proxyInterface.proxy.x = 30
      })

      // Reset target
      target.x = 10

      const replayResults = replayCtx.replay(recordingId)

      // Original target should not be affected by replay
      expect(target.x).toBe(10)
      const replayedSets = replayResults.replayedInvocations.filter((inv) => inv.trap === 'set')
      expect(replayedSets).toHaveLength(1)
    })
  })

  describe('Composition with Transactions', () => {
    it('should compose with transaction interceptors', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)
      const transactionCtx = createTransactionContext(target)

      // Register both replay and transaction interceptors
      registerReplayInterceptors(proxyInterface, replayCtx)
      registerTransactionInterceptors(proxyInterface, transactionCtx)

      const recordingId = replayCtx.record(() => {
        transactionCtx.call(() => {
          proxyInterface.proxy.x = 30
          proxyInterface.proxy.y = 40
        })
        transactionCtx.commit()
      })

      const recording = replayCtx.getRecording(recordingId)
      const setInvocations = recording.invocations.filter((inv) => inv.trap === 'set')
      expect(setInvocations).toHaveLength(2)
      expect(setInvocations[0].property).toBe('x')
      expect(setInvocations[1].property).toBe('y')

      // Check that both systems captured the operations
      const journal = transactionCtx.getJournal()
      expect(journal).toHaveLength(0) // Journal cleared after commit
    })

    it('should record rollback scenarios', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)
      const transactionCtx = createTransactionContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)
      registerTransactionInterceptors(proxyInterface, transactionCtx)

      const recordingId = replayCtx.record(() => {
        transactionCtx.call(() => {
          proxyInterface.proxy.x = 30
        })
      })

      transactionCtx.rollback()

      const recording = replayCtx.getRecording(recordingId)
      const setInvocations = recording.invocations.filter((inv) => inv.trap === 'set')
      expect(setInvocations).toHaveLength(1)
      expect(target.x).toBe(10) // Rollback restored value
    })
  })

  describe('Composition with ACL', () => {
    it('should compose with capability interceptors', () => {
      const target = { x: 10, y: 20, z: 30 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)
      const capabilityCtx = createCapabilityContext(target, {
        canRead: new Set(['x', 'y']),
        canWrite: new Set(['x']),
      })

      // Register both replay and capability interceptors
      registerReplayInterceptors(proxyInterface, replayCtx)
      registerCapabilityInterceptors(proxyInterface, capabilityCtx)

      const recordingId = replayCtx.record(() => {
        capabilityCtx.call(() => {
          const _x = proxyInterface.proxy.x
          proxyInterface.proxy.x = 50
        })
      })

      const recording = replayCtx.getRecording(recordingId)
      const getInvocations = recording.invocations.filter((inv) => inv.trap === 'get')
      const setInvocations = recording.invocations.filter((inv) => inv.trap === 'set')
      expect(getInvocations).toHaveLength(1)
      expect(setInvocations).toHaveLength(1)
    })

    it('should record denied operations in ACL context', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)
      const capabilityCtx = createCapabilityContext(target, {
        canRead: new Set(['x']),
        canWrite: new Set([]),
      })

      registerReplayInterceptors(proxyInterface, replayCtx)
      registerCapabilityInterceptors(proxyInterface, capabilityCtx)

      const recordingId = replayCtx.record(() => {
        capabilityCtx.call(() => {
          try {
            const _x = proxyInterface.proxy.x
          } catch {
            // Expected
          }

          try {
            const _y = proxyInterface.proxy.y // Should throw
          } catch {
            // Expected - access denied
          }
        })
      })

      const recording = replayCtx.getRecording(recordingId)
      // Both read attempts are recorded, but one throws an error
      const getInvocations = recording.invocations.filter((inv) => inv.trap === 'get')
      expect(getInvocations.length).toBeGreaterThanOrEqual(1)
      expect(getInvocations[0].property).toBe('x')
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle mixed trap types in order', () => {
      const target = { x: 10, y: 20 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x = proxyInterface.proxy.x // get
        proxyInterface.proxy.x = 30 // set
        const _hasY = 'y' in proxyInterface.proxy // has
        const _deleted = delete proxyInterface.proxy.y // delete
        const _keys = Object.keys(proxyInterface.proxy) // ownKeys
      })

      const recording = replayCtx.getRecording(recordingId)
      const getInvocations = recording.invocations.filter((inv) => inv.trap === 'get')
      const setInvocations = recording.invocations.filter((inv) => inv.trap === 'set')
      const hasInvocations = recording.invocations.filter((inv) => inv.trap === 'has')
      const deleteInvocations = recording.invocations.filter((inv) => inv.trap === 'deleteProperty')
      const ownKeysInvocations = recording.invocations.filter((inv) => inv.trap === 'ownKeys')

      expect(getInvocations.length).toBeGreaterThanOrEqual(1)
      expect(setInvocations.length).toBeGreaterThanOrEqual(1)
      expect(hasInvocations.length).toBeGreaterThanOrEqual(1)
      expect(deleteInvocations.length).toBeGreaterThanOrEqual(1)
      expect(ownKeysInvocations.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle array operations', () => {
      const target = [1, 2, 3]
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _firstElement = proxyInterface.proxy[0]
        proxyInterface.proxy.push(4)
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations.length).toBeGreaterThan(0)
      expect(recording.invocations[0].trap).toBe('get')
    })
  })

  describe('Timestamp Ordering', () => {
    it('should maintain chronological order of invocations', () => {
      const target = { x: 10 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        const _x1 = proxyInterface.proxy.x
        proxyInterface.proxy.x = 20
        const _x2 = proxyInterface.proxy.x
      })

      const recording = replayCtx.getRecording(recordingId)

      for (let i = 1; i < recording.invocations.length; i++) {
        expect(recording.invocations[i].timestamp).toBeGreaterThanOrEqual(
          recording.invocations[i - 1].timestamp
        )
      }
    })
  })
})
