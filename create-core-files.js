import { promises as fs } from 'fs'
import { join } from 'path'

// Helper to create a directory if it doesn't exist
const createDirectory = async (path) => {
  try {
    await fs.mkdir(path, { recursive: true })
    console.log(`Directory created: ${path}`)
  } catch (error) {
    console.error(`Error creating directory ${path}:`, error)
  }
}

// Helper to write a file
const writeFile = async (path, content) => {
  try {
    await fs.writeFile(path, content)
    console.log(`File created: ${path}`)
  } catch (error) {
    console.error(`Error writing file ${path}:`, error)
  }
}

// Base directory for source files
const srcBase = join(process.cwd(), 'src')

// Core files content
const files = [
  {
    path: join(srcBase, 'context', 'context.js'),
    content: `import { createContext } from 'unctx'

const ctx = createContext()

export function useContext() {
  const currentContext = ctx.use()
  if (!currentContext) {
    throw new Error('No active Proxyable context found. Ensure you are within a createProxy call.')
  }
  return currentContext
}

export function setContext(data) {
  ctx.call(data, () => {})
}`
  },
  {
    path: join(srcBase, 'proxy', 'traps.js'),
    content: `// Utility functions for individual proxy traps

/**
 * Safely execute interceptors for a trap, returning the first definitive result.
 * @param {Array<Function>} interceptors
 * @param {Function} fallback
 * @param {...any} args
 * @returns {any}
 */
export const runInterceptors = (interceptors, fallback, ...args) => {
  for (const interceptor of interceptors) {
    const result = interceptor(...args)
    if (result !== undefined) return result
  }
  return fallback(...args)
}

/**
 * Safely execute boolean interceptors for traps that require approval.
 * @param {Array<Function>} interceptors
 * @param {Function} fallback
 * @param {...any} args
 * @returns {boolean}
 */
export const runBooleanInterceptors = (interceptors, fallback, ...args) => {
  for (const interceptor of interceptors) {
    if (!interceptor(...args)) return false
  }
  return fallback(...args)
}`
  },
  {
    path: join(srcBase, 'proxy', 'create-proxy.js'),
    content: `import { runInterceptors, runBooleanInterceptors } from './traps.js'
import { useContext } from '../context/context.js'

export function createProxy(target = {}) {
  const context = useContext()

  return new Proxy(target, {
    get(target, prop, receiver) {
      return runInterceptors(
        context.getInterceptors || [],
        Reflect.get,
        target, prop, receiver
      )
    },

    set(target, prop, value, receiver) {
      return runBooleanInterceptors(
        context.setInterceptors || [],
        Reflect.set,
        target, prop, value, receiver
      )
    },

    has(target, prop) {
      return runBooleanInterceptors(
        context.hasInterceptors || [],
        Reflect.has,
        target, prop
      )
    },

    deleteProperty(target, prop) {
      return runBooleanInterceptors(
        context.deleteInterceptors || [],
        Reflect.deleteProperty,
        target, prop
      )
    },

    ownKeys(target) {
      const keys = new Set(Reflect.ownKeys(target))
      for (const interceptor of context.ownKeysInterceptors || []) {
        const additionalKeys = interceptor(target)
        if (Array.isArray(additionalKeys)) additionalKeys.forEach((key) => keys.add(key))
      }
      return Array.from(keys)
    },

    apply(target, thisArg, args) {
      return runInterceptors(
        context.applyInterceptors || [],
        Reflect.apply,
        target, thisArg, args
      )
    },

    construct(target, args, newTarget) {
      return runInterceptors(
        context.constructInterceptors || [],
        Reflect.construct,
        target, args, newTarget
      )
    }
  })
}`
  },
  {
    path: join(srcBase, 'index.js'),
    content: `import { createProxy } from './proxy/createProxy.js'
import { useContext, setContext } from './context/context.js'

export { createProxy, useContext, setContext }`
  }
]

// Create directories and write files
const createCoreInfrastructure = async () => {
  console.log('Creating core infrastructure...')

  // Create required directories
  const directories = ['context', 'proxy']
  for (const dir of directories) {
    await createDirectory(join(srcBase, dir))
  }

  // Write files
  for (const file of files) {
    await writeFile(file.path, file.content)
  }

  console.log('Core infrastructure created successfully!')
}

// Execute the script
createCoreInfrastructure()
