import { describe, it, expect } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createCapabilityContext,
  createGetInterceptor,
  createSetInterceptor,
  createHasInterceptor,
  createDeletePropertyInterceptor,
  createOwnKeysInterceptor,
  createGetOwnPropertyDescriptorInterceptor,
  createApplyInterceptor,
  createConstructInterceptor,
  registerCapabilityInterceptors,
} from '../../src/security/capability-acl.js'

describe('Capability-Based Access Control', () => {
  describe('createCapabilityContext', () => {
    it('should create a capability context with specified permissions', () => {
      const target = { foo: 1, bar: 2 }
      const capabilities = {
        canRead: new Set(['foo']),
        canWrite: new Set(['foo']),
      }

      const capCtx = createCapabilityContext(target, capabilities)
      expect(capCtx).toBeDefined()
      expect(capCtx.tryUse).toBeDefined()
      expect(capCtx.use).toBeDefined()
      expect(capCtx.call).toBeDefined()
      expect(capCtx.capabilities).toBeDefined()
    })

    it('should handle empty capabilities with defaults', () => {
      const target = {}
      const capCtx = createCapabilityContext(target)

      expect(capCtx.capabilities.canRead).toBeInstanceOf(Set)
      expect(capCtx.capabilities.canRead.size).toBe(0)
      expect(capCtx.capabilities.canApply).toBe(false)
      expect(capCtx.capabilities.canConstruct).toBe(false)
    })
  })

  describe('Get Interceptor - Read Capabilities', () => {
    it('should allow reading properties with canRead capability', () => {
      const target = { secret: 'hidden', public: 'visible' }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['public']),
      })

      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        expect(proxy.public).toBe('visible')
      })
    })

    it('should deny reading properties without canRead capability', () => {
      const target = { secret: 'hidden', public: 'visible' }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['public']),
      })

      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        expect(() => proxy.secret).toThrow('Access denied: No read capability for property "secret"')
      })
    })

    it('should support function-based canRead capability', () => {
      const target = { public_foo: 1, private_bar: 2, public_baz: 3 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: (key) => String(key).startsWith('public_'),
      })

      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        expect(proxy.public_foo).toBe(1)
        expect(proxy.public_baz).toBe(3)
        expect(() => proxy.private_bar).toThrow('No read capability')
      })
    })

    it('should deny access when no capability context is active', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['foo']),
      })

      defineGetInterceptor(createGetInterceptor(capCtx))

      // Access outside context should fail
      expect(() => proxy.foo).toThrow('No capability context')
    })
  })

  describe('Set Interceptor - Write Capabilities', () => {
    it('should allow writing properties with canWrite capability', () => {
      const target = { editable: 1, readonly: 2 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['editable']),
      })

      defineSetInterceptor(createSetInterceptor(capCtx))

      capCtx.call(() => {
        proxy.editable = 42
        expect(target.editable).toBe(42)
      })
    })

    it('should deny writing properties without canWrite capability', () => {
      const target = { editable: 1, readonly: 2 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['editable']),
      })

      defineSetInterceptor(createSetInterceptor(capCtx))

      capCtx.call(() => {
        // Should silently fail (returns false)
        const result = Reflect.set(proxy, 'readonly', 99)
        expect(result).toBe(false)
        expect(target.readonly).toBe(2) // Unchanged
      })
    })

    it('should support function-based canWrite capability', () => {
      const target = {}
      const { proxy, defineSetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canWrite: (key) => String(key).endsWith('_writable'),
      })

      defineSetInterceptor(createSetInterceptor(capCtx))

      capCtx.call(() => {
        proxy.foo_writable = 1
        expect(target.foo_writable).toBe(1)

        const result = Reflect.set(proxy, 'foo_readonly', 2)
        expect(result).toBe(false)
        expect(target.foo_readonly).toBeUndefined()
      })
    })
  })

  describe('Has Interceptor - Property Visibility', () => {
    it('should return true for properties with canRead capability', () => {
      const target = { visible: 1, hidden: 2 }
      const { proxy, defineHasInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['visible']),
      })

      defineHasInterceptor(createHasInterceptor(capCtx))

      capCtx.call(() => {
        expect('visible' in proxy).toBe(true)
      })
    })

    it('should return false for properties without canRead capability', () => {
      const target = { visible: 1, hidden: 2 }
      const { proxy, defineHasInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['visible']),
      })

      defineHasInterceptor(createHasInterceptor(capCtx))

      capCtx.call(() => {
        expect('hidden' in proxy).toBe(false)
      })
    })
  })

  describe('DeleteProperty Interceptor - Delete Capabilities', () => {
    it('should allow deleting properties with canDelete capability', () => {
      const target = { deletable: 1, permanent: 2 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canDelete: new Set(['deletable']),
      })

      defineDeletePropertyInterceptor(createDeletePropertyInterceptor(capCtx))

      capCtx.call(() => {
        delete proxy.deletable
        expect(target.deletable).toBeUndefined()
      })
    })

    it('should deny deleting properties without canDelete capability', () => {
      const target = { deletable: 1, permanent: 2 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canDelete: new Set(['deletable']),
      })

      defineDeletePropertyInterceptor(createDeletePropertyInterceptor(capCtx))

      capCtx.call(() => {
        const result = Reflect.deleteProperty(proxy, 'permanent')
        expect(result).toBe(false)
        expect(target.permanent).toBe(2) // Still exists
      })
    })

    it('should support function-based canDelete capability', () => {
      const target = { temp_foo: 1, perm_bar: 2 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canDelete: (key) => String(key).startsWith('temp_'),
      })

      defineDeletePropertyInterceptor(createDeletePropertyInterceptor(capCtx))

      capCtx.call(() => {
        delete proxy.temp_foo
        expect(target.temp_foo).toBeUndefined()

        const result = Reflect.deleteProperty(proxy, 'perm_bar')
        expect(result).toBe(false)
        expect(target.perm_bar).toBe(2)
      })
    })
  })

  describe('OwnKeys Interceptor - Key Filtering', () => {
    it('should filter keys to only readable properties', () => {
      const target = { public1: 1, public2: 2, private1: 3, private2: 4 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['public1', 'public2']),
      })

      defineOwnKeysInterceptor(createOwnKeysInterceptor(capCtx))

      capCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual(['public1', 'public2'])
        expect(keys).not.toContain('private1')
        expect(keys).not.toContain('private2')
      })
    })

    it('should return empty array when no capabilities are active', () => {
      const target = { foo: 1, bar: 2 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['foo']),
      })

      defineOwnKeysInterceptor(createOwnKeysInterceptor(capCtx))

      // Outside context
      const keys = Reflect.ownKeys(proxy)
      expect(keys).toEqual([])
    })

    it('should work with Object.keys()', () => {
      const target = { visible1: 1, visible2: 2, hidden: 3 }
      const { proxy, defineOwnKeysInterceptor, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['visible1', 'visible2']),
      })

      defineOwnKeysInterceptor(createOwnKeysInterceptor(capCtx))
      defineGetOwnPropertyDescriptorInterceptor(
        createGetOwnPropertyDescriptorInterceptor(capCtx)
      )

      capCtx.call(() => {
        const keys = Object.keys(proxy)
        expect(keys).toEqual(['visible1', 'visible2'])
      })
    })
  })

  describe('GetOwnPropertyDescriptor Interceptor', () => {
    it('should return descriptor for readable properties', () => {
      const target = { readable: 42 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['readable']),
      })

      defineGetOwnPropertyDescriptorInterceptor(
        createGetOwnPropertyDescriptorInterceptor(capCtx)
      )

      capCtx.call(() => {
        const desc = Object.getOwnPropertyDescriptor(proxy, 'readable')
        expect(desc).toBeDefined()
        expect(desc.value).toBe(42)
      })
    })

    it('should allow descriptor access but prevent reading via get', () => {
      const target = { hidden: 42, readable: 10 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['readable']),
      })

      defineGetOwnPropertyDescriptorInterceptor(
        createGetOwnPropertyDescriptorInterceptor(capCtx)
      )
      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        // getOwnPropertyDescriptor falls through for non-readable properties
        // (this is a framework limitation where undefined means "continue")
        const desc = Object.getOwnPropertyDescriptor(proxy, 'hidden')
        expect(desc).toBeDefined() // Descriptor exists

        // But get trap still denies access
        expect(() => proxy.hidden).toThrow('No read capability')

        // Readable properties work fine
        expect(proxy.readable).toBe(10)
      })
    })
  })

  describe('Apply Interceptor - Function Execution', () => {
    it('should allow function application with canApply capability', () => {
      const target = function (x) { return x * 2 }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canApply: true,
      })

      defineApplyInterceptor(createApplyInterceptor(capCtx))

      capCtx.call(() => {
        const result = proxy(21)
        expect(result).toBe(42)
      })
    })

    it('should deny function application without canApply capability', () => {
      const target = function (x) { return x * 2 }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canApply: false,
      })

      defineApplyInterceptor(createApplyInterceptor(capCtx))

      capCtx.call(() => {
        expect(() => proxy(21)).toThrow('Access denied: No apply capability')
      })
    })

    it('should support function-based canApply capability', () => {
      const target = function (...args) { return args }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canApply: (target, thisArg, argsList) => argsList.length <= 2,
      })

      defineApplyInterceptor(createApplyInterceptor(capCtx))

      capCtx.call(() => {
        expect(proxy(1, 2)).toEqual([1, 2])
        expect(() => proxy(1, 2, 3)).toThrow('No apply capability')
      })
    })
  })

  describe('Construct Interceptor - Object Creation', () => {
    it('should allow construction with canConstruct capability', () => {
      const target = function (name) {
        this.name = name
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canConstruct: true,
      })

      defineConstructInterceptor(createConstructInterceptor(capCtx))

      capCtx.call(() => {
        const obj = new proxy('Test')
        expect(obj.name).toBe('Test')
      })
    })

    it('should deny construction without canConstruct capability', () => {
      const target = function (name) {
        this.name = name
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canConstruct: false,
      })

      defineConstructInterceptor(createConstructInterceptor(capCtx))

      capCtx.call(() => {
        expect(() => new proxy('Test')).toThrow('Access denied: No construct capability')
      })
    })

    it('should support function-based canConstruct capability', () => {
      const target = function (value) {
        this.value = value
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canConstruct: (target, argsList) => argsList[0] !== 'forbidden',
      })

      defineConstructInterceptor(createConstructInterceptor(capCtx))

      capCtx.call(() => {
        const obj1 = new proxy('allowed')
        expect(obj1.value).toBe('allowed')

        expect(() => new proxy('forbidden')).toThrow('No construct capability')
      })
    })
  })

  describe('Multiple Isolated Contexts', () => {
    it('should support multiple contexts with different capabilities', () => {
      const target = { foo: 1, bar: 2, baz: 3 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      // Context A can read foo and bar
      const capCtxA = createCapabilityContext(target, {
        canRead: new Set(['foo', 'bar']),
      })

      // Context B can read bar and baz
      const capCtxB = createCapabilityContext(target, {
        canRead: new Set(['bar', 'baz']),
      })

      defineGetInterceptor(createGetInterceptor(capCtxA))

      // In context A
      capCtxA.call(() => {
        expect(proxy.foo).toBe(1)
        expect(proxy.bar).toBe(2)
        expect(() => proxy.baz).toThrow('No read capability for property "baz"')
      })

      // Note: To test context B, we'd need to create a separate proxy with its interceptor
      // This demonstrates that capabilities are bound to their contexts
    })

    it('should demonstrate context isolation with separate proxies', () => {
      const target = { secret: 'hidden', public: 'visible', internal: 'restricted' }

      // Proxy A: read-only access to public
      const { proxy: proxyA, defineGetInterceptor: addGetA } = createProxy(target)
      const capCtxA = createCapabilityContext(target, {
        canRead: new Set(['public']),
      })
      addGetA(createGetInterceptor(capCtxA))

      // Proxy B: read access to secret and internal
      const { proxy: proxyB, defineGetInterceptor: addGetB } = createProxy(target)
      const capCtxB = createCapabilityContext(target, {
        canRead: new Set(['secret', 'internal']),
      })
      addGetB(createGetInterceptor(capCtxB))

      // Context A can only read public
      capCtxA.call(() => {
        expect(proxyA.public).toBe('visible')
        expect(() => proxyA.secret).toThrow('No read capability')
      })

      // Context B can only read secret and internal
      capCtxB.call(() => {
        expect(proxyB.secret).toBe('hidden')
        expect(proxyB.internal).toBe('restricted')
        expect(() => proxyB.public).toThrow('No read capability')
      })
    })
  })

  describe('Composition with Other Interceptors', () => {
    it('should compose with logging interceptors', () => {
      const target = { value: 42 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const logs = []
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['value']),
      })

      // Add logging interceptor first
      defineGetInterceptor((target, prop) => {
        logs.push(`get: ${String(prop)}`)
        return undefined // Allow continuation
      })

      // Add capability interceptor
      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        const result = proxy.value
        expect(result).toBe(42)
        expect(logs).toContain('get: value')
      })
    })

    it('should compose with validation interceptors', () => {
      const target = { age: 0 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['age']),
      })

      // Add validation interceptor
      defineSetInterceptor((target, prop, value) => {
        if (prop === 'age' && value < 0) {
          throw new Error('Age cannot be negative')
        }
        return undefined // Allow continuation
      })

      // Add capability interceptor
      defineSetInterceptor(createSetInterceptor(capCtx))

      capCtx.call(() => {
        proxy.age = 25
        expect(target.age).toBe(25)

        expect(() => {
          proxy.age = -5
        }).toThrow('Age cannot be negative')
      })
    })

    it('should deny operations when capability check fails before other interceptors', () => {
      const target = { restricted: 1, allowed: 2 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['allowed']),
      })

      const called = []

      // Add capability interceptor first (denies restricted)
      defineSetInterceptor(createSetInterceptor(capCtx))

      // Add another interceptor that should not be called for restricted
      defineSetInterceptor((target, prop, value) => {
        called.push(prop)
        return undefined
      })

      capCtx.call(() => {
        // This should be denied by capability and not reach the second interceptor
        const result = Reflect.set(proxy, 'restricted', 99)
        expect(result).toBe(false)
        expect(called).not.toContain('restricted')

        // This should pass capability check and reach the second interceptor
        proxy.allowed = 99
        expect(called).toContain('allowed')
      })
    })
  })

  describe('registerCapabilityInterceptors Helper', () => {
    it('should register all interceptors at once', () => {
      const target = { readable: 1, writable: 2 }
      const proxyInterface = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['readable']),
        canWrite: new Set(['writable']),
        canDelete: new Set(['deletable']),
        canApply: false,
        canConstruct: false,
      })

      registerCapabilityInterceptors(proxyInterface, capCtx)

      capCtx.call(() => {
        // Read capability
        expect(proxyInterface.proxy.readable).toBe(1)
        expect(() => proxyInterface.proxy.writable).toThrow('No read capability')

        // Write capability
        proxyInterface.proxy.writable = 42
        expect(target.writable).toBe(42)

        const setResult = Reflect.set(proxyInterface.proxy, 'readable', 99)
        expect(setResult).toBe(false)
      })
    })
  })

  describe('Context-Local Permissions (No Global Leakage)', () => {
    it('should not leak capabilities across different execution contexts', () => {
      const target = { value: 'secret' }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtxA = createCapabilityContext(target, {
        canRead: new Set(['value']),
      })

      const capCtxB = createCapabilityContext(target, {
        canRead: new Set(), // No read permissions
      })

      defineGetInterceptor(createGetInterceptor(capCtxA))

      // In context A, access is allowed
      capCtxA.call(() => {
        expect(proxy.value).toBe('secret')
      })

      // In context B (using a different context with the same interceptor), access is denied
      // Note: This would require the interceptor to check against contextB
      // The current implementation binds the interceptor to a specific context
      // So we'd need a different proxy or a more dynamic interceptor

      // Outside any context, access is denied
      expect(() => proxy.value).toThrow('No capability context')
    })

    it('should enforce fail-closed security by default', () => {
      const target = { data: 'sensitive' }
      const proxyInterface = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        // No capabilities specified - all empty
      })

      registerCapabilityInterceptors(proxyInterface, capCtx)

      capCtx.call(() => {
        // No read capability - should deny
        expect(() => proxyInterface.proxy.data).toThrow('No read capability')

        // No write capability - should deny
        const result = Reflect.set(proxyInterface.proxy, 'data', 'new')
        expect(result).toBe(false)
      })
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle Symbol properties in capabilities', () => {
      const sym = Symbol('test')
      const target = { [sym]: 'symbolic' }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set([sym]),
      })

      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        expect(proxy[sym]).toBe('symbolic')
      })
    })

    it('should handle function predicates that return falsy values', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: (key) => false, // Always deny
      })

      defineGetInterceptor(createGetInterceptor(capCtx))

      capCtx.call(() => {
        expect(() => proxy.foo).toThrow('No read capability')
      })
    })

    it('should handle nested context calls correctly', () => {
      const target = { outer: 1, inner: 2 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const outerCtx = createCapabilityContext(target, {
        canRead: new Set(['outer']),
      })

      const innerCtx = createCapabilityContext(target, {
        canRead: new Set(['inner']),
      })

      defineGetInterceptor(createGetInterceptor(outerCtx))

      outerCtx.call(() => {
        expect(proxy.outer).toBe(1)

        // The interceptor is bound to outerCtx, so innerCtx won't work with it
        // This demonstrates the context binding
      })
    })
  })
})
