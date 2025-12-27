/**
 * Logging Plugin
 *
 * A reusable logging interceptor that tracks all proxy operations.
 * This plugin can be applied to any proxy created with createProxy.
 *
 * Usage:
 *   const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(target)
 *   applyLoggingPlugin(proxy, { defineGetInterceptor, defineSetInterceptor })
 */

/**
 * Creates a logging plugin that tracks property access and modifications
 *
 * @param {Object} options - Configuration options
 * @param {string} [options.name='Object'] - Name to use in log messages
 * @param {boolean} [options.logGet=true] - Whether to log get operations
 * @param {boolean} [options.logSet=true] - Whether to log set operations
 * @param {Function} [options.logger=console.log] - Custom logger function
 * @returns {Function} A plugin function that applies logging to a proxy
 */
export function createLoggingPlugin(options = {}) {
  const {
    name = 'Object',
    logGet = true,
    logSet = true,
    logger = console.log
  } = options

  return function applyLoggingPlugin(proxy, interceptors) {
    const { defineGetInterceptor, defineSetInterceptor } = interceptors

    // Log get operations
    if (logGet && defineGetInterceptor) {
      defineGetInterceptor((target, prop, _receiver) => {
        const propName = String(prop)
        const value = Reflect.get(target, prop, _receiver)
        logger(`[${name}] GET "${propName}" => ${JSON.stringify(value)}`)
        return undefined // Let other interceptors continue
      })
    }

    // Log set operations
    if (logSet && defineSetInterceptor) {
      defineSetInterceptor((target, prop, value, receiver) => {
        const propName = String(prop)
        logger(`[${name}] SET "${propName}" = ${JSON.stringify(value)}`)
        return true // Allow the operation
      })
    }

    return proxy
  }
}

/**
 * Convenience function to create and apply a logging plugin with defaults
 *
 * @param {string} objectName - Name to use in log messages
 * @returns {Function} The logging plugin function
 */
export function createSimpleLoggingPlugin(objectName = 'Object') {
  return createLoggingPlugin({ name: objectName })
}
