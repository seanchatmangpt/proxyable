import { describe, it, expect, vi } from 'vitest'
import { runInterceptors, runBooleanInterceptors, runOwnKeysInterceptors } from '../../src/proxy/traps.js'

describe('traps.js utilities', () => {
  describe('runInterceptors', () => {
    it('should return the first definitive result from interceptors', () => {
      const interceptors = [
        vi.fn(() => undefined), // Does not handle
        vi.fn(() => 'handled'), // Handles the trap
        vi.fn(() => 'ignored')  // Should not be called
      ]
      const fallback = vi.fn(() => 'fallback')

      const result = runInterceptors(interceptors, fallback, 'arg1', 'arg2')

      expect(result).toBe('handled')
      expect(interceptors[0]).toHaveBeenCalledWith('arg1', 'arg2')
      expect(interceptors[1]).toHaveBeenCalledWith('arg1', 'arg2')
      expect(interceptors[2]).not.toHaveBeenCalled()
      expect(fallback).not.toHaveBeenCalled()
    })

    it('should call the fallback if no interceptors handle the trap', () => {
      const interceptors = [vi.fn(() => undefined)]
      const fallback = vi.fn(() => 'fallback')

      const result = runInterceptors(interceptors, fallback, 'arg1')

      expect(result).toBe('fallback')
      expect(interceptors[0]).toHaveBeenCalledWith('arg1')
      expect(fallback).toHaveBeenCalledWith('arg1')
    })
  })

  describe('runBooleanInterceptors', () => {
    it('should return false if any interceptor denies the operation', () => {
      const interceptors = [
        vi.fn(() => true),
        vi.fn(() => false), // Denies the operation
        vi.fn(() => true)   // Should not be called
      ]
      const fallback = vi.fn(() => true)

      const result = runBooleanInterceptors(interceptors, fallback, 'arg1')

      expect(result).toBe(false)
      expect(interceptors[0]).toHaveBeenCalledWith('arg1')
      expect(interceptors[1]).toHaveBeenCalledWith('arg1')
      expect(interceptors[2]).not.toHaveBeenCalled()
      expect(fallback).not.toHaveBeenCalled()
    })

    it('should call the fallback if all interceptors allow the operation', () => {
      const interceptors = [vi.fn(() => true), vi.fn(() => true)]
      const fallback = vi.fn(() => true)

      const result = runBooleanInterceptors(interceptors, fallback, 'arg1')

      expect(result).toBe(true)
      expect(interceptors[0]).toHaveBeenCalledWith('arg1')
      expect(interceptors[1]).toHaveBeenCalledWith('arg1')
      expect(fallback).toHaveBeenCalledWith('arg1')
    })
  })

  describe('runOwnKeysInterceptors', () => {
    it('should merge additional keys from interceptors with fallback keys', () => {
      const interceptors = [
        vi.fn(() => ['key3']),    // Adds one key
        vi.fn(() => ['key4', 'key5']) // Adds multiple keys
      ]
      const fallback = vi.fn(() => ['key1', 'key2'])

      const result = runOwnKeysInterceptors(interceptors, fallback, {})

      expect(result).toEqual(['key1', 'key2', 'key3', 'key4', 'key5'])
      expect(fallback).toHaveBeenCalledWith({})
      expect(interceptors[0]).toHaveBeenCalledWith({})
      expect(interceptors[1]).toHaveBeenCalledWith({})
    })

    it('should return only fallback keys if interceptors add no keys', () => {
      const interceptors = [vi.fn(() => undefined), vi.fn(() => undefined)]
      const fallback = vi.fn(() => ['key1', 'key2'])

      const result = runOwnKeysInterceptors(interceptors, fallback, {})

      expect(result).toEqual(['key1', 'key2'])
      expect(fallback).toHaveBeenCalledWith({})
      expect(interceptors[0]).toHaveBeenCalledWith({})
      expect(interceptors[1]).toHaveBeenCalledWith({})
    })
  })
})
