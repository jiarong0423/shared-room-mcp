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
  'boundingZone',
  'detectedTypeHint',
  'auditAnchor',
  'auditAnchors',
  'reviewGates',
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
  const contractNodeMap = promptLibrary.contractNodeMap && typeof promptLibrary.contractNodeMap === 'object'
    ? promptLibrary.contractNodeMap
    : {};
  assertCondition(typeof promptLibrary.version === 'string' && promptLibrary.version.length > 0, 'prompt library version is required', errors);
  assertCondition(Object.keys(nodes).length > 0, 'prompt library nodes must not be empty', errors);
  for (const [nodeId, lines] of Object.entries(nodes)) {
    assertCondition(Array.isArray(lines) && lines.length > 0, `prompt node ${nodeId} must have lines`, errors);
    const unsafeFinalActionLine = lines.find((line) => {
      const text = String(line || '');
      const mentionsFinalAction = /finalize|payment|book now|submit booking|付款|下單|結算|送出預約|提交預約|送出表單|提交表單/i.test(text);
      const reviewGateLanguage = /human|host|review|proposal|draft|人工|發起者|審核|草稿|建議|狀態摘要|風險提示/i.test(text);
      return mentionsFinalAction && !reviewGateLanguage;
    });
    assertCondition(!unsafeFinalActionLine, `prompt node ${nodeId} contains unsafe final-action instruction`, errors);
  }
  for (const [contractId, nodeIds] of Object.entries(contractNodeMap)) {
    assertCondition(Array.isArray(nodeIds) && nodeIds.length > 0, `contractNodeMap ${contractId} must list prompt nodes`, errors);
    for (const nodeId of nodeIds) {
      assertCondition(Boolean(nodes[nodeId]), `contractNodeMap ${contractId} references unknown prompt node: ${nodeId}`, errors);
    }
  }
}

function validateFixtures(fixture, contractsConfig, serviceBlueprint, errors) {
  const scenarios = Array.isArray(fixture.scenarios) ? fixture.scenarios : [];
  const contractsById = new Map((contractsConfig.contracts || []).map((contract) => [contract?.id, contract]));
  const archetypesById = new Map((serviceBlueprint.archetypes || []).map((archetype) => [archetype?.id, archetype]));
  const supportedTaskTypes = new Set(
    (contractsConfig.contracts || []).flatMap((contract) => Array.isArray(contract.taskTypes) ? contract.taskTypes : [])
  );
  assertCondition(scenarios.length >= 12, 'fixture matrix should cover at least twelve scenarios', errors);
  assertUniqueIds(scenarios, 'fixture scenario', errors);
  for (const scenario of scenarios) {
    const id = String(scenario.id || '');
    const language = String(scenario.language || '').trim();
    const contractId = String(scenario.contractId || '').trim();
    const archetypeId = String(scenario.archetypeId || '').trim();
    const contract = contractsById.get(contractId);
    const archetype = archetypesById.get(archetypeId);
    const contractTaskTypes = Array.isArray(contract?.taskTypes) ? contract.taskTypes : [];
    const contractLanguages = Array.isArray(contract?.signals?.language) ? contract.signals.language : [];
    assertCondition(Boolean(language), `${id} must declare language`, errors);
    assertCondition(Boolean(contractId), `${id} must declare contractId`, errors);
    assertCondition(Boolean(archetypeId), `${id} must declare archetypeId`, errors);
    assertCondition(Boolean(contract), `${id} references unknown contractId: ${contractId}`, errors);
    assertCondition(Boolean(archetype), `${id} references unknown archetypeId: ${archetypeId}`, errors);
    assertCondition(Array.isArray(archetype?.scenarioContractIds) && archetype.scenarioContractIds.includes(contractId), `${id} contractId ${contractId} is not allowed by archetype ${archetypeId}`, errors);
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

function validateServiceBlueprintContract(serviceBlueprint, errors) {
  const requiredSections = [
    'provider',
    'serviceBlueprint',
    'serviceOptions',
    'availabilitySlots',
    'pricingRules',
    'receiverRequiredFields',
    'providerOnlyFields',
    'evidencePolicy',
    'reviewGates',
    'privacyPolicy',
    'fixtures'
  ];
  const requiredRoles = [
    'SelectableItem',
    'CalculationRule',
    'AuditAnchor',
    'Metadata',
    'ForbiddenLeak',
    'ProviderOnlyField',
    'ReceiverRequiredField',
    'AvailabilitySlot',
    'ReviewGate'
  ];
  const requiredArchetypes = [
    'menu_unit_pricing',
    'tiered_slot_booking',
    'threshold_incentive',
    'posthoc_audit_split'
  ];
  const requiredSparseRules = [
    'visible_options_only',
    'dm_missing_detail_routes_to_review',
    'provider_backend_detail_not_p0',
    'no_custom_consultation_from_sparse_evidence'
  ];
  const sections = new Set(Array.isArray(serviceBlueprint.requiredTopLevelSections) ? serviceBlueprint.requiredTopLevelSections : []);
  const roles = new Set(Array.isArray(serviceBlueprint.fieldRoles) ? serviceBlueprint.fieldRoles : []);
  const archetypes = Array.isArray(serviceBlueprint.archetypes) ? serviceBlueprint.archetypes : [];
  const archetypesById = new Map(archetypes.map((archetype) => [archetype?.id, archetype]));
  const sparseRuleIds = new Set((Array.isArray(serviceBlueprint.sparseEvidenceRules) ? serviceBlueprint.sparseEvidenceRules : []).map((rule) => rule?.id).filter(Boolean));
  assertCondition(typeof serviceBlueprint.version === 'string' && serviceBlueprint.version.length > 0, 'service blueprint contract version is required', errors);
  assertCondition(serviceBlueprint.externalName === 'ServiceBlueprint', 'service blueprint externalName must be ServiceBlueprint', errors);
  assertCondition(serviceBlueprint.internalAlias === 'hostTask', 'service blueprint internalAlias must be hostTask', errors);
  assertCondition(serviceBlueprint.boundary?.roomMode === 'single_direction_private_task_room', 'service blueprint must lock single_direction_private_task_room mode', errors);
  assertCondition(serviceBlueprint.boundary?.hostProvidedOptionRequired === true, 'service blueprint must require host-provided options', errors);
  for (const section of requiredSections) {
    assertCondition(sections.has(section), `service blueprint missing top-level section: ${section}`, errors);
  }
  for (const role of requiredRoles) {
    assertCondition(roles.has(role), `service blueprint missing field role: ${role}`, errors);
  }
  for (const archetypeId of requiredArchetypes) {
    const archetype = archetypesById.get(archetypeId);
    assertCondition(Boolean(archetype), `service blueprint missing archetype: ${archetypeId}`, errors);
    assertCondition(Array.isArray(archetype?.scenarioContractIds) && archetype.scenarioContractIds.length > 0, `service blueprint archetype ${archetypeId} needs scenarioContractIds`, errors);
    assertCondition(Array.isArray(archetype?.minimumSections) && archetype.minimumSections.length > 0, `service blueprint archetype ${archetypeId} needs minimumSections`, errors);
  }
  for (const ruleId of requiredSparseRules) {
    assertCondition(sparseRuleIds.has(ruleId), `service blueprint missing sparse evidence rule: ${ruleId}`, errors);
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

function validateEvidenceReviewContract(contract, errors) {
  const requiredLayers = [
    'EvidenceAsset',
    'OcrObservation',
    'ParserCandidate',
    'SelectableItem',
    'CalculationRule',
    'ProviderOnlyField',
    'ReceiverRequiredField',
    'AvailabilitySlot',
    'ReviewGate',
    'ReviewDecision',
    'SettlementSnapshot'
  ];
  const requiredStatuses = ['pending', 'accepted', 'rejected', 'modified', 'blocked'];
  const requiredSurfaces = ['member_selectable', 'host_rule_panel', 'audit_anchor', 'metadata_only', 'provider_only', 'receiver_required', 'availability_slot', 'review_gate', 'blocked_noise'];
  const requiredPriceRoles = [
    'line_item',
    'shared_fixed_fee',
    'tax_rate',
    'service_rate',
    'discount_rate',
    'discount_amount',
    'tax_and_fee',
    'deposit',
    'prepayment_down',
    'subtotal_observation',
    'grand_total_observation',
    'threshold_amount',
    'points_value',
    'non_price_context'
  ];
  const requiredSourceNumberClasses = [
    'currency_amount',
    'percentage_rate',
    'age_range',
    'itinerary_index',
    'capacity',
    'quantity',
    'duration',
    'distance',
    'receipt_total',
    'payment_amount',
    'identifier',
    'points_value'
  ];
  const requiredAntiPollutionRules = [
    'parser_writes_candidates_first',
    'member_items_require_evidence_pointer',
    'rule_roles_not_member_selectable',
    'pending_candidates_block_member_open',
    'text_shadow_is_not_primary_image_evidence',
    'host_blueprint_options_only',
    'sparse_evidence_routes_unknowns_to_review',
    'complex_formula_routes_to_review',
    'review_gate_blocks_member_open',
    'guardrail_memory_records_negative_patterns_only',
    'structural_review_gate_requires_edit_or_remove',
    'canonical_number_normalizer_before_forbidden_match',
    'forbidden_context_keywords_cover_address_tax_time'
  ];
  const requiredOcrObservationFields = [
    'boundingZone',
    'detectedTypeHint',
    'auditAnchor',
    'auditAnchors',
    'reviewGates'
  ];
  const requiredParserCandidateFields = [
    'boundingZone',
    'detectedTypeHint',
    'auditAnchor',
    'auditAnchors',
    'reviewGates'
  ];
  const requiredReviewGateFields = [
    'id',
    'severity',
    'reason',
    'fields',
    'resolvedByHost'
  ];
  const requiredGuardrailMemoryFields = [
    'patternScope',
    'contractId',
    'language',
    'evidenceType',
    'matcherStrength',
    'actionOnMatch',
    'patternType',
    'matcher',
    'forbiddenStorage'
  ];
  const layers = new Set(Array.isArray(contract.layers) ? contract.layers : []);
  const statuses = new Set(Array.isArray(contract.candidateStatuses) ? contract.candidateStatuses : []);
  const surfaces = new Set(Array.isArray(contract.displaySurfaces) ? contract.displaySurfaces : []);
  const priceRoles = new Set(Array.isArray(contract.priceRoles) ? contract.priceRoles : []);
  const sourceNumberClasses = new Set(Array.isArray(contract.sourceNumberClasses) ? contract.sourceNumberClasses : []);
  const antiPollutionRules = new Set((Array.isArray(contract.antiPollutionRules) ? contract.antiPollutionRules : []).map((rule) => rule?.id).filter(Boolean));
  const ocrObservationFields = new Set(Array.isArray(contract.ocrObservationFields) ? contract.ocrObservationFields : []);
  const parserCandidateFields = new Set(Array.isArray(contract.parserCandidateFields) ? contract.parserCandidateFields : []);
  const reviewGateFields = new Set(Array.isArray(contract.reviewGateFields) ? contract.reviewGateFields : []);
  const guardrailMemoryFields = new Set(Array.isArray(contract.guardrailMemoryFields) ? contract.guardrailMemoryFields : []);
  assertCondition(typeof contract.version === 'string' && contract.version.length > 0, 'evidence review contract version is required', errors);
  for (const layer of requiredLayers) {
    assertCondition(layers.has(layer), `evidence review contract missing layer: ${layer}`, errors);
  }
  for (const status of requiredStatuses) {
    assertCondition(statuses.has(status), `evidence review contract missing candidate status: ${status}`, errors);
  }
  for (const surface of requiredSurfaces) {
    assertCondition(surfaces.has(surface), `evidence review contract missing display surface: ${surface}`, errors);
  }
  for (const role of requiredPriceRoles) {
    assertCondition(priceRoles.has(role), `evidence review contract missing priceRole: ${role}`, errors);
  }
  for (const numberClass of requiredSourceNumberClasses) {
    assertCondition(sourceNumberClasses.has(numberClass), `evidence review contract missing sourceNumberClass: ${numberClass}`, errors);
  }
  for (const ruleId of requiredAntiPollutionRules) {
    assertCondition(antiPollutionRules.has(ruleId), `evidence review contract missing anti-pollution rule: ${ruleId}`, errors);
  }
  for (const field of requiredOcrObservationFields) {
    assertCondition(ocrObservationFields.has(field), `evidence review contract missing OcrObservation field: ${field}`, errors);
  }
  for (const field of requiredParserCandidateFields) {
    assertCondition(parserCandidateFields.has(field), `evidence review contract missing ParserCandidate field: ${field}`, errors);
  }
  for (const field of requiredReviewGateFields) {
    assertCondition(reviewGateFields.has(field), `evidence review contract missing ReviewGate field: ${field}`, errors);
  }
  for (const field of requiredGuardrailMemoryFields) {
    assertCondition(guardrailMemoryFields.has(field), `evidence review contract missing GuardrailMemory field: ${field}`, errors);
  }
}

async function main() {
  const errors = [];
  const contractsConfig = await readJson('config/scenario-contracts.json');
  const promptLibrary = await readJson('config/adaptive-prompt-library.json');
  const guardrailRegistry = await readJson('config/guardrail-registry.json');
  const submitGate = await readJson('config/enterprise-submit-gate.json');
  const evidenceReviewContract = await readJson('config/evidence-review-contract.json');
  const serviceBlueprint = await readJson('config/service-blueprint-contract.json');
  const fixture = await readJson('fixtures/adaptive-parser-matrix.json');
  validateContracts(contractsConfig, promptLibrary, guardrailRegistry, errors);
  validatePromptLibrary(promptLibrary, errors);
  validateServiceBlueprintContract(serviceBlueprint, errors);
  validateFixtures(fixture, contractsConfig, serviceBlueprint, errors);
  validateEnterpriseSubmitGate(submitGate, errors);
  validateEvidenceReviewContract(evidenceReviewContract, errors);

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
    evidenceReviewLayers: evidenceReviewContract.layers.length,
    serviceBlueprintArchetypes: serviceBlueprint.archetypes.length,
    scenarios: fixture.scenarios.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
