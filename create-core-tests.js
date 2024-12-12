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
    console.log(`Test file created: ${path}`)
  } catch (error) {
    console.error(`Error writing test file ${path}:`, error)
  }
}

// Base directory for test files
const testBase = join(process.cwd(), 'test')

// Test files content
const tests = [
  {
    path: join(testBase, 'context', 'context.test.js'),
    content: `import { describe, it, expect } from 'vitest'
import { setContext, useContext } from '../../src/context/context.js'

describe('Context Management', () => {
  it('should set and retrieve context correctly', () => {
    const testData = { key: 'value' }
    setContext(testData)

    const context = useContext()
    expect(context).toEqual(testData)
  })

  it('should throw an error if no context is set', () => {
    expect(() => useContext()).toThrowError('No active Proxyable context found')
  })
})`
  },
  {
    path: join(testBase, 'proxy', 'traps.test.js'),
    content: `import { describe, it, expect, vi } from 'vitest'
import { runInterceptors, runBooleanInterceptors } from '../../src/proxy/traps.js'

describe('Traps Utilities', () => {
  it('should execute interceptors and return the first definitive result', () => {
    const interceptors = [
      vi.fn(() => undefined),
      vi.fn(() => 'result'),
      vi.fn(() => 'ignored')
    ]
    const fallback = vi.fn(() => 'fallback')

    const result = runInterceptors(interceptors, fallback, 'arg1', 'arg2')

    expect(result).toBe('result')
    expect(interceptors[0]).toHaveBeenCalledWith('arg1', 'arg2')
    expect(interceptors[1]).toHaveBeenCalledWith('arg1', 'arg2')
    expect(interceptors[2]).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()
  })

  it('should execute fallback if no interceptors provide a definitive result', () => {
    const interceptors = [vi.fn(() => undefined)]
    const fallback = vi.fn(() => 'fallback')

    const result = runInterceptors(interceptors, fallback, 'arg1')

    expect(result).toBe('fallback')
    expect(fallback).toHaveBeenCalledWith('arg1')
  })

  it('should return false if any boolean interceptor denies', () => {
    const interceptors = [
      vi.fn(() => true),
      vi.fn(() => false),
      vi.fn(() => true)
    ]
    const fallback = vi.fn(() => true)

    const result = runBooleanInterceptors(interceptors, fallback, 'arg1')

    expect(result).toBe(false)
    expect(interceptors[0]).toHaveBeenCalled()
    expect(interceptors[1]).toHaveBeenCalled()
    expect(interceptors[2]).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()
  })

  it('should execute fallback if all boolean interceptors allow', () => {
    const interceptors = [vi.fn(() => true), vi.fn(() => true)]
    const fallback = vi.fn(() => true)

    const result = runBooleanInterceptors(interceptors, fallback, 'arg1')

    expect(result).toBe(true)
    expect(fallback).toHaveBeenCalledWith('arg1')
  })
})`
  },
  {
    path: join(testBase, 'proxy', 'createProxy.test.js'),
    content: `import { describe, it, expect, vi } from 'vitest'
import { createProxy } from '../../src/proxy/createProxy.js'
import { setContext } from '../../src/context/context.js'

describe('Create Proxy', () => {
  it('should handle get trap with interceptors', () => {
    const target = { key: 'value' }
    const interceptor = vi.fn((t, prop) => (prop === 'intercepted' ? 'interceptedValue' : undefined))

    setContext({ getInterceptors: [interceptor] })
    const proxy = createProxy(target)

    expect(proxy.intercepted).toBe('interceptedValue')
    expect(interceptor).toHaveBeenCalledWith(target, 'intercepted', proxy)

    expect(proxy.key).toBe('value')
    expect(interceptor).toHaveBeenCalledWith(target, 'key', proxy)
  })

  it('should handle set trap with boolean interceptors', () => {
    const target = {}
    const interceptor = vi.fn(() => true)

    setContext({ setInterceptors: [interceptor] })
    const proxy = createProxy(target)

    proxy.key = 'value'

    expect(target.key).toBe('value')
    expect(interceptor).toHaveBeenCalledWith(target, 'key', 'value', proxy)
  })

  it('should deny set trap if an interceptor returns false', () => {
    const target = {}
    const interceptor = vi.fn(() => false)

    setContext({ setInterceptors: [interceptor] })
    const proxy = createProxy(target)

    proxy.key = 'value'

    expect(target.key).toBeUndefined()
    expect(interceptor).toHaveBeenCalledWith(target, 'key', 'value', proxy)
  })
})`
  }
]

// Create directories and write test files
const createTests = async () => {
  console.log('Creating Vitest test files...')

  // Create required directories
  const directories = ['context', 'proxy']
  for (const dir of directories) {
    await createDirectory(join(testBase, dir))
  }

  // Write test files
  for (const test of tests) {
    await writeFile(test.path, test.content)
  }

  console.log('Vitest test files created successfully!')
}

// Execute the script
createTests()
