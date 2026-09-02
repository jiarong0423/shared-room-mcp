import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function readJsonConfig(relativePath, fallback) {
  try {
    const filePath = path.join(projectRoot, relativePath);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export const scenarioContractsConfig = readJsonConfig('config/scenario-contracts.json', {
  version: 'shared-room-scenario-contracts.fallback',
  defaultContractId: 'generic_price_evidence',
  contracts: []
});

export const adaptivePromptLibrary = readJsonConfig('config/adaptive-prompt-library.json', {
  version: 'shared-room-adaptive-prompt-library.fallback',
  contextBlock: {
    start: 'ADAPTIVE_EXTRACTION_CONTEXT_START',
    end: 'ADAPTIVE_EXTRACTION_CONTEXT_END',
    lines: [
      '請先依場景契約判斷欄位角色，再抽取品項；不要假設固定欄位數，也不要補不存在的格子。',
      '每個價格必須能錨定到品名、票種、方案、場地、租借物或可列入費用的服務。若欄位對應不確定，輸出 manual_review 標記，不要硬通過。'
    ]
  },
  nodes: {},
  contractNodeMap: {}
});

export const guardrailRegistryConfig = readJsonConfig('config/guardrail-registry.json', {
  version: 'shared-room-guardrail-registry.fallback',
  rules: []
});

export const scenarioContracts = Array.isArray(scenarioContractsConfig.contracts)
  ? scenarioContractsConfig.contracts
  : [];

export const guardrailRuleIds = Array.isArray(guardrailRegistryConfig.rules)
  ? guardrailRegistryConfig.rules.map((rule) => rule?.id).filter(Boolean)
  : [];

function splitLines(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeTaskType(value) {
  const taskType = String(value || 'auto').trim();
  return taskType || 'auto';
}

function extractPriceLikeMatches(line) {
  const matches = [];
  const pattern = /(?:NT\$|\$|元|圓|塊)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,6})(?:\s*(?:元|圓|塊))?/gi;
  let match;
  while ((match = pattern.exec(String(line || ''))) !== null) {
    const price = Number(String(match[1] || '').replace(/,/g, ''));
    if (Number.isInteger(price) && price > 0 && price <= 100000) {
      matches.push({
        price,
        index: match.index,
        raw: match[0]
      });
    }
  }
  return matches;
}

export function getScenarioContractById(contractId) {
  return scenarioContracts.find((contract) => contract?.id === contractId) || null;
}

export function getDefaultScenarioContract() {
  return getScenarioContractById(scenarioContractsConfig.defaultContractId)
    || getScenarioContractById('generic_price_evidence')
    || scenarioContracts[0]
    || null;
}

export function selectScenarioContract(taskType, ambiguityTokens = []) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const taskMatch = scenarioContracts.find((contract) => {
    return Array.isArray(contract?.taskTypes) && contract.taskTypes.includes(normalizedTaskType);
  });
  if (taskMatch) {
    return taskMatch;
  }

  const tokenMatch = scenarioContracts.find((contract) => {
    const supportedTokens = Array.isArray(contract?.signals?.ambiguityTokens)
      ? contract.signals.ambiguityTokens
      : [];
    return ambiguityTokens.some((token) => supportedTokens.includes(token));
  });
  return tokenMatch || getDefaultScenarioContract();
}

export function buildScenarioRuleRegistry(contract, ambiguityTokens = []) {
  const baseRules = new Set(Array.isArray(contract?.guardrails) ? contract.guardrails : []);
  if (ambiguityTokens.includes('age')) baseRules.add('age_number_not_price');
  if (ambiguityTokens.includes('itinerary')) baseRules.add('itinerary_number_not_price');
  if (ambiguityTokens.includes('capacity')) baseRules.add('capacity_number_not_price');
  if (ambiguityTokens.includes('quantity')) baseRules.add('quantity_number_not_price');
  if (ambiguityTokens.includes('size')) baseRules.add('size_variant_grouping');
  if (contract?.categoryBinding === 'ticket') baseRules.add('task_type_category_binding_ticket');
  baseRules.add('human_final_approval_required');
  return Array.from(baseRules);
}

export function buildExtractionFeatureProfile(options = {}) {
  const localOcrText = String(options.localOcrText || '').trim();
  const taskType = normalizeTaskType(options.taskType || options.taskRouter?.taskType || options.taskRouter?.selectedTaskType);
  const lines = splitLines(localOcrText);
  const priceLineCount = lines.filter((line) => extractPriceLikeMatches(line).length > 0).length;
  const hasChinese = /[\u4e00-\u9fff]/.test(localOcrText);
  const hasLatin = /[A-Za-z]/.test(localOcrText);
  const ambiguityTokens = [];
  if (/歲|未滿|以上|以下|years?\s*old|yo/i.test(localOcrText)) ambiguityTokens.push('age');
  if (/行程|方案|路線|route|trip|tour/i.test(localOcrText)) ambiguityTokens.push('itinerary');
  if (/ml|毫升|容量|cc|c\.c\.|kcal|calorie/i.test(localOcrText)) ambiguityTokens.push('capacity');
  if (/\b(?:s|m|l|xl|small|medium|regular|large|bottle)\b|小杯|中杯|大杯|瓶裝|分享瓶/i.test(localOcrText)) ambiguityTokens.push('size');
  if (/押金|保證金|deposit/i.test(localOcrText)) ambiguityTokens.push('deposit');
  if (/小計|合計|總數|qty|quantity|subtotal|人數|件數|時數/i.test(localOcrText)) ambiguityTokens.push('quantity');

  const scenarioContract = selectScenarioContract(taskType, ambiguityTokens);

  return {
    language: hasChinese ? 'zh-TW' : hasLatin ? 'en' : 'unknown',
    taskType,
    scenarioContract: scenarioContract?.id || 'generic_price_evidence',
    scenarioContractVersion: scenarioContractsConfig.version,
    categoryBinding: scenarioContract?.categoryBinding || null,
    outputFields: Array.isArray(scenarioContract?.outputFields) ? scenarioContract.outputFields : [],
    promptNodes: Array.isArray(scenarioContract?.promptNodes) ? scenarioContract.promptNodes : [],
    layoutDensity: priceLineCount >= 8 || lines.length >= 12 ? 'high' : priceLineCount >= 3 ? 'medium' : 'low',
    hasGridSignals: /[|｜\t]/.test(localOcrText) || priceLineCount >= 4,
    priceLineCount,
    ambiguityTokens: Array.from(new Set(ambiguityTokens)),
    ruleRegistry: buildScenarioRuleRegistry(scenarioContract, ambiguityTokens)
  };
}

export function buildAdaptivePromptLines(featureProfile) {
  const profile = featureProfile && typeof featureProfile === 'object' ? featureProfile : {};
  const contextBlock = adaptivePromptLibrary.contextBlock && typeof adaptivePromptLibrary.contextBlock === 'object'
    ? adaptivePromptLibrary.contextBlock
    : {};
  const promptNodeMap = adaptivePromptLibrary.nodes && typeof adaptivePromptLibrary.nodes === 'object'
    ? adaptivePromptLibrary.nodes
    : {};
  const configuredNodeIds = adaptivePromptLibrary.contractNodeMap?.[profile.scenarioContract] || profile.promptNodes || [];
  const nodeIds = configuredNodeIds.length > 0 ? configuredNodeIds : ['ocr_text_cleanup', 'generic_price_extraction', 'parser_post_audit'];
  const lines = [
    '',
    contextBlock.start || 'ADAPTIVE_EXTRACTION_CONTEXT_START',
    `language=${profile.language || 'unknown'}`,
    `scenarioContract=${profile.scenarioContract || 'generic_price_evidence'}`,
    `scenarioContractVersion=${profile.scenarioContractVersion || scenarioContractsConfig.version}`,
    `layoutDensity=${profile.layoutDensity || 'unknown'}`,
    `hasGridSignals=${Boolean(profile.hasGridSignals)}`,
    `ambiguityTokens=${Array.isArray(profile.ambiguityTokens) ? profile.ambiguityTokens.join(',') : ''}`,
    `ruleRegistry=${Array.isArray(profile.ruleRegistry) ? profile.ruleRegistry.join(',') : ''}`,
    ...(Array.isArray(contextBlock.lines) ? contextBlock.lines : []),
    contextBlock.end || 'ADAPTIVE_EXTRACTION_CONTEXT_END'
  ];

  for (const nodeId of nodeIds) {
    const nodeLines = Array.isArray(promptNodeMap[nodeId]) ? promptNodeMap[nodeId] : [];
    if (nodeLines.length === 0) {
      continue;
    }
    lines.push(
      '',
      `${nodeId.toUpperCase()}_START`,
      ...nodeLines,
      `${nodeId.toUpperCase()}_END`
    );
  }

  return lines;
}

function boundedScore(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function scoreAdaptiveParseQuality(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const issues = Array.isArray(input.issues) ? input.issues : [];
  const taskType = String(input.taskType || input.taskRouter?.taskType || '');
  const localOcr = input.localOcr && typeof input.localOcr === 'object' ? input.localOcr : null;
  const featureProfile = input.featureProfile && typeof input.featureProfile === 'object'
    ? input.featureProfile
    : buildExtractionFeatureProfile({
      localOcrText: input.localOcrText || '',
      taskType,
      taskRouter: input.taskRouter
    });
  const highIssueCount = issues.filter((issue) => issue.severity === 'high').length;
  const mediumIssueCount = issues.filter((issue) => issue.severity === 'medium').length;
  const knownCategories = items.filter((item) => String(item.category || 'other') !== 'other').length;
  const pricedItems = items.filter((item) => Number.isInteger(Number(item.price)) && Number(item.price) > 0).length;
  const anchoredNames = items.filter((item) => String(item.name || '').trim().length >= 2).length;
  const schemaAlignment = items.length === 0 ? 0 : boundedScore((knownCategories + pricedItems + anchoredNames) / (items.length * 3));
  const entityAnchoring = items.length === 0 ? 0 : boundedScore(anchoredNames / items.length);
  const priceCoverage = Number(localOcr?.candidateCount || 0) > 0
    ? boundedScore(items.length / Number(localOcr.candidateCount))
    : items.length >= 3 ? 0.78 : 0.35;
  const contractFit = featureProfile.scenarioContract === 'ticket_activity_matrix' && taskType === 'ticket_activity'
    ? 1
    : featureProfile.scenarioContract === 'menu_size_option_matrix' && ['drink_order', 'restaurant_split', 'group_buy'].includes(taskType)
      ? 1
      : featureProfile.scenarioContract === 'venue_rate_matrix' && ['sports_venue', 'ktv_room'].includes(taskType)
        ? 1
        : featureProfile.scenarioContract === 'rental_deposit_key_value' && taskType === 'rental_share'
          ? 1
          : featureProfile.scenarioContract === 'generic_price_evidence' ? 0.72 : 0.82;
  const issuePenalty = Math.min(0.5, highIssueCount * 0.22 + mediumIssueCount * 0.08);
  const score = boundedScore(
    schemaAlignment * 0.34
    + entityAnchoring * 0.22
    + priceCoverage * 0.24
    + contractFit * 0.2
    - issuePenalty
  );
  const blockingReasons = issues
    .filter((issue) => issue.severity === 'high')
    .map((issue) => ({
      type: issue.type || 'unknown',
      item: issue.item || '',
      detail: issue.detail || issue.type || 'needs review'
    }));

  return {
    score: Number(score.toFixed(2)),
    threshold: 0.85,
    components: {
      schemaAlignment: Number(schemaAlignment.toFixed(2)),
      entityAnchoring: Number(entityAnchoring.toFixed(2)),
      priceCoverage: Number(priceCoverage.toFixed(2)),
      contractFit: Number(contractFit.toFixed(2)),
      issuePenalty: Number(issuePenalty.toFixed(2))
    },
    featureProfile,
    blockingReasons,
    humanFinalApprovalRequired: true,
    autoFinalizeAllowed: false
  };
}

export function buildAdaptivePipelineMetadata() {
  return {
    scenarioContractVersion: scenarioContractsConfig.version,
    promptLibraryVersion: adaptivePromptLibrary.version,
    guardrailRegistryVersion: guardrailRegistryConfig.version,
    ruleRegistry: guardrailRuleIds.length > 0
      ? guardrailRuleIds
      : [
        'age_number_not_price',
        'itinerary_number_not_price',
        'currency_marker_preferred',
        'task_type_category_binding_ticket',
        'size_variant_grouping',
        'human_final_approval_required'
      ],
    llmNodes: Array.from(new Set([
      'image_preprocessor',
      ...Object.keys(adaptivePromptLibrary.nodes || {}),
      'webmcp_state_review',
      'host_proposal_gate'
    ])),
    humanFinalApprovalRequired: true,
    autoFinalizeAllowed: false
  };
}
