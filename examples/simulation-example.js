/**
 * Simulation & Counterfactual Execution Example
 *
 * This example demonstrates the simulation capability which allows
 * speculative execution of code paths without mutating the real target.
 *
 * Key Features:
 * - Speculative execution - run "what-if" scenarios
 * - Isolation - real target never modified during speculation
 * - Commit/Abort - apply or discard changes
 * - Changesets - see what would change
 * - Nested simulations - simulations within simulations
 * - Checkpoints - save and restore speculative state
 * - Execution tree - track all speculation branches
 */

import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createSimulationContext,
  registerSimulationInterceptors,
} from '../src/simulation/simulation-context.js'
import {
  createInvariantContext,
  registerInvariantInterceptors,
  rangeInvariant,
} from '../src/invariants/invariant-context.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../src/transactions/transaction-context.js'

console.log('='.repeat(70))
console.log('SIMULATION & COUNTERFACTUAL EXECUTION EXAMPLES')
console.log('='.repeat(70))

// ============================================================================
// Example 1: Basic Speculative Execution
// ============================================================================
console.log('\n1. BASIC SPECULATIVE EXECUTION')
console.log('-'.repeat(70))

const account = { balance: 1000, transactions: [] }
const { proxy: accountProxy, ...accountInterface } = createProxy(account)
const accountSim = createSimulationContext(account)
registerSimulationInterceptors(accountInterface, accountSim)

console.log('Initial balance:', account.balance)

// Run a what-if scenario
accountSim.speculate(() => {
  accountProxy.balance -= 500
  accountProxy.transactions.push({ type: 'withdrawal', amount: 500 })

  console.log('Inside speculation - balance:', accountProxy.balance)
  console.log('Inside speculation - transactions:', accountProxy.transactions.length)
})

// Real target is unchanged!
console.log('After speculation - real balance:', account.balance)
console.log('After speculation - real transactions:', account.transactions.length)

// ============================================================================
// Example 2: Commit and Abort
// ============================================================================
console.log('\n2. COMMIT AND ABORT')
console.log('-'.repeat(70))

const inventory = { apple: 10, banana: 20, orange: 15 }
const { proxy: inventoryProxy, ...inventoryInterface } = createProxy(inventory)
const inventorySim = createSimulationContext(inventory)
registerSimulationInterceptors(inventoryInterface, inventorySim)

console.log('Initial inventory:', inventory)

// Scenario 1: Test a purchase and commit
inventorySim.speculate(() => {
  inventoryProxy.apple -= 5
  inventoryProxy.banana -= 3
})

const changeset1 = inventorySim.getChangeSet()
console.log('\nChangeset before commit:', changeset1)

inventorySim.commit()
console.log('After commit:', inventory)

// Scenario 2: Test a purchase and abort
inventorySim.speculate(() => {
  inventoryProxy.apple -= 20 // Would go negative!
  inventoryProxy.banana -= 15
})

console.log('\nSpeculative state:', inventorySim.getSpeculativeState())

inventorySim.abort()
console.log('After abort (unchanged):', inventory)

// ============================================================================
// Example 3: Changesets - What Would Change
// ============================================================================
console.log('\n3. CHANGESETS - WHAT WOULD CHANGE')
console.log('-'.repeat(70))

const user = { name: 'Alice', age: 30, email: 'alice@example.com' }
const { proxy: userProxy, ...userInterface } = createProxy(user)
const userSim = createSimulationContext(user)
registerSimulationInterceptors(userInterface, userSim)

userSim.speculate(() => {
  userProxy.age = 31 // Modified
  userProxy.city = 'New York' // Added
  delete userProxy.email // Deleted
})

const changeset = userSim.getChangeSet()
console.log('\nChangeset:')
console.log('  Added:', changeset.added)
console.log('  Modified:', changeset.modified)
console.log('  Deleted:', changeset.deleted)

console.log('\nReal object unchanged:', user)
userSim.abort()

// ============================================================================
// Example 4: Nested Simulations
// ============================================================================
console.log('\n4. NESTED SIMULATIONS')
console.log('-'.repeat(70))

const game = { score: 100, lives: 3, level: 1 }
const { proxy: gameProxy, ...gameInterface } = createProxy(game)
const gameSim = createSimulationContext(game, { nested: true })
registerSimulationInterceptors(gameInterface, gameSim)

console.log('Initial game state:', game)

gameSim.speculate(() => {
  gameProxy.score += 50
  gameProxy.level = 2
  console.log('\nOuter speculation - score:', gameProxy.score, 'level:', gameProxy.level)

  // Nested speculation within speculation
  gameSim.speculate(() => {
    gameProxy.score += 100
    gameProxy.lives -= 1
    console.log('  Inner speculation - score:', gameProxy.score, 'lives:', gameProxy.lives)
  })

  // After inner speculation, outer continues
  console.log('Back to outer speculation - score:', gameProxy.score)
})

// Real game state unchanged
console.log('\nReal game state (unchanged):', game)

// ============================================================================
// Example 5: Checkpoints and Restore
// ============================================================================
console.log('\n5. CHECKPOINTS AND RESTORE')
console.log('-'.repeat(70))

const document = { title: '', content: '', version: 1 }
const { proxy: docProxy, ...docInterface } = createProxy(document)
const docSim = createSimulationContext(document, { checkpoint: true })
registerSimulationInterceptors(docInterface, docSim)

docSim.speculate(() => {
  docProxy.title = 'My Document'
  docProxy.version = 2

  const checkpoint1 = docSim.checkpoint()
  console.log('Created checkpoint 1:', checkpoint1.slice(0, 8) + '...')
  console.log('State at checkpoint 1:', docSim.getSpeculativeState())

  docProxy.content = 'Some content'
  docProxy.version = 3

  const checkpoint2 = docSim.checkpoint()
  console.log('\nCreated checkpoint 2:', checkpoint2.slice(0, 8) + '...')
  console.log('State at checkpoint 2:', docSim.getSpeculativeState())

  docProxy.content = 'More content'
  docProxy.version = 4
  console.log('\nCurrent state:', docSim.getSpeculativeState())

  // Restore to checkpoint 1
  docSim.restore(checkpoint1)
  console.log('\nRestored to checkpoint 1:', docSim.getSpeculativeState())
})

console.log('\nReal document (unchanged):', document)

// ============================================================================
// Example 6: Execution Tree
// ============================================================================
console.log('\n6. EXECUTION TREE')
console.log('-'.repeat(70))

const data = { value: 0 }
const { proxy: dataProxy, ...dataInterface } = createProxy(data)
const dataSim = createSimulationContext(data, { nested: true })
registerSimulationInterceptors(dataInterface, dataSim)

dataSim.speculate(() => {
  dataProxy.value = 10

  dataSim.speculate(() => {
    dataProxy.value = 20
  })

  dataSim.speculate(() => {
    dataProxy.value = 30
  })
})

const tree = dataSim.getExecutionTree()
console.log('\nExecution tree:')
console.log('  Root ID:', tree.rootId)
console.log('  Total nodes:', tree.nodes.length)
console.log('  Node depths:', tree.nodes.map(n => `Depth ${n.depth}`))

dataSim.commit()

// ============================================================================
// Example 7: Composition with Invariants
// ============================================================================
console.log('\n7. COMPOSITION WITH INVARIANTS')
console.log('-'.repeat(70))

const player = { health: 100, mana: 50 }
const { proxy: playerProxy, ...playerInterface } = createProxy(player)

// Setup invariants first
const playerInv = createInvariantContext(player, {
  healthRange: rangeInvariant('health', 0, 100),
  manaRange: rangeInvariant('mana', 0, 100),
})
registerInvariantInterceptors(playerInterface, playerInv)

// Setup simulation after invariants
const playerSim = createSimulationContext(player)
registerSimulationInterceptors(playerInterface, playerSim)

console.log('Initial player:', player)

playerInv.call(() => {
  try {
    playerSim.speculate(() => {
      playerProxy.health = 150 // Would violate invariant!
    })
  } catch (error) {
    console.log('\nCaught invariant violation:', error.message)
  }

  // Valid change
  playerSim.speculate(() => {
    playerProxy.health = 80
    playerProxy.mana = 30
  })

  console.log('Speculative state (valid):', playerSim.getSpeculativeState())
  console.log('Real player (unchanged):', player)
})

// ============================================================================
// Example 8: Composition with Transactions
// ============================================================================
console.log('\n8. COMPOSITION WITH TRANSACTIONS')
console.log('-'.repeat(70))

const bankAccount = { balance: 1000, pendingTransfers: [] }
const { proxy: bankProxy, ...bankInterface } = createProxy(bankAccount)

const bankTx = createTransactionContext(bankAccount)
registerTransactionInterceptors(bankInterface, bankTx)

const bankSim = createSimulationContext(bankAccount)
registerSimulationInterceptors(bankInterface, bankSim)

console.log('Initial account:', bankAccount)

// Simulate a transaction
bankSim.speculate(() => {
  bankTx.call(() => {
    bankProxy.balance -= 200
    bankProxy.pendingTransfers.push({ amount: 200, to: 'Bob' })
  })

  // Transaction is journaled in speculative state
  console.log('\nInside simulation:')
  console.log('  Speculative balance:', bankProxy.balance)
  console.log('  Transaction journal:', bankTx.getJournal().length, 'entries')
})

console.log('\nReal account (unchanged):', bankAccount)

// ============================================================================
// Example 9: Complex Simulation - Game Turn Prediction
// ============================================================================
console.log('\n9. COMPLEX SIMULATION - GAME TURN PREDICTION')
console.log('-'.repeat(70))

const gameState = {
  player: { x: 0, y: 0, health: 100 },
  enemies: [
    { x: 5, y: 5, health: 50 },
    { x: -3, y: 2, health: 30 },
  ],
  turn: 1,
}

const { proxy: gameStateProxy, ...gameStateInterface } = createProxy(gameState)
const gameStateSim = createSimulationContext(gameState, { nested: true })
registerSimulationInterceptors(gameStateInterface, gameStateSim)

console.log('Current game state:', JSON.stringify(gameState, undefined, 2))

// Simulate different move options
const moveOptions = [
  { name: 'Move North', dx: 0, dy: 1 },
  { name: 'Move East', dx: 1, dy: 0 },
  { name: 'Attack Nearby', dx: 0, dy: 0, attack: true },
]

console.log('\nEvaluating move options:')

for (const move of moveOptions) {
  gameStateSim.speculate(() => {
    gameStateProxy.player.x += move.dx
    gameStateProxy.player.y += move.dy
    gameStateProxy.turn += 1

    if (move.attack) {
      // Find nearest enemy
      const nearest = gameStateProxy.enemies[0]
      nearest.health -= 25
      gameStateProxy.player.health -= 10 // Counter-attack
    }

    const result = gameStateSim.getSpeculativeState()
    console.log(`\n  ${move.name}:`)
    console.log(`    Player position: (${result.player.x}, ${result.player.y})`)
    console.log(`    Player health: ${result.player.health}`)
    console.log(`    Turn: ${result.turn}`)
  })
}

console.log('\nReal game state (unchanged):', JSON.stringify(gameState, undefined, 2))

// ============================================================================
// Example 10: Multiple Speculations in Sequence
// ============================================================================
console.log('\n10. MULTIPLE SPECULATIONS IN SEQUENCE')
console.log('-'.repeat(70))

const counter = { value: 0 }
const { proxy: counterProxy, ...counterInterface } = createProxy(counter)
const counterSim = createSimulationContext(counter)
registerSimulationInterceptors(counterInterface, counterSim)

console.log('Initial counter:', counter.value)

// Each speculation is independent
for (let index = 1; index <= 3; index++) {
  counterSim.speculate(() => {
    counterProxy.value = index * 10
  })

  console.log(`\nAfter speculation ${index}:`)
  console.log('  Speculative value:', counterSim.getSpeculativeState().value)
  console.log('  Real value:', counter.value) // Always 0
}

console.log('\nReal counter (still 0):', counter.value)

// Commit the last speculation
counterSim.commit()
console.log('After commit:', counter.value)

console.log('\n' + '='.repeat(70))
console.log('SIMULATION EXAMPLES COMPLETE')
console.log('='.repeat(70))
