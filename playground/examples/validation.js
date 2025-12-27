/**
 * Validation Example
 *
 * This example shows how to use set interceptors to validate
 * property assignments before they are committed to the target object.
 */

import { createProxy } from '../../src/index.js'

// Create a product object
const product = {
  name: 'Laptop',
  price: 999.99,
  quantity: 5
}

// Create a proxy with validation
const { proxy, defineSetInterceptor } = createProxy(product)

// Validation rule for price: must be a positive number
defineSetInterceptor((target, prop, value, receiver) => {
  if (prop === 'price') {
    if (typeof value !== 'number' || value <= 0) {
      console.error(`❌ Validation failed: price must be a positive number, got ${value}`)
      return false // Block the assignment
    }
    console.log(`✓ Valid price: ${value}`)
    return true // Allow the assignment
  }

  // Validation rule for quantity: must be a non-negative integer
  if (prop === 'quantity') {
    if (!Number.isInteger(value) || value < 0) {
      console.error(`❌ Validation failed: quantity must be a non-negative integer, got ${value}`)
      return false // Block the assignment
    }
    console.log(`✓ Valid quantity: ${value}`)
    return true // Allow the assignment
  }

  // Validation rule for name: must be a non-empty string
  if (prop === 'name') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      console.error(`❌ Validation failed: name must be a non-empty string`)
      return false // Block the assignment
    }
    console.log(`✓ Valid name: ${value}`)
    return true // Allow the assignment
  }

  // Allow other properties
  return true
})

console.log('=== Validation Example ===\n')

console.log('Initial product:', product, '\n')

console.log('1. Testing valid assignments:')
proxy.price = 1299.99
console.log(`   Product price is now: ${proxy.price}\n`)

proxy.quantity = 10
console.log(`   Product quantity is now: ${proxy.quantity}\n`)

proxy.name = 'Gaming Laptop'
console.log(`   Product name is now: ${proxy.name}\n`)

console.log('2. Testing invalid assignments:')
try {
  proxy.price = -100
} catch {
  console.log(`   Assignment blocked (set trap returned false)\n`)
}
console.log(`   Price remains: ${proxy.price}\n`)

try {
  proxy.quantity = 3.5
} catch {
  console.log(`   Assignment blocked (set trap returned false)\n`)
}
console.log(`   Quantity remains: ${proxy.quantity}\n`)

try {
  proxy.name = ''
} catch {
  console.log(`   Assignment blocked (set trap returned false)\n`)
}
console.log(`   Name remains: ${proxy.name}\n`)

try {
  proxy.quantity = -5
} catch {
  console.log(`   Assignment blocked (set trap returned false)\n`)
}
console.log(`   Quantity remains: ${proxy.quantity}\n`)

console.log('3. Final product state:')
console.log('   ', proxy)
