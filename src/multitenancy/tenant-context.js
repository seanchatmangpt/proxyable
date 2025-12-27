/**
 * Multi-Tenant Behavioral Views
 *
 * Allows multiple tenants to have different views of the same proxy:
 * - Filtered keys (visibility control)
 * - Virtual properties (synthetic properties per tenant)
 * - Transformed values (get/set transformations)
 * - Tenant metadata and context
 *
 * No cloning, no branching - pure behavioral views.
 */

// Store active tenant contexts (WeakMap for memory safety)
const activeTenantContexts = new WeakMap();

// Store tenant configurations
const tenantConfigs = new Map();

// Symbol for accessing raw target
const RAW_TARGET = Symbol('rawTarget');
const TENANT_ID = Symbol('tenantId');

/**
 * Create a tenant context for a target object
 *
 * @param {any} target - The underlying object/proxy
 * @param {string} tenantId - Unique identifier for this tenant
 * @param {Object} tenantConfig - Tenant configuration
 * @param {Set|Function} tenantConfig.visibleKeys - Keys visible to this tenant
 * @param {Object} tenantConfig.virtualProperties - Virtual properties for this tenant
 * @param {Function} tenantConfig.transformGet - Transform values on get
 * @param {Function} tenantConfig.transformSet - Transform values on set
 * @param {Object} tenantConfig.metadata - Tenant metadata (name, org, etc.)
 * @returns {Object} Tenant context API
 */
export function createTenantContext(target, tenantId, tenantConfig = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  // Normalize config
  const config = {
    visibleKeys: tenantConfig.visibleKeys,
    virtualProperties: tenantConfig.virtualProperties || {},
    transformGet: tenantConfig.transformGet,
    transformSet: tenantConfig.transformSet,
    metadata: tenantConfig.metadata || {}
  };

  // Store config
  tenantConfigs.set(tenantId, config);

  // Check if key is visible to this tenant
  const isKeyVisible = (key) => {
    if (typeof key === 'symbol') return true; // Symbols always visible
    if (!config.visibleKeys) return true; // No filter = all visible

    if (typeof config.visibleKeys === 'function') {
      return config.visibleKeys(key);
    }

    if (config.visibleKeys instanceof Set) {
      return config.visibleKeys.has(key);
    }

    return true;
  };

  // Check if key is a virtual property
  const isVirtualProperty = (key) => {
    return key in config.virtualProperties;
  };

  // Get virtual property value
  const getVirtualValue = (key, receiver) => {
    const virtual = config.virtualProperties[key];
    return typeof virtual === 'function' ? virtual.call(receiver) : virtual;
  };

  // Create the tenant proxy
  const tenantProxy = new Proxy(target, {
    get(target, key, receiver) {
      // Special symbols for internal access
      if (key === RAW_TARGET) return target;
      if (key === TENANT_ID) return tenantId;

      // Check virtual properties first
      if (isVirtualProperty(key)) {
        return getVirtualValue(key, receiver);
      }

      // Check visibility
      if (!isKeyVisible(key)) {
        return undefined;
      }

      // Get the value
      const value = Reflect.get(target, key, receiver);

      // Apply transform if configured
      if (config.transformGet) {
        return config.transformGet(key, value, receiver);
      }

      return value;
    },

    set(target, key, value, receiver) {
      // Can't set virtual properties
      if (isVirtualProperty(key)) {
        throw new Error(`Cannot set virtual property: ${String(key)}`);
      }

      // Check visibility
      if (!isKeyVisible(key)) {
        throw new Error(`Property not visible to tenant: ${String(key)}`);
      }

      // Apply transform if configured
      let actualValue = value;
      if (config.transformSet) {
        actualValue = config.transformSet(key, value, receiver);
      }

      return Reflect.set(target, key, actualValue, receiver);
    },

    has(target, key) {
      // Virtual properties
      if (isVirtualProperty(key)) {
        return true;
      }

      // Check visibility
      if (!isKeyVisible(key)) {
        return false;
      }

      return Reflect.has(target, key);
    },

    ownKeys(target) {
      const keys = Reflect.ownKeys(target);
      const virtualKeys = Object.keys(config.virtualProperties);

      // Filter visible keys and add virtual keys
      const visibleKeys = keys.filter(isKeyVisible);
      return [...new Set([...visibleKeys, ...virtualKeys])];
    },

    getOwnPropertyDescriptor(target, key) {
      // Virtual properties
      if (isVirtualProperty(key)) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: getVirtualValue(key, tenantProxy)
        };
      }

      // Check visibility
      if (!isKeyVisible(key)) {
        return undefined;
      }

      return Reflect.getOwnPropertyDescriptor(target, key);
    },

    deleteProperty(target, key) {
      // Can't delete virtual properties
      if (isVirtualProperty(key)) {
        throw new Error(`Cannot delete virtual property: ${String(key)}`);
      }

      // Check visibility
      if (!isKeyVisible(key)) {
        throw new Error(`Property not visible to tenant: ${String(key)}`);
      }

      return Reflect.deleteProperty(target, key);
    },

    // Tenant-aware function calls
    apply(target, thisArg, argumentsList) {
      // Store current tenant context
      const previousContext = activeTenantContexts.get(thisArg);
      activeTenantContexts.set(thisArg, { tenantId, config });

      try {
        return Reflect.apply(target, thisArg, argumentsList);
      } finally {
        // Restore previous context
        if (previousContext) {
          activeTenantContexts.set(thisArg, previousContext);
        } else {
          activeTenantContexts.delete(thisArg);
        }
      }
    },

    // Tenant-aware construction
    construct(target, argumentsList, newTarget) {
      // Create instance with tenant context
      const instance = Reflect.construct(target, argumentsList, newTarget);
      activeTenantContexts.set(instance, { tenantId, config });
      return instance;
    }
  });

  // Tenant API
  const tenantAPI = {
    /**
     * Execute a function within this tenant's context
     * @param {Function} fn - Function to execute
     * @returns {any} Result of function
     */
    call(fn) {
      if (typeof fn !== 'function') {
        throw new Error('Argument must be a function');
      }

      // Store current context
      const previousContext = activeTenantContexts.get(tenantProxy);
      activeTenantContexts.set(tenantProxy, { tenantId, config });

      try {
        return fn(tenantProxy);
      } finally {
        // Restore previous context
        if (previousContext) {
          activeTenantContexts.set(tenantProxy, previousContext);
        } else {
          activeTenantContexts.delete(tenantProxy);
        }
      }
    },

    /**
     * Get the tenant ID
     * @returns {string} Tenant ID
     */
    getTenantId() {
      return tenantId;
    },

    /**
     * Get tenant metadata
     * @returns {Object} Tenant metadata
     */
    getMetadata() {
      return { ...config.metadata };
    },

    /**
     * Get tenant configuration
     * @returns {Object} Tenant configuration
     */
    getConfig() {
      return {
        visibleKeys: config.visibleKeys,
        virtualProperties: { ...config.virtualProperties },
        transformGet: config.transformGet,
        transformSet: config.transformSet,
        metadata: { ...config.metadata }
      };
    },

    /**
     * Update tenant configuration
     * @param {Object} newConfig - New configuration (partial update)
     */
    updateConfig(newConfig) {
      if (newConfig.visibleKeys !== undefined) {
        config.visibleKeys = newConfig.visibleKeys;
      }
      if (newConfig.virtualProperties !== undefined) {
        config.virtualProperties = { ...config.virtualProperties, ...newConfig.virtualProperties };
      }
      if (newConfig.transformGet !== undefined) {
        config.transformGet = newConfig.transformGet;
      }
      if (newConfig.transformSet !== undefined) {
        config.transformSet = newConfig.transformSet;
      }
      if (newConfig.metadata !== undefined) {
        config.metadata = { ...config.metadata, ...newConfig.metadata };
      }

      // Update stored config
      tenantConfigs.set(tenantId, config);
    },

    /**
     * Get the tenant proxy
     */
    get proxy() {
      return tenantProxy;
    }
  };

  return tenantAPI;
}

/**
 * Get the active tenant context for an object
 * @param {any} obj - Object to check
 * @returns {Object|undefined} Tenant context or undefined
 */
export function getActiveTenantContext(obj) {
  return activeTenantContexts.get(obj);
}

/**
 * Get tenant ID from a proxied object
 * @param {any} proxy - Tenant proxy
 * @returns {string|undefined} Tenant ID or undefined
 */
export function getTenantId(proxy) {
  try {
    return proxy[TENANT_ID];
  } catch {
    return undefined;
  }
}

/**
 * Get raw target from a tenant proxy
 * @param {any} proxy - Tenant proxy
 * @returns {any} Raw target
 */
export function getRawTarget(proxy) {
  try {
    return proxy[RAW_TARGET] || proxy;
  } catch {
    return proxy;
  }
}

/**
 * Create multiple tenant contexts for the same target
 * @param {any} target - The underlying object
 * @param {Object} tenantsConfig - Map of tenantId -> config
 * @returns {Map} Map of tenantId -> tenant API
 */
export function createMultipleTenants(target, tenantsConfig) {
  const tenants = new Map();

  for (const [tenantId, config] of Object.entries(tenantsConfig)) {
    tenants.set(tenantId, createTenantContext(target, tenantId, config));
  }

  return tenants;
}
