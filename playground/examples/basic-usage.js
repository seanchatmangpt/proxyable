/**
 * Basic Usage Example
 *
 * This example demonstrates the fundamentals of proxyable:
 * - Creating a proxy with createProxy
 * - Adding get interceptors to intercept property access
 * - Adding set interceptors to intercept property assignment
 */

import { createProxy } from '../../src/index.js'

// Create a target object
const user = {
  name: 'Alice',
  age: 30
}

// Create a proxy with tracking capabilities
const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(user)

// Add a get interceptor to log property access
defineGetInterceptor((target, prop, _receiver) => {
  console.log(`[GET] Accessing property: ${String(prop)}`)
  // Return undefined to let the next interceptor or reflection handle it
  // This allows the normal property access to continue
  return undefined
})

// Add a set interceptor to log and validate property assignments
defineSetInterceptor((target, prop, value, receiver) => {
  console.log(`[SET] Assigning ${String(prop)} = ${value}`)
  // Return true to allow the assignment, false to block it
  return true
})

console.log('=== Basic Usage Example ===\n')

// Access properties through the proxy
console.log('1. Accessing properties:')
const name = proxy.name
console.log(`   Retrieved name: ${name}\n`)

const age = proxy.age
console.log(`   Retrieved age: ${age}\n`)

// Modify properties through the proxy
console.log('2. Modifying properties:')
proxy.age = 31
console.log(`   age updated to: ${proxy.age}\n`)

proxy.name = 'Bob'
console.log(`   name updated to: ${proxy.name}\n`)

// Add new properties
console.log('3. Adding new properties:')
proxy.email = 'bob@example.com'
console.log(`   email set to: ${proxy.email}\n`)

console.log('4. Final object state:')
console.log('   Original object:', user)
console.log('   Proxy access:')
console.log(`   - name: ${proxy.name}`)
console.log(`   - age: ${proxy.age}`)
console.log(`   - email: ${proxy.email}`)
