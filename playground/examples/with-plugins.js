/**
 * Using Plugins Example
 *
 * This example demonstrates how to use the reusable plugins
 * to add logging and validation to a proxy.
 */

import { createProxy } from '../../src/index.js'
import { createLoggingPlugin } from '../plugins/logging-plugin.js'
import { createValidationPlugin, validators } from '../plugins/validation-plugin.js'

// Create a blog post object
const blogPost = {
  title: 'Getting Started with Proxyable',
  content: 'A guide to creating dynamic proxies...',
  author: 'Jane Doe',
  views: 0,
  published: false
}

// Create a proxy for the blog post
const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(blogPost)

// Define validation rules for blog post properties
const validationRules = {
  title: validators.isNonEmptyString,
  author: validators.isNonEmptyString,
  content: validators.isNonEmptyString,
  views: validators.isNonNegativeInteger,
  published: validators.isBoolean
}

// Apply the logging plugin
const loggingPlugin = createLoggingPlugin({ name: 'BlogPost' })
loggingPlugin(proxy, { defineGetInterceptor, defineSetInterceptor })

// Apply the validation plugin
const validationPlugin = createValidationPlugin(validationRules, { throwOnError: false })
validationPlugin(proxy, { defineSetInterceptor })

console.log('=== Using Plugins Example ===\n')

console.log('1. Initial state:')
console.log(`   Title: ${proxy.title}`)
console.log(`   Published: ${proxy.published}\n`)

console.log('2. Incrementing views:')
proxy.views = 1
proxy.views = 5
proxy.views = 10
console.log(`   Views: ${proxy.views}\n`)

console.log('3. Publishing the post:')
proxy.published = true
console.log(`   Published: ${proxy.published}\n`)

console.log('4. Attempting invalid assignments:')
console.log('   Trying to set title to empty string...')
try {
  proxy.title = ''
} catch {
  console.log(`   Failed - validation rejected empty title\n`)
}

console.log('   Trying to set views to negative number...')
try {
  proxy.views = -5
} catch {
  console.log(`   Failed - validation rejected negative views\n`)
}

console.log('5. Final state:')
console.log(`   Title: ${proxy.title}`)
console.log(`   Author: ${proxy.author}`)
console.log(`   Views: ${proxy.views}`)
console.log(`   Published: ${proxy.published}`)
