/**
 * Validation Plugin
 *
 * A reusable validation interceptor that validates property assignments
 * against a set of defined rules. This plugin can be applied to any proxy
 * created with createProxy.
 *
 * Usage:
 *   const rules = {
 *     age: (value) => typeof value === 'number' && value > 0,
 *     email: (value) => typeof value === 'string' && value.includes('@')
 *   }
 *   const { proxy, defineSetInterceptor } = createProxy(target)
 *   applyValidationPlugin(proxy, rules, { defineSetInterceptor })
 */

/**
 * Creates a validation plugin that enforces rules on property assignments
 *
 * @param {Object} validationRules - Object mapping property names to validator functions
 *                                   Each validator receives the value and returns true/false
 * @param {Object} options - Configuration options
 * @param {boolean} [options.throwOnError=false] - Whether to throw errors or just log warnings
 * @param {Function} [options.logger=console.warn] - Custom logger function for failures
 * @returns {Function} A plugin function that applies validation to a proxy
 */
export function createValidationPlugin(validationRules = {}, options = {}) {
  const {
    throwOnError = false,
    logger = console.warn
  } = options

  return function applyValidationPlugin(proxy, interceptors) {
    const { defineSetInterceptor } = interceptors

    if (!defineSetInterceptor) {
      console.warn('Validation plugin requires defineSetInterceptor')
      return proxy
    }

    defineSetInterceptor((target, prop, value, receiver) => {
      const propName = String(prop)
      const validator = validationRules[propName]

      // If there's a validator for this property, run it
      if (validator) {
        try {
          const isValid = validator(value)

          if (!isValid) {
            const errorMsg = `Validation failed for property "${propName}": invalid value ${JSON.stringify(value)}`

            if (throwOnError) {
              throw new Error(errorMsg)
            } else {
              logger(errorMsg)
              return false // Block the assignment
            }
          }
        } catch (error) {
          if (throwOnError) {
            throw error
          } else {
            logger(`Validation error for "${propName}": ${error.message}`)
            return false // Block the assignment
          }
        }
      }

      // Allow the assignment if no validator or validation passed
      return true
    })

    return proxy
  }
}

/**
 * Common validator functions for reuse
 */
export const validators = {
  // Validates that value is a string
  isString: (value) => typeof value === 'string',

  // Validates that value is a non-empty string
  isNonEmptyString: (value) => typeof value === 'string' && value.trim().length > 0,

  // Validates that value is a number
  isNumber: (value) => typeof value === 'number' && !Number.isNaN(value),

  // Validates that value is a positive number
  isPositiveNumber: (value) => typeof value === 'number' && value > 0,

  // Validates that value is a non-negative number
  isNonNegativeNumber: (value) => typeof value === 'number' && value >= 0,

  // Validates that value is an integer
  isInteger: (value) => Number.isInteger(value),

  // Validates that value is a non-negative integer
  isNonNegativeInteger: (value) => Number.isInteger(value) && value >= 0,

  // Validates that value is a valid email
  isEmail: (value) => {
    if (typeof value !== 'string') return false
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  },

  // Validates that value is a boolean
  isBoolean: (value) => typeof value === 'boolean',

  // Validates that value is one of the allowed values
  isOneOf: (allowedValues) => (value) => allowedValues.includes(value),

  // Validates that value matches a regex pattern
  matches: (pattern) => (value) => pattern.test(String(value))
}
