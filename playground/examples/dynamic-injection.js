/**
 * Dynamic Property Injection Example
 *
 * This example demonstrates how to use get interceptors to dynamically
 * inject properties and computed values that don't exist in the original object.
 */

import { createProxy } from '../../src/index.js'

// Create a user object with basic properties
const user = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com'
}

// Create a proxy with dynamic property injection
const { proxy, defineGetInterceptor } = createProxy(user)

// Add a get interceptor that injects computed properties
defineGetInterceptor((target, prop, _receiver) => {
  // Dynamically compute fullName by combining firstName and lastName
  if (prop === 'fullName') {
    const fullName = `${target.firstName} ${target.lastName}`
    console.log(`[Computed] Generated fullName: ${fullName}`)
    return fullName
  }

  // Dynamically compute initials from the name parts
  if (prop === 'initials') {
    const initials = `${target.firstName[0]}${target.lastName[0]}`.toUpperCase()
    console.log(`[Computed] Generated initials: ${initials}`)
    return initials
  }

  // Dynamically provide domain from email
  if (prop === 'emailDomain') {
    const domain = target.email.split('@')[1]
    console.log(`[Computed] Extracted domain: ${domain}`)
    return domain
  }

  // Dynamically provide a greeting message
  if (prop === 'greeting') {
    const greeting = `Hello, ${target.firstName}!`
    console.log(`[Computed] Generated greeting: ${greeting}`)
    return greeting
  }

  // Return undefined to let reflection handle actual properties
  return undefined
})

console.log('=== Dynamic Property Injection Example ===\n')

console.log('Original object properties:')
console.log(`  firstName: ${proxy.firstName}`)
console.log(`  lastName: ${proxy.lastName}`)
console.log(`  email: ${proxy.email}\n`)

console.log('Dynamically injected computed properties:')
console.log(`  fullName: ${proxy.fullName}`)
console.log(`  initials: ${proxy.initials}`)
console.log(`  emailDomain: ${proxy.emailDomain}`)
console.log(`  greeting: ${proxy.greeting}\n`)

console.log('Dynamic computation in action:')
console.log('If we update the firstName...')
user.firstName = 'Jane'
console.log('Now fullName reflects the change:', proxy.fullName)
console.log('And initials updated too:', proxy.initials)
