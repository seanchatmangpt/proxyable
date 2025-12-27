import { createContext } from '../context/context.js'
import { runInterceptors, runBooleanInterceptors } from './traps.js'

/**
 * Creates a Proxy with dynamic interception using an isolated context.
 * @param {object} target - The target object to be proxied.
 * @returns {object} Contains the proxy and a method to add interceptors.
 */
export function createProxy(target = {}) {
  const proxyContext = createContext();

  // Initialize an isolated context for this Proxy
  proxyContext.set(
    {
      getInterceptors: [],
      setInterceptors: [],
      hasInterceptors: [],
      deletePropertyInterceptors: [], // Correctly named
      ownKeysInterceptors: [],
      getOwnPropertyDescriptorInterceptors: [],
      applyInterceptors: [],
      constructInterceptors: [],
    },
    true
  );

  // Create the proxy with all traps supported
  const proxy = new Proxy(target, {
    get(target, prop, receiver) {
      const interceptors = proxyContext.use().getInterceptors;
      return runInterceptors(interceptors, Reflect.get, target, prop, receiver);
    },

    set(target, prop, value, receiver) {
      const interceptors = proxyContext.use().setInterceptors;
      return runBooleanInterceptors(interceptors, Reflect.set, target, prop, value, receiver);
    },

    has(target, prop) {
      const interceptors = proxyContext.use().hasInterceptors;
      return runBooleanInterceptors(interceptors, Reflect.has, target, prop);
    },

    deleteProperty(target, prop) {
      const interceptors = proxyContext.use().deletePropertyInterceptors; // Matches naming
      return runBooleanInterceptors(interceptors, Reflect.deleteProperty, target, prop);
    },

    ownKeys(target) {
      const interceptors = proxyContext.use().ownKeysInterceptors;
      return runInterceptors(interceptors, Reflect.ownKeys, target);
    },

    getOwnPropertyDescriptor(target, prop) {
      const interceptors = proxyContext.use().getOwnPropertyDescriptorInterceptors;
      return runInterceptors(interceptors, Reflect.getOwnPropertyDescriptor, target, prop);
    },

    apply(target, thisArg, argsList) {
      const interceptors = proxyContext.use().applyInterceptors;
      return runInterceptors(interceptors, Reflect.apply, target, thisArg, argsList);
    },

    construct(target, argsList, newTarget) {
      const interceptors = proxyContext.use().constructInterceptors;
      return runInterceptors(interceptors, Reflect.construct, target, argsList, newTarget);
    },
  });

  const addInterceptor = (trap, interceptor) => {
    const validTraps = [
      'get',
      'set',
      'has',
      'deleteProperty', // Full name
      'ownKeys',
      'getOwnPropertyDescriptor',
      'apply',
      'construct',
    ];

    if (!validTraps.includes(trap)) {
      throw new TypeError(`Invalid trap name: "${trap}".`);
    }

    const context = proxyContext.tryUse();
    if (!context) {
      throw new Error(`Cannot add interceptor for "${trap}" without an active context.`);
    }

    const interceptorList = `${trap}Interceptors`;
    if (!Array.isArray(context[interceptorList])) {
      throw new TypeError(`Trap "${trap}" is not initialized in the context.`);
    }

    context[interceptorList].push(interceptor);
  };

  // Define specialized methods
  const defineGetInterceptor = (interceptor) => addInterceptor('get', interceptor);
  const defineSetInterceptor = (interceptor) => addInterceptor('set', interceptor);
  const defineHasInterceptor = (interceptor) => addInterceptor('has', interceptor);
  const defineDeletePropertyInterceptor = (interceptor) => addInterceptor('deleteProperty', interceptor); // Correctly named
  const defineOwnKeysInterceptor = (interceptor) => addInterceptor('ownKeys', interceptor);
  const defineGetOwnPropertyDescriptorInterceptor = (interceptor) =>
    addInterceptor('getOwnPropertyDescriptor', interceptor);
  const defineApplyInterceptor = (interceptor) => addInterceptor('apply', interceptor);
  const defineConstructInterceptor = (interceptor) => addInterceptor('construct', interceptor);

  return {
    proxy,
    addInterceptor,
    defineGetInterceptor,
    defineSetInterceptor,
    defineHasInterceptor,
    defineDeletePropertyInterceptor, // Full name method
    defineOwnKeysInterceptor,
    defineGetOwnPropertyDescriptorInterceptor,
    defineApplyInterceptor,
    defineConstructInterceptor,
  };
}
