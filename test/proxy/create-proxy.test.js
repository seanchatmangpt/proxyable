import { describe, it, expect } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'

describe('createProxy', () => {
  it('should handle get trap with interceptors', () => {
    const { proxy, addInterceptor } = createProxy({ key: 'value' })

    addInterceptor('get', (target, prop) => {
      if (prop === 'dynamic') return 'Dynamic Value'
      return undefined
    })

    expect(proxy.key).toBe('value') // Original property
    expect(proxy.dynamic).toBe('Dynamic Value') // Intercepted property
  })

  it('should handle set trap with validation', () => {
    const { proxy, addInterceptor } = createProxy({})

    addInterceptor('set', (target, prop, value) => {
      if (prop === 'age' && typeof value !== 'number') {
        throw new TypeError('Age must be a number.')
      }
      return true
    })

    proxy.age = 25
    expect(proxy.age).toBe(25) // Valid set

    expect(() => {
      proxy.age = 'not a number'
    }).toThrow(TypeError) // Invalid set
  })

  it('should handle deleteProperty trap with restricted deletion', () => {
    const { proxy, addInterceptor } = createProxy({ protectedKey: 'value', deletableKey: 'value' })

    addInterceptor('deleteProperty', (target, prop) => {
      if (prop === 'protectedKey') {
        throw new Error(`Cannot delete protected property "${prop}".`)
      }
      return true
    })

    expect(() => {
      delete proxy.protectedKey
    }).toThrow('Cannot delete protected property "protectedKey".')

    delete proxy.deletableKey
    expect(proxy.deletableKey).toBeUndefined()
  })

  it('should handle has trap with custom behavior', () => {
    const { proxy, addInterceptor } = createProxy({ key: 'value' })

    addInterceptor('has', (target, prop) => {
      if (prop === 'hidden') return false // Hide this property from `in`
      return Reflect.has(target, prop)
    })

    expect('key' in proxy).toBe(true)
    expect('hidden' in proxy).toBe(false)
  })

it('should handle ownKeys trap with dynamic keys', () => {
  const { proxy, addInterceptor } = createProxy({ key1: 'value1' })

  addInterceptor('ownKeys', (_target) => {
    return ['key1', 'dynamicKey']
  })

  addInterceptor('getOwnPropertyDescriptor', (target, prop) => {
    if (prop === 'dynamicKey') {
      return { value: 'Dynamic Value', enumerable: true, configurable: true, writable: true }
    }
    return Reflect.getOwnPropertyDescriptor(target, prop)
  })

  const keys = Object.keys(proxy)
  expect(keys).toEqual(['key1', 'dynamicKey']) // Passes now
})

  it('should handle apply trap for function proxies', () => {
    const target = function () {
      return 'Original Output'
    }
    const { proxy, addInterceptor } = createProxy(target)

    addInterceptor('apply', (target, thisArg, argsList) => {
      if (argsList.includes('intercept')) {
        return 'Intercepted Output'
      }
      return undefined
    })

    expect(proxy('original')).toBe('Original Output') // No interception
    expect(proxy('intercept')).toBe('Intercepted Output') // Interception applied
  })

  it('should handle construct trap for object instantiation', () => {
    const target = function (name) {
      this.name = name
    }
    const { proxy, addInterceptor } = createProxy(target)

    addInterceptor('construct', (target, argsList) => {
      if (argsList[0] === 'special') {
        return { name: 'Intercepted Instance' }
      }
      return undefined
    })

    const obj1 = new proxy('special')
    expect(obj1.name).toBe('Intercepted Instance')

    const obj2 = new proxy('normal')
    expect(obj2.name).toBe('normal')
  })

  it('should support multiple proxies with isolated contexts', () => {
    const { proxy: proxyA, addInterceptor: addInterceptorA } = createProxy({ name: 'ProxyA' })
    const { proxy: proxyB, addInterceptor: addInterceptorB } = createProxy({ name: 'ProxyB' })

    addInterceptorA('get', (target, prop) => {
      if (prop === 'special') return 'Value from ProxyA'
    })

    addInterceptorB('get', (target, prop) => {
      if (prop === 'special') return 'Value from ProxyB'
    })

    expect(proxyA.special).toBe('Value from ProxyA')
    expect(proxyB.special).toBe('Value from ProxyB')
  })

  it('should validate trap names in addInterceptor', () => {
    const { addInterceptor } = createProxy({})

    expect(() => {
      addInterceptor('invalidTrap', () => {})
    }).toThrow(TypeError)

    expect(() => {
      addInterceptor('get', () => {})
    }).not.toThrow()
  })
})
