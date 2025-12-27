# Proxyable

<!-- automd:badges color=yellow -->

[![npm version](https://img.shields.io/npm/v/proxyable?color=yellow)](https://npmjs.com/package/proxyable)
[![npm downloads](https://img.shields.io/npm/dm/proxyable?color=yellow)](https://npm.chart.dev/proxyable)

<!-- /automd -->

Dynamic JavaScript proxy creation with isolated context-based interception.

Proxyable simplifies creating JavaScript Proxies by providing a clean, type-safe API for registering multiple interceptors per trap with built-in context isolation using [unctx](https://github.com/unjs/unctx).

## Features

- **Multiple Interceptors** - Register multiple handlers for the same proxy trap
- **All 8 Proxy Traps** - `get`, `set`, `has`, `deleteProperty`, `ownKeys`, `getOwnPropertyDescriptor`, `apply`, `construct`
- **Isolated Contexts** - Automatic context isolation for each proxy instance
- **Type Safe** - Full TypeScript support
- **Specialized APIs** - Convenience methods for common patterns
- **Zero Config** - Works out of the box

## Usage

Install package:

<!-- automd:pm-install -->

```sh
# ✨ Auto-detect
npx nypm install proxyable

# npm
npm install proxyable

# yarn
yarn add proxyable

# pnpm
pnpm install proxyable

# bun
bun install proxyable

# deno
deno install proxyable
```

<!-- /automd -->

Import:

<!-- automd:jsimport cjs cdn name="proxyable" -->

**ESM** (Node.js, Bun, Deno)

```js
import {} from "proxyable";
```

**CommonJS** (Legacy Node.js)

```js
const {} = require("proxyable");
```

**CDN** (Deno, Bun and Browsers)

```js
import {} from "https://esm.sh/proxyable";
```

<!-- /automd -->

## Quick Start

```javascript
import { createProxy } from "proxyable";

const target = { name: "John", age: 30 };
const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(target);

// Add a get interceptor to provide computed properties
defineGetInterceptor((target, prop) => {
  if (prop === "fullName") {
    return `${target.firstName} ${target.lastName}`;
  }
  return target[prop];
});

// Add a set interceptor to validate age
defineSetInterceptor((target, prop, value) => {
  if (prop === "age" && typeof value !== "number") {
    throw new TypeError("Age must be a number");
  }
  target[prop] = value;
  return true;
});

console.log(proxy.name); // "John"
proxy.age = 31; // Valid
```

See the [full documentation](./docs) for more examples and API reference.

## Development

<details>

<summary>local development</summary>

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## License

<!-- automd:contributors license=MIT -->

Published under the [MIT](https://github.com/unjs/proxyable/blob/main/LICENSE) license.
Made by [community](https://github.com/unjs/proxyable/graphs/contributors) 💛
<br><br>
<a href="https://github.com/unjs/proxyable/graphs/contributors">
<img src="https://contrib.rocks/image?repo=unjs/proxyable" />
</a>

<!-- /automd -->

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
