# Simulation & Counterfactual Execution - Quick Start Guide

## Installation

```javascript
import { createProxy } from './src/proxy/create-proxy.js'
import {
  createSimulationContext,
  registerSimulationInterceptors,
} from './src/simulation/simulation-context.js'
```

## Basic Usage

### 1. Setup

```javascript
const target = { balance: 1000, name: 'Alice' }
const { proxy, ...proxyInterface } = createProxy(target)
const sim = createSimulationContext(target)
registerSimulationInterceptors(proxyInterface, sim)
```

### 2. Run Speculative Code

```javascript
sim.speculate(() => {
  proxy.balance -= 100
  proxy.name = 'Bob'
  console.log(proxy.balance)  // 900
})

console.log(target.balance)  // Still 1000 - real target unchanged!
```

### 3. Commit or Abort

```javascript
// Option A: Commit changes
sim.speculate(() => {
  proxy.balance = 500
})
sim.commit()  // Now target.balance is 500

// Option B: Abort changes
sim.speculate(() => {
  proxy.balance = 0
})
sim.abort()  // target.balance still 500
```

## Core API

### `createSimulationContext(target, options)`

Create a simulation context.

**Options:**
```javascript
{
  shallow: false,      // Use shallow copy instead of deep
  nested: true,        // Allow nested simulations
  checkpoint: true,    // Enable checkpoint/restore
  isolation: 'full'    // 'full' or 'partial' isolation
}
```

### `sim.speculate(fn)`

Run a function in speculative mode.

```javascript
const result = sim.speculate(() => {
  proxy.x = 10
  return proxy.x * 2
})
// result = 20, target.x unchanged
```

### `sim.getChangeSet()`

Get what would change if committed.

```javascript
sim.speculate(() => {
  proxy.x = 10
  proxy.y = 20
  delete proxy.z
})

const changes = sim.getChangeSet()
// {
//   added: {},
//   modified: { x: { from: 1, to: 10 }, y: { from: 2, to: 20 } },
//   deleted: { z: 3 }
// }
```

### `sim.getSpeculativeState()`

Get a copy of the speculative state.

```javascript
sim.speculate(() => {
  proxy.balance = 500
  const state = sim.getSpeculativeState()
  console.log(state.balance)  // 500
})
```

### `sim.commit()`

Apply speculative changes to the real target.

```javascript
sim.speculate(() => {
  proxy.balance = 500
})
sim.commit()
console.log(target.balance)  // 500
```

### `sim.abort()`

Discard all speculative changes.

```javascript
sim.speculate(() => {
  proxy.balance = 0
})
sim.abort()
console.log(target.balance)  // Original value
```

## Advanced Features

### Nested Simulations

```javascript
sim.speculate(() => {
  proxy.x = 10

  sim.speculate(() => {
    proxy.x = 20
    console.log(proxy.x)  // 20
  })

  console.log(proxy.x)  // Back to 10
})
```

### Checkpoints

```javascript
sim.speculate(() => {
  proxy.version = 1
  const cp1 = sim.checkpoint()

  proxy.version = 2
  const cp2 = sim.checkpoint()

  proxy.version = 3

  sim.restore(cp1)  // Back to version 1
})
```

### Execution Tree

```javascript
sim.speculate(() => {
  proxy.x = 10

  sim.speculate(() => {
    proxy.x = 20
  })
})

const tree = sim.getExecutionTree()
console.log(tree.nodes.length)  // Number of simulation nodes
```

## Common Patterns

### Pattern 1: What-If Analysis

```javascript
// Try multiple scenarios
const scenarios = [
  () => { proxy.price *= 1.1 },   // +10%
  () => { proxy.price *= 0.9 },   // -10%
  () => { proxy.price *= 1.5 },   // +50%
]

for (const scenario of scenarios) {
  sim.speculate(() => {
    scenario()
    console.log('New price:', proxy.price)
    console.log('Revenue:', calculateRevenue(proxy))
  })
}
```

### Pattern 2: Validation Before Apply

```javascript
sim.speculate(() => {
  proxy.balance -= amount

  if (proxy.balance < 0) {
    sim.abort()
    throw new Error('Insufficient funds')
  }

  sim.commit()  // Only commit if valid
})
```

### Pattern 3: Safe State Exploration

```javascript
function exploreOptions(options) {
  const results = []

  for (const option of options) {
    sim.speculate(() => {
      applyOption(proxy, option)
      results.push({
        option,
        outcome: evaluateState(proxy),
        changeset: sim.getChangeSet(),
      })
    })
  }

  return results  // Real state never changed
}
```

### Pattern 4: Checkpoint-Based Undo

```javascript
sim.speculate(() => {
  const checkpoints = []

  for (const operation of operations) {
    checkpoints.push(sim.checkpoint())
    operation(proxy)
  }

  // Undo last 3 operations
  sim.restore(checkpoints[checkpoints.length - 3])
})
```

## Composition with Other Capabilities

### With ACL (Access Control)

```javascript
const acl = createCapabilityContext(target, {
  canRead: new Set(['balance']),
  canWrite: new Set(['balance']),
})
registerCapabilityInterceptors(proxyInterface, acl)
registerSimulationInterceptors(proxyInterface, sim)

acl.call(() => {
  sim.speculate(() => {
    proxy.balance = 500  // OK - has permission
    proxy.secret = 'x'   // Throws - no permission
  })
})
```

### With Invariants

```javascript
const inv = createInvariantContext(target, {
  positiveBalance: (target, op) => {
    if (op.property === 'balance' && op.value < 0) {
      return 'Balance cannot be negative'
    }
    return true
  },
})
registerInvariantInterceptors(proxyInterface, inv)
registerSimulationInterceptors(proxyInterface, sim)

inv.call(() => {
  sim.speculate(() => {
    proxy.balance = -100  // Throws invariant violation
  })
})
```

### With Transactions

```javascript
const tx = createTransactionContext(target)
registerTransactionInterceptors(proxyInterface, tx)
registerSimulationInterceptors(proxyInterface, sim)

// Simulate a transaction
sim.speculate(() => {
  tx.call(() => {
    proxy.balance -= 100
    proxy.transactions.push({ amount: -100 })
  })

  // Can see transaction journal in speculative state
  console.log(tx.getJournal())
})
```

## Best Practices

### ✅ Do

- Use `speculate()` to run what-if scenarios
- Call `commit()` or `abort()` explicitly to manage changes
- Use changesets to preview changes before committing
- Use checkpoints for complex multi-step operations
- Combine with invariants to validate speculative changes

### ❌ Don't

- Don't assume changes are applied without calling `commit()`
- Don't modify the target directly while simulation is active
- Don't forget to handle errors during speculation
- Don't rely on side effects in speculative code (they still happen!)
- Don't use shallow copy for deeply nested objects unless you understand the implications

## Error Handling

```javascript
try {
  sim.speculate(() => {
    if (someCondition) {
      throw new Error('Invalid operation')
    }
    proxy.x = 10
  })
} catch (error) {
  console.error('Speculation failed:', error)
  // Target is unchanged
}
```

## Performance Tips

1. **Use shallow copy** for large flat objects:
   ```javascript
   const sim = createSimulationContext(target, { shallow: true })
   ```

2. **Disable features you don't need**:
   ```javascript
   const sim = createSimulationContext(target, {
     nested: false,      // If you don't need nesting
     checkpoint: false,  // If you don't need checkpoints
   })
   ```

3. **Clean up after each use**:
   ```javascript
   sim.speculate(() => { /* ... */ })
   sim.abort()  // Or commit() - explicitly clean up
   ```

## Complete Example

```javascript
import { createProxy } from './src/proxy/create-proxy.js'
import {
  createSimulationContext,
  registerSimulationInterceptors,
} from './src/simulation/simulation-context.js'

// Setup
const gameState = {
  player: { x: 0, y: 0, health: 100 },
  enemies: [{ x: 5, y: 5, health: 50 }],
  turn: 1,
}

const { proxy, ...proxyInterface } = createProxy(gameState)
const sim = createSimulationContext(gameState)
registerSimulationInterceptors(proxyInterface, sim)

// Evaluate move options
const moves = ['north', 'south', 'east', 'west']
const evaluations = []

for (const move of moves) {
  sim.speculate(() => {
    // Apply move
    switch (move) {
      case 'north': { proxy.player.y += 1; break }
      case 'south': { proxy.player.y -= 1; break }
      case 'east': { proxy.player.x += 1; break }
      case 'west': { proxy.player.x -= 1; break }
    }

    // Evaluate outcome
    const distance = Math.hypot(
      proxy.player.x - proxy.enemies[0].x,
      proxy.player.y - proxy.enemies[0].y
    )

    evaluations.push({
      move,
      distance,
      position: { ...proxy.player },
    })
  })
}

// Choose best move
const best = evaluations.sort((a, b) => b.distance - a.distance)[0]
console.log('Best move:', best.move)

// Apply the best move
sim.speculate(() => {
  switch (best.move) {
    case 'north': { proxy.player.y += 1; break }
    case 'south': { proxy.player.y -= 1; break }
    case 'east': { proxy.player.x += 1; break }
    case 'west': { proxy.player.x -= 1; break }
  }
})

sim.commit()  // Apply to real game state
console.log('New position:', gameState.player)
```

## Further Reading

- See `/examples/simulation-example.js` for more detailed examples
- See `/test/simulation/simulation-context.test.js` for comprehensive test cases
- See `SIMULATION-IMPLEMENTATION-SUMMARY.md` for technical details
