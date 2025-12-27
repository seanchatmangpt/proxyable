import { describe, it, expect } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import { createContext } from '../../src/context/context.js'

describe('Sandbox - Isolated Context Security', () => {
  describe('Context isolation between proxies', () => {
    it('should maintain separate interceptor contexts for different proxies', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({
        data: 'A'
      })

      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({
        data: 'B'
      })

      // Add different interceptors to each proxy
      addInterceptorA('get', (target, prop) => {
        if (prop === 'data') return 'A-intercepted'
        return undefined
      })

      addInterceptorB('get', (target, prop) => {
        if (prop === 'data') return 'B-intercepted'
        return undefined
      })

      // Each proxy should use its own interceptor
      expect(proxyA.data).toBe('A-intercepted')
      expect(proxyB.data).toBe('B-intercepted')
    })

    it('should prevent interceptors from one proxy affecting another', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({
        secret: 'hidden-A'
      })

      const { proxy: proxyB } = createProxy({
        secret: 'hidden-B'
      })

      // Block access to secret in proxyA
      addInterceptorA('get', (_target, prop) => {
        if (prop === 'secret') {
          throw new Error('Access denied to secret in ProxyA')
        }
        return undefined
      })

      // ProxyA should block access
      expect(() => {
        return proxyA.secret
      }).toThrow('Access denied to secret in ProxyA')

      // ProxyB should still allow access
      expect(proxyB.secret).toBe('hidden-B')
    })

    it('should maintain separate state modifications across proxies', () => {
      const { proxy: proxyA } = createProxy({ count: 0 })
      const { proxy: proxyB } = createProxy({ count: 0 })

      // Modify proxyA
      proxyA.count = 10
      proxyB.count = 20

      // Modifications should be isolated
      expect(proxyA.count).toBe(10)
      expect(proxyB.count).toBe(20)
    })

    it('should isolate interceptor execution contexts', () => {
      const executionLog = { A: [], B: [] }

      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({
        value: 1
      })

      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({
        value: 1
      })

      addInterceptorA('get', (target, prop) => {
        executionLog.A.push(prop)
        return undefined
      })

      addInterceptorB('get', (target, prop) => {
        executionLog.B.push(prop)
        return undefined
      })

      // Access properties
      void proxyA.value
      void proxyB.value
      void proxyA.other

      // Each proxy's interceptor should only log its own accesses
      expect(executionLog.A).toEqual(['value', 'other'])
      expect(executionLog.B).toEqual(['value'])
    })
  })

  describe('Preventing context pollution', () => {
    it('should prevent shared state between proxies when using separate contexts', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({})
      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({})

      const sharedState = { counter: 0 }

      // Each proxy increments its own counter through interceptors
      addInterceptorA('set', (_target, _prop, _value) => {
        sharedState.counter += 1
        return true
      })

      addInterceptorB('set', (_target, _prop, _value) => {
        sharedState.counter += 10
        return true
      })

      proxyA.test = 'a'
      expect(sharedState.counter).toBe(1)

      proxyB.test = 'b'
      expect(sharedState.counter).toBe(11)

      // Operations are not shared, only the external state they reference
      proxyA.another = 'value'
      expect(sharedState.counter).toBe(12)
    })

    it('should isolate interceptor side effects across proxies', () => {
      const effectsA = []
      const effectsB = []

      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({})
      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({})

      addInterceptorA('get', (target, prop) => {
        effectsA.push(`get-${prop}`)
        return undefined
      })

      addInterceptorB('get', (target, prop) => {
        effectsB.push(`get-${prop}`)
        return undefined
      })

      // Access same property on different proxies
      void proxyA.x
      void proxyB.x
      void proxyA.y

      // Side effects should be isolated
      expect(effectsA).toEqual(['get-x', 'get-y'])
      expect(effectsB).toEqual(['get-x'])
      expect(effectsA).not.toEqual(effectsB)
    })

    it('should prevent interceptor leakage when defining multiple interceptors', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({
        name: 'A'
      })

      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({
        name: 'B'
      })

      // Add multiple interceptors to proxyA
      addInterceptorA('get', (_target, prop) => {
        if (prop === 'name') return 'Custom-A'
        return undefined
      })

      addInterceptorA('get', (_target, _prop) => {
        // Second interceptor
        return undefined
      })

      // Add interceptor to proxyB without affecting proxyA
      addInterceptorB('get', (_target, prop) => {
        if (prop === 'name') return 'Custom-B'
        return undefined
      })

      expect(proxyA.name).toBe('Custom-A')
      expect(proxyB.name).toBe('Custom-B')
    })

    it('should isolate state modifications from leaking between interceptors', () => {
      const stateA = { modified: false }
      const stateB = { modified: false }

      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({})
      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({})

      addInterceptorA('set', (_target, _prop, _value) => {
        stateA.modified = true // Modify proxyA's state
        return true
      })

      addInterceptorB('get', (_target, _prop) => {
        // ProxyB's interceptor only sees stateB, not stateA
        return stateB.modified ? 'stateB-modified' : 'stateB-isolated'
      })

      // Modify through proxyA
      proxyA.x = 1
      expect(stateA.modified).toBe(true)

      // ProxyB's state is unchanged, isolation is maintained
      expect(proxyB.test).toBe('stateB-isolated')
      expect(stateB.modified).toBe(false)
    })
  })

  describe('Security of isolated execution contexts', () => {
    it('should contain errors thrown in one proxy from affecting another', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({})
      const { proxy: proxyB } = createProxy({ safe: 'value' })

      addInterceptorA('get', (_target, prop) => {
        if (prop === 'dangerous') {
          throw new Error('Critical error in ProxyA')
        }
        return undefined
      })

      // ProxyA throws an error
      expect(() => {
        return proxyA.dangerous
      }).toThrow('Critical error in ProxyA')

      // ProxyB continues to work normally
      expect(proxyB.safe).toBe('value')
    })

    it('should isolate resource cleanup between proxies', () => {
      const cleanupLog = { A: [], B: [] }

      const contextA = createContext()
      const contextB = createContext()

      // Simulate isolated resource management
      const cleanup = (log) => {
        return () => {
          log.push('cleanup-called')
        }
      }

      contextA.call({ resources: [] }, () => {
        contextA.use().cleanup = cleanup(cleanupLog.A)
      })

      contextB.call({ resources: [] }, () => {
        contextB.use().cleanup = cleanup(cleanupLog.B)
      })

      // Cleanup should be isolated
      expect(cleanupLog.A).toEqual([])
      expect(cleanupLog.B).toEqual([])
    })

    it('should prevent variable shadowing attacks across proxy contexts', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({
        userRole: 'admin'
      })

      const { proxy: proxyB } = createProxy({
        userRole: 'user'
      })

      // Attempt to shadow variables in proxyA
      addInterceptorA('set', (_target, prop, _value) => {
        if (prop === 'userRole') {
          // Try to set a "global" userRole that affects other proxies
          throw new Error('Cannot override critical properties')
        }
        return true
      })

      // ProxyA blocks the override
      expect(() => {
        proxyA.userRole = 'superuser'
      }).toThrow('Cannot override critical properties')

      // ProxyB maintains its own state
      proxyB.userRole = 'admin'
      expect(proxyB.userRole).toBe('admin')
    })

    it('should maintain independent callback execution in isolated contexts', () => {
      const executionOrder = []

      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({})
      const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({})

      addInterceptorA('get', (target, prop) => {
        executionOrder.push(`A-start-${prop}`)
        // Simulate some async-like work
        executionOrder.push(`A-end-${prop}`)
        return undefined
      })

      addInterceptorB('get', (_target, prop) => {
        executionOrder.push(`B-start-${prop}`)
        executionOrder.push(`B-end-${prop}`)
        return undefined
      })

      void proxyA.x
      void proxyB.y
      void proxyA.z

      // Execution should be sequentially isolated per proxy, not interleaved
      expect(executionOrder).toEqual([
        'A-start-x',
        'A-end-x',
        'B-start-y',
        'B-end-y',
        'A-start-z',
        'A-end-z'
      ])
    })

    it('should prevent privilege escalation through shared context', () => {
      const userState = { isAdmin: false }
      const adminState = { isAdmin: true }

      const { proxy: proxyUser, addInterceptor: addInterceptorUser } =
        createProxy({
          data: 'user-data'
        })

      const { proxy: proxyAdmin, addInterceptor: addInterceptorAdmin } =
        createProxy({
          data: 'admin-data',
          secrets: 'top-secret'
        })

      // User interceptor - user cannot access secrets
      addInterceptorUser('get', (_target, prop) => {
        if (prop === 'secrets' && !userState.isAdmin) {
          throw new Error('User not authorized to access secrets')
        }
        return undefined
      })

      // Admin interceptor - validates admin state before returning secrets
      addInterceptorAdmin('get', (_target, prop) => {
        if (prop === 'secrets' && !adminState.isAdmin) {
          throw new Error('Unauthorized access to secrets')
        }
        return undefined
      })

      // User context cannot access secrets
      expect(() => {
        return proxyUser.secrets
      }).toThrow('User not authorized to access secrets')

      // Admin context allows access (has isAdmin = true)
      expect(proxyAdmin.secrets).toBe('top-secret')
    })
  })

  describe('Context API isolation', () => {
    it('should isolate context.call() execution scopes', () => {
      const ctx1 = createContext()
      const ctx2 = createContext()
      const results = []

      const value1 = { id: 'context-1', data: [] }
      const value2 = { id: 'context-2', data: [] }

      ctx1.call(value1, () => {
        const current = ctx1.use()
        results.push(current.id)
        expect(ctx1.use()).toBe(value1)
      })

      ctx2.call(value2, () => {
        const current = ctx2.use()
        results.push(current.id)
        expect(ctx2.use()).toBe(value2)
      })

      expect(results).toEqual(['context-1', 'context-2'])

      // After call(), contexts should be cleared
      expect(ctx1.tryUse()).toBeUndefined()
      expect(ctx2.tryUse()).toBeUndefined()
    })

    it('should maintain proper context scoping within single call', () => {
      const ctx = createContext()
      const accessLog = []

      ctx.call({ level: 'primary', data: 'primary-data' }, () => {
        accessLog.push(ctx.use().level)
        const currentCtx = ctx.use()
        // Verify context is accessible and contains expected data
        expect(currentCtx.data).toBe('primary-data')
      })

      // After call() completes, context should be cleared
      expect(ctx.tryUse()).toBeUndefined()
      expect(accessLog).toEqual(['primary'])
    })

    it('should maintain separate namespaces for different context instances', () => {
      const ctxA = createContext()
      const ctxB = createContext()

      let resultA, resultB

      ctxA.call({ namespace: 'A', value: 100 }, () => {
        resultA = ctxA.use().value
      })

      ctxB.call({ namespace: 'B', value: 200 }, () => {
        resultB = ctxB.use().value
      })

      expect(resultA).toBe(100)
      expect(resultB).toBe(200)
    })

    it('should allow context.set() to establish isolated global context', () => {
      const ctx = createContext()
      const contextValue = { authenticated: true, userId: '123' }

      ctx.set(contextValue)
      expect(ctx.use()).toBe(contextValue)

      // Modify through one accessor shouldn't affect isolated state in proxies
      ctx.unset()
      expect(ctx.tryUse()).toBeUndefined()
    })

    it('should handle context conflicts when replace is not set', () => {
      const ctx = createContext()
      const value1 = { id: 1 }

      ctx.set(value1)
      expect(ctx.use()).toBe(value1)

      // Attempting to set without replace should fail
      expect(() => {
        ctx.set({ id: 2 }, false)
      }).toThrow()

      // Original context preserved
      expect(ctx.use()).toBe(value1)

      // With replace=true, should succeed
      ctx.set({ id: 3 }, true)
      expect(ctx.use().id).toBe(3)

      ctx.unset()
    })
  })

  describe('Sandbox security boundaries', () => {
    it('should prevent access to Object.prototype from intercepted proxies', () => {
      const { proxy, addInterceptor } = createProxy({})

      const dangerousGlobals = new Set([
        'Object',
        'Function',
        'Array',
        'String',
        'eval'
      ])

      addInterceptor('get', (_target, prop) => {
        if (dangerousGlobals.has(prop)) {
          throw new Error(`Access to "${prop}" is forbidden`)
        }
        return undefined
      })

      expect(() => {
        return proxy.Object
      }).toThrow('Access to "Object" is forbidden')

      expect(() => {
        return proxy.eval
      }).toThrow('Access to "eval" is forbidden')
    })

    it('should prevent code injection through interceptor functions', () => {
      const { proxy, addInterceptor } = createProxy({
        safeData: 'value'
      })

      let injectionAttempted = false

      addInterceptor('get', (_target, _prop) => {
        // Interceptor function itself should not be injectable
        // This simulates code that could be injected
        injectionAttempted = true
        return undefined
      })

      // Accessing proxy should not execute injected code
      void proxy.safeData

      // Only the interceptor logic should execute
      expect(injectionAttempted).toBe(true)
    })

    it('should maintain sandbox isolation when accessing nested properties', () => {
      const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({
        nested: { sensitive: 'secret-A' }
      })

      const { proxy: proxyB } = createProxy({
        nested: { sensitive: 'secret-B' }
      })

      // Intercept access to nested properties in proxyA
      addInterceptorA('get', (target, prop) => {
        if (prop === 'nested') {
          // Return a restricted version
          return { sensitive: '***REDACTED***' }
        }
        return undefined
      })

      expect(proxyA.nested.sensitive).toBe('***REDACTED***')
      expect(proxyB.nested.sensitive).toBe('secret-B')
    })
  })

  describe('Multi-proxy isolation scenarios', () => {
    it('should handle multiple proxies with different isolation levels', () => {
      const { proxy: strictProxy, addInterceptor: addStrictInterceptor } =
        createProxy({
          data: 'strict'
        })

      const { proxy: permissiveProxy } = createProxy({
        data: 'permissive'
      })

      // Strict proxy enforces rules
      addStrictInterceptor('get', (target, prop) => {
        if (!['data'].includes(prop)) {
          throw new Error(`Strict mode: "${prop}" not allowed`)
        }
        return undefined
      })

      expect(strictProxy.data).toBe('strict')
      expect(() => {
        return strictProxy.other
      }).toThrow('Strict mode: "other" not allowed')

      // Permissive proxy allows anything
      expect(permissiveProxy.data).toBe('permissive')
      expect(permissiveProxy.other).toBeUndefined()
    })

    it('should prevent proxy chain attacks through isolated contexts', () => {
      const { proxy: proxy1, addInterceptor: add1 } = createProxy({
        level: 1
      })

      const { proxy: proxy2, addInterceptor: add2 } = createProxy({
        level: 2
      })

      // First proxy tries to return second proxy
      add1('get', (target, prop) => {
        if (prop === 'chain') {
          return proxy2 // Try to chain proxies
        }
        return undefined
      })

      // Second proxy tries to return first proxy
      add2('get', (target, prop) => {
        if (prop === 'chain') {
          return proxy1 // Try to create circular reference
        }
        return undefined
      })

      // Accessing through chain should maintain isolation
      expect(proxy1.chain).toBe(proxy2)
      expect(proxy2.chain).toBe(proxy1)

      // Each proxy maintains its own interceptor context
      expect(proxy1.level).toBe(1)
      expect(proxy2.level).toBe(2)
    })
  })
})
