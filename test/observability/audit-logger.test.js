import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createAuditContext,
  createAuditGetInterceptor,
  createAuditSetInterceptor,
  createAuditDeletePropertyInterceptor,
  createAuditHasInterceptor,
  createAuditOwnKeysInterceptor,
  createAuditGetOwnPropertyDescriptorInterceptor,
  createAuditApplyInterceptor,
  createAuditConstructInterceptor,
  registerAuditInterceptors,
} from '../../src/observability/audit-logger.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../../src/security/capability-acl.js'
import {
  createInvariantContext,
  registerInvariantInterceptors,
} from '../../src/invariants/invariant-context.js'

describe('Audit Logger - Observability & Audit', () => {
  describe('createAuditContext', () => {
    it('should create an audit context with default options', () => {
      const target = { foo: 1 }
      const auditCtx = createAuditContext(target)

      expect(auditCtx).toBeDefined()
      expect(auditCtx.call).toBeDefined()
      expect(auditCtx.getAuditLog).toBeDefined()
      expect(auditCtx.clearLog).toBeDefined()
      expect(auditCtx.setLogLevel).toBeDefined()
      expect(auditCtx.exportLog).toBeDefined()
    })

    it('should accept custom options', () => {
      const target = {}
      const customOutput = vi.fn()

      const auditCtx = createAuditContext(target, {
        logLevel: 'debug',
        format: 'text',
        output: customOutput,
        includeTimestamp: false,
        includeStackTrace: true,
        filters: (op) => op.trap === 'get',
      })

      expect(auditCtx).toBeDefined()
    })

    it('should initialize with empty audit log', () => {
      const target = {}
      const auditCtx = createAuditContext(target)

      expect(auditCtx.getAuditLog()).toEqual([])
    })
  })

  describe('Get Interceptor - Read Logging', () => {
    it('should log successful read operations', () => {
      const target = { foo: 'bar', baz: 42 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        const value = proxy.foo
        expect(value).toBe('bar')
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        index: 0,
        trap: 'get',
        property: 'foo',
        intent: 'read',
        status: 'allowed',
        result: 'bar',
      })
    })

    it('should log multiple read operations with deterministic ordering', () => {
      const target = { a: 1, b: 2, c: 3 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.a
        void proxy.b
        void proxy.c
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(3)
      expect(log[0].index).toBe(0)
      expect(log[0].property).toBe('a')
      expect(log[1].index).toBe(1)
      expect(log[1].property).toBe('b')
      expect(log[2].index).toBe(2)
      expect(log[2].property).toBe('c')
    })

    it('should include timestamp when enabled', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeTimestamp: true })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should exclude timestamp when disabled', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeTimestamp: false })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log[0].timestamp).toBeUndefined()
    })
  })

  describe('Set Interceptor - Write Logging', () => {
    it('should log successful write operations', () => {
      const target = { foo: 1 }
      const { proxy, defineSetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineSetInterceptor(createAuditSetInterceptor(auditCtx))

      auditCtx.call(() => {
        proxy.foo = 42
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        index: 0,
        trap: 'set',
        property: 'foo',
        value: 42,
        intent: 'write',
        status: 'allowed',
      })
    })

    it('should log multiple write operations', () => {
      const target = {}
      const { proxy, defineSetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineSetInterceptor(createAuditSetInterceptor(auditCtx))

      auditCtx.call(() => {
        proxy.a = 1
        proxy.b = 2
        proxy.c = 3
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(3)
      expect(log.map((entry) => entry.property)).toEqual(['a', 'b', 'c'])
      expect(log.map((entry) => entry.value)).toEqual([1, 2, 3])
    })
  })

  describe('DeleteProperty Interceptor - Delete Logging', () => {
    it('should log delete operations', () => {
      const target = { foo: 1, bar: 2 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineDeletePropertyInterceptor(createAuditDeletePropertyInterceptor(auditCtx))

      auditCtx.call(() => {
        delete proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'deleteProperty',
        property: 'foo',
        intent: 'delete',
        status: 'allowed',
      })
    })
  })

  describe('Has Interceptor - Existence Check Logging', () => {
    it('should log has operations', () => {
      const target = { foo: 1 }
      const { proxy, defineHasInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineHasInterceptor(createAuditHasInterceptor(auditCtx))

      auditCtx.call(() => {
        const exists = 'foo' in proxy
        expect(exists).toBe(true)
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'has',
        property: 'foo',
        intent: 'read',
        status: 'allowed',
        result: true,
      })
    })
  })

  describe('OwnKeys Interceptor - Enumeration Logging', () => {
    it('should log ownKeys operations', () => {
      const target = { a: 1, b: 2 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineOwnKeysInterceptor(createAuditOwnKeysInterceptor(auditCtx))

      auditCtx.call(() => {
        const keys = Object.keys(proxy)
        expect(keys).toEqual(['a', 'b'])
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'ownKeys',
        intent: 'read',
        status: 'allowed',
      })
      expect(log[0].result).toEqual(['a', 'b'])
    })
  })

  describe('GetOwnPropertyDescriptor Interceptor', () => {
    it('should log getOwnPropertyDescriptor operations', () => {
      const target = { foo: 1 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetOwnPropertyDescriptorInterceptor(
        createAuditGetOwnPropertyDescriptorInterceptor(auditCtx)
      )

      auditCtx.call(() => {
        const descriptor = Object.getOwnPropertyDescriptor(proxy, 'foo')
        expect(descriptor).toBeDefined()
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'getOwnPropertyDescriptor',
        property: 'foo',
        intent: 'read',
        status: 'allowed',
      })
    })
  })

  describe('Apply Interceptor - Function Call Logging', () => {
    it('should log function call operations', () => {
      const target = function add(a, b) {
        return a + b
      }
      const { proxy, defineApplyInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineApplyInterceptor(createAuditApplyInterceptor(auditCtx))

      auditCtx.call(() => {
        const result = proxy(5, 3)
        expect(result).toBe(8)
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'apply',
        intent: 'call',
        status: 'allowed',
        args: [5, 3],
      })
      // Note: Result not captured as audit interceptor returns undefined for composition
    })

    it('should log function call operations even when they error', () => {
      const target = function throwError() {
        throw new Error('Test error')
      }
      const { proxy, defineApplyInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineApplyInterceptor(createAuditApplyInterceptor(auditCtx))

      auditCtx.call(() => {
        expect(() => proxy()).toThrow('Test error')
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'apply',
        intent: 'call',
        status: 'allowed', // Intent is logged, outcome not captured
      })
      // Note: Error not captured as audit interceptor returns undefined for composition
    })
  })

  describe('Construct Interceptor - Constructor Logging', () => {
    it('should log constructor operations', () => {
      class TestClass {
        constructor(value) {
          this.value = value
        }
      }

      const { proxy, defineConstructInterceptor } = createProxy(TestClass)
      const auditCtx = createAuditContext(TestClass)

      defineConstructInterceptor(createAuditConstructInterceptor(auditCtx))

      auditCtx.call(() => {
        const instance = new proxy(42)
        expect(instance.value).toBe(42)
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        trap: 'construct',
        intent: 'construct',
        status: 'allowed',
        args: [42],
      })
      // Note: Result not captured as audit interceptor returns undefined for composition
    })
  })

  describe('Integration with ACL - Denied Operations', () => {
    it('should work with capability-based access control', () => {
      const target = { secret: 'hidden', public: 'visible' }
      const proxyInterface = createProxy(target)
      const auditCtx = createAuditContext(target)
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['public']),
      })

      // Register audit interceptors FIRST to capture all attempts
      registerAuditInterceptors(proxyInterface, auditCtx)

      // Register capability interceptors AFTER
      registerCapabilityInterceptors(proxyInterface, capCtx)

      auditCtx.call(() => {
        capCtx.call(() => {
          // This should be logged but then denied by ACL
          expect(() => proxyInterface.proxy.secret).toThrow()
        })
      })

      // The audit log should capture the attempt
      const log = auditCtx.getAuditLog()
      expect(log.length).toBeGreaterThan(0)
    })

    it('should log denied write operations', () => {
      const target = { readonly: 1, writable: 2 }
      const proxyInterface = createProxy(target)
      const auditCtx = createAuditContext(target)
      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['writable']),
        canRead: new Set(['writable', 'readonly']), // Allow reading both
      })

      // Register interceptors
      registerAuditInterceptors(proxyInterface, auditCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)

      auditCtx.call(() => {
        capCtx.call(() => {
          // Allowed write - should be logged
          proxyInterface.proxy.writable = 99
          expect(proxyInterface.proxy.writable).toBe(99)

          // Denied write - should be logged (throws in strict mode)
          expect(() => {
            proxyInterface.proxy.readonly = 100
          }).toThrow()
          expect(target.readonly).toBe(1) // Not changed
        })
      })

      const log = auditCtx.getAuditLog()
      expect(log.length).toBeGreaterThan(0)
      const writeOps = log.filter((entry) => entry.trap === 'set')
      expect(writeOps.length).toBe(2) // Both write attempts logged
    })
  })

  describe('Integration with Invariants - Violation Logging', () => {
    it('should work with invariant enforcement', () => {
      const target = { age: 25 }
      const proxyInterface = createProxy(target)
      const auditCtx = createAuditContext(target)
      const invariantCtx = createInvariantContext(target, {
        ageRange: (_target, operation) => {
          if (operation.trap === 'set' && operation.property === 'age' && (operation.value < 0 || operation.value > 150)) {
            return 'Age must be between 0 and 150'
          }
          return true
        },
      })

      // Register interceptors
      registerAuditInterceptors(proxyInterface, auditCtx)
      registerInvariantInterceptors(proxyInterface, invariantCtx)

      auditCtx.call(() => {
        invariantCtx.call(() => {
          // Valid operation - should be logged
          proxyInterface.proxy.age = 30
          expect(target.age).toBe(30)

          // Invalid operation - should be logged and denied
          expect(() => {
            proxyInterface.proxy.age = 200
          }).toThrow('Invariant violation')
        })
      })

      const log = auditCtx.getAuditLog()
      expect(log.length).toBeGreaterThan(0)
      const setOps = log.filter((entry) => entry.trap === 'set')
      expect(setOps.length).toBeGreaterThan(0)
    })
  })

  describe('Log Filtering', () => {
    it('should filter logs based on custom filter function', () => {
      const target = { a: 1, b: 2, c: 3 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      // Only log reads of property 'a'
      const auditCtx = createAuditContext(target, {
        filters: (operation) => operation.property === 'a',
      })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.a
        void proxy.b
        void proxy.c
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0].property).toBe('a')
    })

    it('should filter by trap type', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(target)

      // Only log write operations
      const auditCtx = createAuditContext(target, {
        filters: (operation) => operation.trap === 'set',
      })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))
      defineSetInterceptor(createAuditSetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo // Read - filtered out
        proxy.foo = 2 // Write - logged
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
      expect(log[0].trap).toBe('set')
    })
  })

  describe('Log Level Management', () => {
    it('should set and respect log levels', () => {
      const target = { foo: 1 }
      const auditCtx = createAuditContext(target, { logLevel: 'error' })

      expect(() => {
        auditCtx.setLogLevel('warn')
      }).not.toThrow()

      expect(() => {
        auditCtx.setLogLevel('invalid')
      }).toThrow('Invalid log level')
    })

    it('should filter logs by log level', () => {
      const target = { foo: 1 }
      const customOutput = vi.fn()
      const auditCtx = createAuditContext(target, {
        logLevel: 'error',
        output: customOutput,
      })

      const { proxy, defineGetInterceptor } = createProxy(target)
      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo // Info level - should be filtered
      })

      // Should not output because log level is 'error' but operation is 'info'
      expect(customOutput).not.toHaveBeenCalled()
    })
  })

  describe('Export Formats', () => {
    beforeEach(() => {
      // Helper to create a populated audit context
    })

    it('should export to JSON format', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeTimestamp: false })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const exported = auditCtx.exportLog('json')
      expect(() => JSON.parse(exported)).not.toThrow()

      const parsed = JSON.parse(exported)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].trap).toBe('get')
    })

    it('should export to CSV format', () => {
      const target = { foo: 1, bar: 2 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeTimestamp: false })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
        void proxy.bar
      })

      const exported = auditCtx.exportLog('csv')
      expect(exported).toContain('index,')
      expect(exported).toContain('trap,')
      expect(exported).toContain('property,')
      expect(exported).toContain('foo')
      expect(exported).toContain('bar')

      const lines = exported.split('\n')
      expect(lines.length).toBeGreaterThan(2) // Header + 2 entries
    })

    it('should export to text format', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeTimestamp: false })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const exported = auditCtx.exportLog('text')
      expect(exported).toContain('get')
      expect(exported).toContain('foo')
      expect(exported).toContain('allowed')
    })

    it('should throw on unsupported export format', () => {
      const auditCtx = createAuditContext({})

      expect(() => {
        auditCtx.exportLog('xml')
      }).toThrow('Unsupported export format')
    })
  })

  describe('Clear Log', () => {
    it('should clear the audit log', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      expect(auditCtx.getAuditLog()).toHaveLength(1)

      auditCtx.clearLog()

      expect(auditCtx.getAuditLog()).toHaveLength(0)
    })

    it('should reset index counter when clearing log', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      expect(auditCtx.getAuditLog()[0].index).toBe(0)

      auditCtx.clearLog()

      auditCtx.call(() => {
        void proxy.foo
      })

      expect(auditCtx.getAuditLog()[0].index).toBe(0)
    })
  })

  describe('Deterministic Ordering', () => {
    it('should maintain strict ordering across different trap types', () => {
      const target = { a: 1, b: 2 }
      const proxyInterface = createProxy(target)
      const auditCtx = createAuditContext(target)

      registerAuditInterceptors(proxyInterface, auditCtx)

      auditCtx.call(() => {
        void proxyInterface.proxy.a // get
        proxyInterface.proxy.b = 3 // set
        delete proxyInterface.proxy.c // deleteProperty
        void ('a' in proxyInterface.proxy) // has
      })

      const log = auditCtx.getAuditLog()

      // Filter out internal traps like getOwnPropertyDescriptor
      // which may be called by the JavaScript engine
      const mainTraps = log.filter(entry =>
        ['get', 'set', 'deleteProperty', 'has'].includes(entry.trap)
      )

      expect(mainTraps[0].trap).toBe('get')
      expect(mainTraps[1].trap).toBe('set')
      expect(mainTraps[2].trap).toBe('deleteProperty')
      expect(mainTraps[3].trap).toBe('has')

      // Verify indices are sequential (in full log)
      log.forEach((entry, i) => {
        expect(entry.index).toBe(i)
      })
    })
  })

  describe('No Duplicate Logs', () => {
    it('should not create duplicate log entries for the same operation', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(1)
    })

    it('should log separate entries for repeated operations', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target)

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
        void proxy.foo
        void proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log).toHaveLength(3)
      expect(log[0].index).toBe(0)
      expect(log[1].index).toBe(1)
      expect(log[2].index).toBe(2)
    })
  })

  describe('Performance', () => {
    it('should have minimal overhead for logging', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, {
        output: () => {}, // No-op output for performance test
      })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      const iterations = 1000
      const start = performance.now()

      auditCtx.call(() => {
        for (let i = 0; i < iterations; i++) {
          void proxy.foo
        }
      })

      const end = performance.now()
      const duration = end - start

      // Should complete 1000 operations in reasonable time (< 100ms on most systems)
      expect(duration).toBeLessThan(100)
      expect(auditCtx.getAuditLog()).toHaveLength(iterations)
    })
  })

  describe('Custom Output', () => {
    it('should support custom output functions', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const customOutput = vi.fn()
      const auditCtx = createAuditContext(target, { output: customOutput })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      expect(customOutput).toHaveBeenCalledTimes(1)
      expect(customOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          trap: 'get',
          property: 'foo',
        })
      )
    })

    it('should support console-like output objects', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const mockConsole = { log: vi.fn() }
      const auditCtx = createAuditContext(target, { output: mockConsole })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      expect(mockConsole.log).toHaveBeenCalledTimes(1)
    })
  })

  describe('Stack Trace', () => {
    it('should include stack trace when enabled', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeStackTrace: true })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log[0].stackTrace).toBeDefined()
      expect(typeof log[0].stackTrace).toBe('string')
    })

    it('should exclude stack trace when disabled', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)
      const auditCtx = createAuditContext(target, { includeStackTrace: false })

      defineGetInterceptor(createAuditGetInterceptor(auditCtx))

      auditCtx.call(() => {
        void proxy.foo
      })

      const log = auditCtx.getAuditLog()
      expect(log[0].stackTrace).toBeUndefined()
    })
  })

  describe('Composition with Multiple Capabilities', () => {
    it('should work with ACL + Invariants + Audit', () => {
      const target = { balance: 100 }
      const proxyInterface = createProxy(target)

      // Create contexts
      const auditCtx = createAuditContext(target)
      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['balance']),
      })
      const invariantCtx = createInvariantContext(target, {
        positiveBalance: (_target, operation) => {
          if (operation.trap === 'set' && operation.property === 'balance' && operation.value < 0) {
            return 'Balance cannot be negative'
          }
          return true
        },
      })

      // Register interceptors (order matters: Audit -> ACL -> Invariants)
      registerAuditInterceptors(proxyInterface, auditCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)
      registerInvariantInterceptors(proxyInterface, invariantCtx)

      auditCtx.call(() => {
        capCtx.call(() => {
          invariantCtx.call(() => {
            // Valid operation
            proxyInterface.proxy.balance = 200
            expect(target.balance).toBe(200)

            // Invalid operation - violates invariant
            expect(() => {
              proxyInterface.proxy.balance = -50
            }).toThrow('Invariant violation')

            expect(target.balance).toBe(200) // Unchanged
          })
        })
      })

      const log = auditCtx.getAuditLog()
      expect(log.length).toBeGreaterThan(0)

      // Check that both operations were logged
      const setOps = log.filter((entry) => entry.trap === 'set')
      expect(setOps.length).toBe(2)
    })
  })
})
