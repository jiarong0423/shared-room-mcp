import fs from 'node:fs/promises';

const allowedTaskTypes = new Set([
  'auto',
  'group_buy',
  'drink_order',
  'restaurant_split',
  'ktv_room',
  'sports_venue',
  'ticket_activity',
  'rental_share',
  'extract_fee_structure',
  'parse_discount_policy',
  'parse_ocr_bill',
  'parse_lodging_rate',
  'parse_course_fee',
  'parse_transport_share',
  'parse_membership_value',
  'generic_split'
]);

const requiredItemFields = new Set([
  'name',
  'price',
  'category',
  'sectionName',
  'sizeLabel',
  'priceRole',
  'sourceNumberClass',
  'currency',
  'quantity',
  'unit',
  'conditions',
  'reviewFlags',
  'rawTextEvidence',
  'confidence',
  'note',
  'tags'
]);

async function readJson(relativePath) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  return JSON.parse(await fs.readFile(url, 'utf8'));
}

function assertCondition(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function assertUniqueIds(items, label, errors) {
  const ids = new Set();
  for (const item of items) {
    const id = String(item?.id || '').trim();
    assertCondition(Boolean(id), `${label} has an empty id`, errors);
    assertCondition(!ids.has(id), `${label} has duplicate id: ${id}`, errors);
    ids.add(id);
  }
}

function validateContracts(contractsConfig, promptLibrary, guardrailRegistry, errors) {
  const contracts = Array.isArray(contractsConfig.contracts) ? contractsConfig.contracts : [];
  const rules = Array.isArray(guardrailRegistry.rules) ? guardrailRegistry.rules : [];
  const ruleIds = new Set(rules.map((rule) => rule?.id).filter(Boolean));
  const nodeIds = new Set(Object.keys(promptLibrary.nodes || {}));
  assertCondition(typeof contractsConfig.version === 'string' && contractsConfig.version.length > 0, 'scenario contracts version is required', errors);
  assertCondition(contracts.length >= 12, 'scenario contracts should cover at least twelve representative lines', errors);
  assertCondition(contractsConfig.routingPolicy?.unknownIndustryDecision === 'generic_sandbox', 'routingPolicy must send unknown industry to generic_sandbox', errors);
  assertUniqueIds(contracts, 'scenario contract', errors);
  assertUniqueIds(rules, 'guardrail rule', errors);
  assertCondition(ruleIds.has('human_final_approval_required'), 'guardrail registry must include human_final_approval_required', errors);

  for (const contract of contracts) {
    const id = String(contract.id || '');
    const taskTypes = Array.isArray(contract.taskTypes) ? contract.taskTypes : [];
    const guardrails = Array.isArray(contract.guardrails) ? contract.guardrails : [];
    const promptNodes = Array.isArray(contract.promptNodes) ? contract.promptNodes : [];
    const outputFields = Array.isArray(contract.outputFields) ? contract.outputFields : [];
    const forbiddenNumberClasses = Array.isArray(contract.forbiddenNumberClasses) ? contract.forbiddenNumberClasses : [];
    const humanReviewTriggers = Array.isArray(contract.humanReviewTriggers) ? contract.humanReviewTriggers : [];
    assertCondition(/^core\.|^ext\.|^sandbox\./.test(String(contract.namespace || '')), `${id} must declare a core/ext/sandbox namespace`, errors);
    assertCondition(['P0', 'P1', 'P2'].includes(contract.priority), `${id} must declare priority P0/P1/P2`, errors);
    assertCondition(taskTypes.length > 0, `${id} must declare at least one taskType`, errors);
    for (const taskType of taskTypes) {
      assertCondition(allowedTaskTypes.has(taskType), `${id} uses unsupported taskType: ${taskType}`, errors);
    }
    assertCondition(guardrails.length > 0, `${id} must declare guardrails`, errors);
    assertCondition(forbiddenNumberClasses.length > 0, `${id} must declare forbiddenNumberClasses`, errors);
    assertCondition(humanReviewTriggers.length > 0, `${id} must declare humanReviewTriggers`, errors);
    for (const guardrail of guardrails) {
      assertCondition(ruleIds.has(guardrail), `${id} references unknown guardrail: ${guardrail}`, errors);
    }
    assertCondition(promptNodes.length > 0, `${id} must declare prompt nodes`, errors);
    for (const nodeId of promptNodes) {
      assertCondition(nodeIds.has(nodeId), `${id} references unknown prompt node: ${nodeId}`, errors);
    }
    for (const requiredField of requiredItemFields) {
      assertCondition(outputFields.includes(requiredField), `${id} outputFields missing ${requiredField}`, errors);
    }
    assertCondition(contract.reviewPolicy?.humanFinalApprovalRequired === true, `${id} must require human final approval`, errors);
    assertCondition(contract.reviewPolicy?.autoFinalizeAllowed === false, `${id} must not allow auto finalize`, errors);
  }
}

function validatePromptLibrary(promptLibrary, errors) {
  const nodes = promptLibrary.nodes && typeof promptLibrary.nodes === 'object' ? promptLibrary.nodes : {};
  assertCondition(typeof promptLibrary.version === 'string' && promptLibrary.version.length > 0, 'prompt library version is required', errors);
  assertCondition(Object.keys(nodes).length > 0, 'prompt library nodes must not be empty', errors);
  for (const [nodeId, lines] of Object.entries(nodes)) {
    assertCondition(Array.isArray(lines) && lines.length > 0, `prompt node ${nodeId} must have lines`, errors);
    const unsafeFinalActionLine = lines.find((line) => {
      const text = String(line || '');
      const mentionsFinalAction = /finalize|payment|book now|submit booking|付款|下單|結算|預約|提交/i.test(text);
      const explicitBoundary = /cannot|must not|do not|never|human|host|不可|不能|不要|不得|由人|人工|發起者/i.test(text);
      return mentionsFinalAction && !explicitBoundary;
    });
    assertCondition(!unsafeFinalActionLine, `prompt node ${nodeId} contains unsafe final-action instruction`, errors);
  }
}

function validateFixtures(fixture, contractsConfig, errors) {
  const scenarios = Array.isArray(fixture.scenarios) ? fixture.scenarios : [];
  const contractsById = new Map((contractsConfig.contracts || []).map((contract) => [contract?.id, contract]));
  const supportedTaskTypes = new Set(
    (contractsConfig.contracts || []).flatMap((contract) => Array.isArray(contract.taskTypes) ? contract.taskTypes : [])
  );
  assertCondition(scenarios.length >= 12, 'fixture matrix should cover at least twelve scenarios', errors);
  assertUniqueIds(scenarios, 'fixture scenario', errors);
  for (const scenario of scenarios) {
    const id = String(scenario.id || '');
    const language = String(scenario.language || '').trim();
    const contractId = String(scenario.contractId || '').trim();
    const contract = contractsById.get(contractId);
    const contractTaskTypes = Array.isArray(contract?.taskTypes) ? contract.taskTypes : [];
    const contractLanguages = Array.isArray(contract?.signals?.language) ? contract.signals.language : [];
    assertCondition(Boolean(language), `${id} must declare language`, errors);
    assertCondition(Boolean(contractId), `${id} must declare contractId`, errors);
    assertCondition(Boolean(contract), `${id} references unknown contractId: ${contractId}`, errors);
    assertCondition(supportedTaskTypes.has(scenario.taskType), `${id} uses taskType without contract coverage: ${scenario.taskType}`, errors);
    assertCondition(contractTaskTypes.includes(scenario.taskType), `${id} taskType ${scenario.taskType} is not allowed by contract ${contractId}`, errors);
    assertCondition(contractLanguages.includes(language) || contractLanguages.includes('unknown'), `${id} language ${language} is not allowed by contract ${contractId}`, errors);
    assertCondition(Array.isArray(scenario.textLines) && scenario.textLines.length > 0, `${id} must include textLines`, errors);
    assertCondition(scenario.expect && typeof scenario.expect === 'object', `${id} must include expect`, errors);
    if (Array.isArray(scenario.expect?.forbiddenPrices)) {
      for (const price of scenario.expect.forbiddenPrices) {
        assertCondition(Number.isInteger(Number(price)), `${id} forbidden price must be integer: ${price}`, errors);
      }
    }
  }
}

function validateEnterpriseSubmitGate(submitGate, errors) {
  const stages = Array.isArray(submitGate.stages) ? submitGate.stages : [];
  const stageById = new Map(stages.map((stage) => [stage?.id, stage]));
  const requiredStageIds = [
    'package_boundary',
    'static_security_gate',
    'semantic_safety_gate',
    'contract_schema',
    'industry_routing',
    'scenario_regression',
    'human_review'
  ];
  assertCondition(typeof submitGate.version === 'string' && submitGate.version.length > 0, 'enterprise submit gate version is required', errors);
  assertCondition(submitGate.defaultDecision === 'deny', 'enterprise submit gate defaultDecision must be deny', errors);
  assertCondition(stages.length >= requiredStageIds.length, 'enterprise submit gate must include all required stages', errors);
  assertUniqueIds(stages, 'enterprise submit gate stage', errors);
  for (const stageId of requiredStageIds) {
    assertCondition(stageById.has(stageId), `enterprise submit gate missing stage: ${stageId}`, errors);
    assertCondition(stageById.get(stageId)?.required === true, `enterprise submit gate stage must be required: ${stageId}`, errors);
    assertCondition(Array.isArray(stageById.get(stageId)?.blocksOn) && stageById.get(stageId).blocksOn.length > 0, `enterprise submit gate stage needs blocksOn: ${stageId}`, errors);
  }

  const staticSecurityOrder = Number(stageById.get('static_security_gate')?.order || 0);
  const semanticSafetyOrder = Number(stageById.get('semantic_safety_gate')?.order || 0);
  const contractOrder = Number(stageById.get('contract_schema')?.order || 0);
  const routingOrder = Number(stageById.get('industry_routing')?.order || 0);
  const regressionOrder = Number(stageById.get('scenario_regression')?.order || 0);
  const humanOrder = Number(stageById.get('human_review')?.order || 0);
  assertCondition(staticSecurityOrder > 0, 'static_security_gate stage must have a positive order', errors);
  assertCondition(staticSecurityOrder < semanticSafetyOrder, 'static_security_gate must run before semantic_safety_gate', errors);
  assertCondition(semanticSafetyOrder < contractOrder, 'semantic_safety_gate must run before contract_schema', errors);
  assertCondition(contractOrder < routingOrder, 'contract_schema must run before industry_routing', errors);
  assertCondition(routingOrder < regressionOrder, 'industry_routing must run before scenario_regression', errors);
  assertCondition(regressionOrder < humanOrder, 'scenario_regression must run before human_review', errors);

  const forbiddenEffects = new Set(Array.isArray(submitGate.forbiddenRuntimeEffectsBeforeApproval)
    ? submitGate.forbiddenRuntimeEffectsBeforeApproval
    : []);
  for (const effect of ['load_unscanned_mcp_server', 'execute_submitted_command', 'promote_to_runtime_registry']) {
    assertCondition(forbiddenEffects.has(effect), `enterprise submit gate must forbid ${effect} before approval`, errors);
  }
  const evidence = Array.isArray(submitGate.requiredEvidence) ? submitGate.requiredEvidence : [];
  assertCondition(evidence.length >= 8, 'enterprise submit gate must require security, contract, regression, human approval, provenance, permission, sandbox, and revocation evidence', errors);
  const governanceFields = submitGate.governanceFields && typeof submitGate.governanceFields === 'object'
    ? submitGate.governanceFields
    : {};
  const requiredGovernanceGroups = [
    'provenanceAndIntegrity',
    'permissionAndCapability',
    'dataAndPrivacyClass',
    'sbomAndDependency',
    'sandboxExecutionSpec',
    'humanFinalActionSpec',
    'lifecycleAndRevocation',
    'reviewSlaAndAuditTrail'
  ];
  for (const group of requiredGovernanceGroups) {
    assertCondition(Array.isArray(governanceFields[group]) && governanceFields[group].length >= 2, `enterprise submit gate governanceFields missing ${group}`, errors);
  }
  const registryTiers = Array.isArray(submitGate.registryTiers) ? submitGate.registryTiers : [];
  const registryTierIds = new Set(registryTiers.map((tier) => tier?.id).filter(Boolean));
  assertCondition(registryTierIds.has('certified'), 'enterprise submit gate must define certified registry tier', errors);
  assertCondition(registryTierIds.has('experimental'), 'enterprise submit gate must define experimental registry tier', errors);
}

async function main() {
  const errors = [];
  const contractsConfig = await readJson('config/scenario-contracts.json');
  const promptLibrary = await readJson('config/adaptive-prompt-library.json');
  const guardrailRegistry = await readJson('config/guardrail-registry.json');
  const submitGate = await readJson('config/enterprise-submit-gate.json');
  const fixture = await readJson('fixtures/adaptive-parser-matrix.json');
  validateContracts(contractsConfig, promptLibrary, guardrailRegistry, errors);
  validatePromptLibrary(promptLibrary, errors);
  validateFixtures(fixture, contractsConfig, errors);
  validateEnterpriseSubmitGate(submitGate, errors);

  if (errors.length > 0) {
    console.error(JSON.stringify({
      ok: false,
      errorCount: errors.length,
      errors
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    contracts: contractsConfig.contracts.length,
    promptNodes: Object.keys(promptLibrary.nodes || {}).length,
    guardrails: guardrailRegistry.rules.length,
    submitGateStages: submitGate.stages.length,
    scenarios: fixture.scenarios.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
