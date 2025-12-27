import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createReplayContext,
  registerReplayInterceptors,
} from '../src/replay/replay-context.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../src/transactions/transaction-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../src/security/capability-acl.js'

console.log('=== Deterministic Replay & Time Travel Example ===\n')

// Example 1: Basic Recording and Replay
console.log('1. Basic Recording and Replay')
console.log('------------------------------')
const user = { name: 'Alice', age: 25, role: 'developer' }
const userProxy = createProxy(user)
const userReplay = createReplayContext(user)

registerReplayInterceptors(userProxy, userReplay)

// Record a sequence of operations
const recording1 = userReplay.record(() => {
  console.log('  Recording operations...')
  userProxy.proxy.name = 'Bob'
  userProxy.proxy.age = 30
  const _role = userProxy.proxy.role
  console.log(`  User is now: ${userProxy.proxy.name}, ${userProxy.proxy.age} years old`)
})

console.log(`  Recording ID: ${recording1}`)
const rec1 = userReplay.getRecording(recording1)
const setOps = rec1.invocations.filter((inv) => inv.trap === 'set')
console.log(`  Recorded ${setOps.length} set operations\n`)

// Replay the recording
console.log('  Replaying operations...')
const replayResult1 = userReplay.replay(recording1)
console.log(`  Replay completed in ${replayResult1.duration}ms`)
console.log(`  Replayed ${replayResult1.replayedInvocations.length} total invocations\n`)

// Example 2: Multiple Recordings and Time Travel
console.log('2. Multiple Recordings - Time Travel')
console.log('-------------------------------------')
const state = { counter: 0, history: [] }
const stateProxy = createProxy(state)
const stateReplay = createReplayContext(state)

registerReplayInterceptors(stateProxy, stateReplay)

// Record multiple points in time
const snapshot1 = stateReplay.record(() => {
  stateProxy.proxy.counter = 10
  console.log(`  Snapshot 1: counter = ${stateProxy.proxy.counter}`)
})

const _snapshot2 = stateReplay.record(() => {
  stateProxy.proxy.counter = 20
  console.log(`  Snapshot 2: counter = ${stateProxy.proxy.counter}`)
})

const snapshot3 = stateReplay.record(() => {
  stateProxy.proxy.counter = 30
  console.log(`  Snapshot 3: counter = ${stateProxy.proxy.counter}`)
})

console.log(`  Current counter: ${state.counter}`)
console.log(`  Total recordings: ${stateReplay.getRecordingIds().length}`)

// Time travel - replay any snapshot
console.log('  Time traveling to snapshot 1...')
stateReplay.replay(snapshot1)
console.log('  Time traveling to snapshot 3...')
stateReplay.replay(snapshot3)
console.log()

// Example 3: Replay with Transactions
console.log('3. Replay with Transactions')
console.log('---------------------------')
const account = { balance: 1000, transactions: [] }
const accountProxy = createProxy(account)
const accountReplay = createReplayContext(account)
const accountTx = createTransactionContext(account)

registerReplayInterceptors(accountProxy, accountReplay)
registerTransactionInterceptors(accountProxy, accountTx)

const transactionRec = accountReplay.record(() => {
  console.log(`  Initial balance: $${accountProxy.proxy.balance}`)

  accountTx.call(() => {
    console.log('  Starting transaction: withdrawing $500')
    accountProxy.proxy.balance = accountProxy.proxy.balance - 500
    console.log(`  New balance: $${accountProxy.proxy.balance}`)
  })

  // Simulate failure - rollback
  console.log('  Transaction failed! Rolling back...')
  accountTx.rollback()
  console.log(`  Balance after rollback: $${account.balance}`)
})

const txRec = accountReplay.getRecording(transactionRec)
const txSetOps = txRec.invocations.filter((inv) => inv.trap === 'set')
console.log(`  Recorded ${txSetOps.length} operations during transaction\n`)

// Example 4: Replay with Access Control
console.log('4. Replay with Access Control')
console.log('------------------------------')
const document = { title: 'Secret', content: 'Classified', author: 'Alice' }
const docProxy = createProxy(document)
const docReplay = createReplayContext(document)
const docCapability = createCapabilityContext(document, {
  canRead: new Set(['title', 'author']), // Can only read title and author, not content
  canWrite: new Set(['author']), // Can only write to author
})

registerReplayInterceptors(docProxy, docCapability)
registerCapabilityInterceptors(docProxy, docCapability)

const aclRec = docReplay.record(() => {
  docCapability.call(() => {
    console.log('  Reading with limited access...')
    try {
      const _title = docProxy.proxy.title
      console.log('  ✓ Successfully read title')
    } catch {
      console.log('  ✗ Failed to read title')
    }

    try {
      const _content = docProxy.proxy.content // Should fail
      console.log('  ✓ Successfully read content')
    } catch {
      console.log('  ✗ Access denied for content (as expected)')
    }

    try {
      docProxy.proxy.author = 'Bob'
      console.log('  ✓ Successfully updated author')
    } catch {
      console.log('  ✗ Failed to update author')
    }
  })
})

const aclRecording = docReplay.getRecording(aclRec)
const getOps = aclRecording.invocations.filter((inv) => inv.trap === 'get')
console.log(`  Recorded ${getOps.length} get operations\n`)

// Example 5: Deterministic Replay
console.log('5. Deterministic Replay')
console.log('-----------------------')
const game = { score: 0, level: 1 }
const gameProxy = createProxy(game)
const gameReplay = createReplayContext(game)

registerReplayInterceptors(gameProxy, gameReplay)

const gameplayRec = gameReplay.record(() => {
  gameProxy.proxy.score = 100
  gameProxy.proxy.level = 2
  gameProxy.proxy.score = 250
})

console.log('  Replaying gameplay 3 times...')
const replay1 = gameReplay.replay(gameplayRec)
const replay2 = gameReplay.replay(gameplayRec)
const replay3 = gameReplay.replay(gameplayRec)

const allEqual =
  replay1.replayedInvocations.length === replay2.replayedInvocations.length &&
  replay2.replayedInvocations.length === replay3.replayedInvocations.length

console.log(`  All replays have same number of operations: ${allEqual}`)
console.log(`  Replay is deterministic: ${allEqual ? '✓' : '✗'}\n`)

// Example 6: Recording Management
console.log('6. Recording Management')
console.log('-----------------------')
const dataProxy = createProxy({ value: 0 })
const dataReplay = createReplayContext({ value: 0 })

registerReplayInterceptors(dataProxy, dataReplay)

// Create multiple recordings
const _recA = dataReplay.record(() => {
  dataProxy.proxy.value = 1
})
const recB = dataReplay.record(() => {
  dataProxy.proxy.value = 2
})
const _recC = dataReplay.record(() => {
  dataProxy.proxy.value = 3
})

console.log(`  Created ${dataReplay.getRecordingIds().length} recordings`)

// Clear specific recording
dataReplay.clearRecording(recB)
console.log(`  After clearing recB: ${dataReplay.getRecordingIds().length} recordings remain`)

// Clear all recordings
dataReplay.clearRecording()
console.log(`  After clearing all: ${dataReplay.getRecordingIds().length} recordings remain\n`)

console.log('=== All examples completed! ===')
