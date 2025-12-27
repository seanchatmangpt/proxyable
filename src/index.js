import { createProxy } from './proxy/create-proxy.js'
import { useContext, setContext } from './context/context.js'

// Invariant enforcement system
export {
  createInvariantContext,
  createInvariantSetInterceptor,
  createInvariantDeletePropertyInterceptor,
  createInvariantApplyInterceptor,
  createInvariantConstructInterceptor,
  registerInvariantInterceptors,
  typeInvariant,
  rangeInvariant,
  immutableInvariant,
  dependencyInvariant,
  uniquenessInvariant,
  requiredInvariant,
  patternInvariant,
} from './invariants/invariant-context.js'

// Observability & Audit system
export {
  createAuditContext,
  createAuditGetInterceptor,
  createAuditSetInterceptor,
  createAuditDeletePropertyInterceptor,
  createAuditHasInterceptor,
  createAuditOwnKeysInterceptor,
  createAuditGetOwnPropertyDescriptorInterceptor,
  createAuditApplyInterceptor,
  createAuditConstructInterceptor,
  registerAuditInterceptors,
  createEnforcementAuditInterceptors,
} from './observability/audit-logger.js'

// Protocol & Call-Level Contracts
export {
  createContractContext,
  createContractApplyInterceptor,
  createContractConstructInterceptor,
  registerContractInterceptors,
} from './contracts/contract-context.js'

// Simulation & Counterfactual Execution
export {
  createSimulationContext,
  createSimulationSetInterceptor,
  createSimulationDeletePropertyInterceptor,
  createSimulationGetInterceptor,
  createSimulationHasInterceptor,
  createSimulationOwnKeysInterceptor,
  createSimulationApplyInterceptor,
  createSimulationConstructInterceptor,
  registerSimulationInterceptors,
} from './simulation/simulation-context.js'

export { createProxy, useContext, setContext }