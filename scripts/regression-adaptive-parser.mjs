import fs from 'node:fs/promises';
import process from 'node:process';

const defaultBaseUrl = 'http://127.0.0.1:4180';
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lH9X3wAAAABJRU5ErkJggg==',
  'base64'
);

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    imagePath: '',
    timeoutMs: 15000,
    repeat: 1
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--base-url' && next) {
      args.baseUrl = next.replace(/\/+$/, '');
      index += 1;
    } else if (arg === '--image' && next) {
      args.imagePath = next;
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(5000, Number(next) || args.timeoutMs);
      index += 1;
    } else if (arg === '--repeat' && next) {
      args.repeat = Math.max(1, Math.min(20, Number(next) || args.repeat));
      index += 1;
    }
  }
  return args;
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createRoom(baseUrl, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms`, {
    method: 'POST'
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(response.data?.error || `create room failed: HTTP ${response.status}`);
  }
  return response.data;
}

async function loadImageBuffer(imagePath) {
  if (!imagePath) {
    return onePixelPng;
  }
  return fs.readFile(imagePath);
}

async function loadScenarioMatrix() {
  const fixtureUrl = new URL('../fixtures/adaptive-parser-matrix.json', import.meta.url);
  const fixture = JSON.parse(await fs.readFile(fixtureUrl, 'utf8'));
  const scenarios = Array.isArray(fixture.scenarios) ? fixture.scenarios : [];
  return scenarios.map((scenario) => ({
    ...scenario,
    text: Array.isArray(scenario.textLines) ? scenario.textLines.join('\n') : String(scenario.text || '')
  }));
}

async function parseEvidence(baseUrl, timeoutMs, scenario, imageBuffer) {
  const room = await createRoom(baseUrl, timeoutMs);
  const form = new FormData();
  form.append('menuImage', new Blob([imageBuffer], { type: 'image/png' }), `${scenario.id}.png`);
  form.append('taskType', scenario.taskType);
  form.append('ocrText', scenario.text);
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/menu`, {
    method: 'POST',
    body: form
  }, timeoutMs);
  return {
    roomId: room.id,
    response
  };
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function summarizeItems(items) {
  return items.map((item) => ({
    name: item.name || item.label,
    price: item.price ?? item.amount,
    priceRole: item.priceRole,
    sourceNumberClass: item.sourceNumberClass,
    currency: item.currency,
    quantity: item.quantity,
    unit: item.unit,
    conditions: item.conditions || [],
    reviewFlags: item.reviewFlags || [],
    rawTextEvidence: item.rawTextEvidence,
    confidence: item.confidence,
    category: item.category,
    displaySurface: item.displaySurface,
    status: item.status,
    sourceAssetId: item.sourceAssetId,
    sourceObservationIds: item.sourceObservationIds || [],
    optionGroups: item.optionGroups || [],
    boundingZone: item.boundingZone || null,
    detectedTypeHint: item.detectedTypeHint || null,
    auditAnchor: item.auditAnchor || null,
    auditAnchors: item.auditAnchors || [],
    reviewGates: item.reviewGates || []
  }));
}

function assertExpectedPrices(scenario, items, expectedPrices) {
  const prices = items.map((item) => Number(item.price ?? item.amount)).sort((a, b) => a - b);
  const expected = [...expectedPrices].sort((a, b) => a - b);
  assertCondition(JSON.stringify(prices) === JSON.stringify(expected), `${scenario.id} prices drifted: ${JSON.stringify(prices)}`);
}

function assertRequiredSizeItems(scenario, items, requiredSizeItems) {
  for (const requiredName of requiredSizeItems) {
    const item = items.find((candidate) => {
      return new RegExp(`^${requiredName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(String(candidate.name || candidate.label || ''));
    });
    assertCondition(item, `${scenario.id} missing size item ${requiredName}`);
    assertCondition(
      Array.isArray(item.optionGroups) && item.optionGroups.some((group) => group.type === 'size'),
      `${scenario.id} ${requiredName} did not keep size prices in optionGroups`
    );
  }
}

function assertForbiddenNamePatterns(scenario, items, patterns) {
  for (const pattern of patterns) {
    const regexp = new RegExp(pattern, 'i');
    assertCondition(!items.some((item) => regexp.test(String(item.name || item.label || ''))), `${scenario.id} forbidden name pattern leaked: ${pattern}`);
  }
}

function assertExpectedPriceRoles(scenario, items, expectedRoles) {
  for (const [name, expectedRole] of Object.entries(expectedRoles || {})) {
    const item = items.find((candidate) => String(candidate.name || candidate.label || '') === name);
    assertCondition(item, `${scenario.id} missing role assertion item: ${name}`);
    assertCondition(item.priceRole === expectedRole, `${scenario.id} ${name} role drifted: expected ${expectedRole}, got ${item.priceRole}`);
  }
}

function validateScenario(scenario, items) {
  const expect = scenario.expect && typeof scenario.expect === 'object' ? scenario.expect : {};
  for (const item of items) {
    const name = item.name || item.label;
    assertCondition(typeof item.priceRole === 'string' && item.priceRole.length > 0, `${scenario.id} item missing priceRole: ${name}`);
    assertCondition(typeof item.sourceNumberClass === 'string' && item.sourceNumberClass.length > 0, `${scenario.id} item missing sourceNumberClass: ${name}`);
    assertCondition(typeof item.currency === 'string' && item.currency.length > 0, `${scenario.id} item missing currency: ${name}`);
    assertCondition(Number.isFinite(Number(item.quantity || 1)) && Number(item.quantity || 1) >= 1, `${scenario.id} item missing valid quantity: ${name}`);
    assertCondition(Array.isArray(item.conditions), `${scenario.id} item conditions must be an array: ${name}`);
    assertCondition(Array.isArray(item.reviewFlags), `${scenario.id} item reviewFlags must be an array: ${name}`);
    assertCondition(typeof item.rawTextEvidence === 'string' && item.rawTextEvidence.length > 0, `${scenario.id} item missing rawTextEvidence: ${name}`);
    assertCondition(Number.isFinite(Number(item.confidence)), `${scenario.id} item missing confidence: ${name}`);
  }
  if (Number.isInteger(expect.itemCount)) {
    assertCondition(items.length === expect.itemCount, `${scenario.id} expected ${expect.itemCount} items, got ${items.length}`);
  }
  if (Number.isInteger(expect.itemCountAtLeast)) {
    assertCondition(items.length >= expect.itemCountAtLeast, `${scenario.id} expected at least ${expect.itemCountAtLeast} items, got ${items.length}`);
  }
  if (Array.isArray(expect.candidatePrices)) {
    assertExpectedPrices(scenario, items, expect.candidatePrices);
  }
  if (expect.priceRoles && typeof expect.priceRoles === 'object') {
    assertExpectedPriceRoles(scenario, items, expect.priceRoles);
  }
  if (Array.isArray(expect.allCategories) && expect.allCategories.length > 0) {
    const allowed = new Set(expect.allCategories);
    assertCondition(items.every((item) => allowed.has(item.category)), `${scenario.id} produced category outside ${expect.allCategories.join(',')}`);
  }
  if (Array.isArray(expect.forbiddenCandidatePrices) && expect.forbiddenCandidatePrices.length > 0) {
    const forbidden = new Set(expect.forbiddenCandidatePrices.map((price) => Number(price)));
    assertCondition(!items.some((item) => forbidden.has(Number(item.price ?? item.amount))), `${scenario.id} non-price number leaked into price`);
  }
  if (Array.isArray(expect.requiredSizeItems)) {
    assertRequiredSizeItems(scenario, items, expect.requiredSizeItems);
  }
  if (Array.isArray(expect.forbiddenCandidateNamePatterns)) {
    assertForbiddenNamePatterns(scenario, items, expect.forbiddenCandidateNamePatterns);
  }
  if (Array.isArray(expect.forbiddenBaseItemPatterns)) {
    assertForbiddenNamePatterns(scenario, items, expect.forbiddenBaseItemPatterns);
  }
}

function validateAntiPollutionState(scenario, state, candidates, memberItems) {
  const expect = scenario.expect && typeof scenario.expect === 'object' ? scenario.expect : {};
  const serviceBlueprint = state.serviceBlueprintContract && typeof state.serviceBlueprintContract === 'object'
    ? state.serviceBlueprintContract
    : null;
  const forbiddenMemberRoles = new Set([
    'shared_fixed_fee',
    'tax_rate',
    'tax_fixed_fee',
    'service_rate',
    'service_fixed_fee',
    'discount_rate',
    'discount_amount',
    'discount',
    'tax_and_fee',
    'deposit',
    'prepayment_down',
    'aggregate_subtotal',
    'aggregate_grand_total',
    'subtotal_observation',
    'grand_total_observation',
    'threshold_amount',
    'points_value',
    'non_price_context'
  ]);
  assertCondition(Array.isArray(state.evidenceAssets), `${scenario.id} missing evidenceAssets`);
  assertCondition(Array.isArray(state.ocrObservations), `${scenario.id} missing ocrObservations`);
  assertCondition(Array.isArray(state.parserCandidates), `${scenario.id} missing parserCandidates`);
  assertCondition(Array.isArray(state.calculationRules), `${scenario.id} missing calculationRules`);
  assertCondition(serviceBlueprint?.contractVersion === 'adaptive-contract-service-blueprint.v1', `${scenario.id} missing service blueprint contract`);
  assertCondition(serviceBlueprint?.roomMode === 'single_direction_private_task_room', `${scenario.id} service blueprint room mode drifted`);
  assertCondition(serviceBlueprint?.hostProvidedOptionRequired === true, `${scenario.id} service blueprint must require host-provided options`);
  assertCondition(Array.isArray(serviceBlueprint?.archetypes) && serviceBlueprint.archetypes.includes(scenario.archetypeId), `${scenario.id} service blueprint does not expose archetype ${scenario.archetypeId}`);
  assertCondition(state.evidenceAssets.length >= 1, `${scenario.id} expected at least one evidence asset`);
  assertCondition(state.ocrObservations.length >= 1, `${scenario.id} expected OCR observations`);
  for (const observation of state.ocrObservations) {
    assertCondition(typeof observation.boundingZone === 'string' && observation.boundingZone.length > 0, `${scenario.id} OCR observation missing boundingZone`);
    assertCondition(typeof observation.detectedTypeHint === 'string' && observation.detectedTypeHint.length > 0, `${scenario.id} OCR observation missing detectedTypeHint`);
    assertCondition(typeof observation.auditAnchor === 'string', `${scenario.id} OCR observation missing auditAnchor`);
    assertCondition(Array.isArray(observation.auditAnchors), `${scenario.id} OCR observation auditAnchors must be an array`);
    assertCondition(Array.isArray(observation.reviewGates), `${scenario.id} OCR observation reviewGates must be an array`);
  }
  if (Number.isInteger(expect.memberItemCount)) {
    assertCondition(memberItems.length === expect.memberItemCount, `${scenario.id} expected ${expect.memberItemCount} member items, got ${memberItems.length}`);
  }
  if (Number.isInteger(expect.memberItemCountAtLeast)) {
    assertCondition(memberItems.length >= expect.memberItemCountAtLeast, `${scenario.id} expected at least ${expect.memberItemCountAtLeast} member items, got ${memberItems.length}`);
  }
  if (Number.isInteger(expect.calculationRuleCount)) {
    assertCondition(state.calculationRules.length === expect.calculationRuleCount, `${scenario.id} expected ${expect.calculationRuleCount} calculation rules, got ${state.calculationRules.length}`);
  }
  if (Number.isInteger(expect.calculationRuleCountAtLeast)) {
    assertCondition(state.calculationRules.length >= expect.calculationRuleCountAtLeast, `${scenario.id} expected at least ${expect.calculationRuleCountAtLeast} calculation rules, got ${state.calculationRules.length}`);
  }
  for (const candidate of candidates) {
    assertCondition(typeof candidate.displaySurface === 'string' && candidate.displaySurface.length > 0, `${scenario.id} candidate missing displaySurface: ${candidate.label}`);
    assertCondition(typeof candidate.status === 'string' && candidate.status.length > 0, `${scenario.id} candidate missing status: ${candidate.label}`);
    assertCondition(Array.isArray(candidate.sourceObservationIds), `${scenario.id} candidate sourceObservationIds must be an array: ${candidate.label}`);
    assertCondition(typeof candidate.boundingZone === 'string' && candidate.boundingZone.length > 0, `${scenario.id} candidate missing boundingZone: ${candidate.label}`);
    assertCondition(typeof candidate.detectedTypeHint === 'string' && candidate.detectedTypeHint.length > 0, `${scenario.id} candidate missing detectedTypeHint: ${candidate.label}`);
    assertCondition(typeof candidate.auditAnchor === 'string', `${scenario.id} candidate missing auditAnchor: ${candidate.label}`);
    assertCondition(Array.isArray(candidate.auditAnchors), `${scenario.id} candidate auditAnchors must be an array: ${candidate.label}`);
    assertCondition(Array.isArray(candidate.reviewGates), `${scenario.id} candidate reviewGates must be an array: ${candidate.label}`);
  }
  for (const item of memberItems) {
    assertCondition(item.displaySurface === 'member_selectable', `${scenario.id} member item has invalid displaySurface: ${item.name}`);
    assertCondition(typeof item.sourceAssetId === 'string' && item.sourceAssetId.length > 0, `${scenario.id} member item missing sourceAssetId: ${item.name}`);
    assertCondition(Array.isArray(item.sourceObservationIds) && item.sourceObservationIds.length > 0, `${scenario.id} member item missing sourceObservationIds: ${item.name}`);
    assertCondition(typeof item.boundingZone === 'string' && item.boundingZone.length > 0, `${scenario.id} member item missing boundingZone: ${item.name}`);
    assertCondition(typeof item.detectedTypeHint === 'string' && item.detectedTypeHint.length > 0, `${scenario.id} member item missing detectedTypeHint: ${item.name}`);
    assertCondition(Array.isArray(item.auditAnchors), `${scenario.id} member item auditAnchors must be an array: ${item.name}`);
    assertCondition(Array.isArray(item.reviewGates), `${scenario.id} member item reviewGates must be an array: ${item.name}`);
    assertCondition(!forbiddenMemberRoles.has(item.priceRole), `${scenario.id} rule-like role leaked into member item: ${item.name}`);
  }
  if (Array.isArray(expect.memberPrices)) {
    assertExpectedPrices(scenario, memberItems, expect.memberPrices);
  }
  if (Array.isArray(expect.forbiddenMemberPrices) && expect.forbiddenMemberPrices.length > 0) {
    const forbidden = new Set(expect.forbiddenMemberPrices.map((price) => Number(price)));
    assertCondition(!memberItems.some((item) => forbidden.has(Number(item.price ?? item.amount))), `${scenario.id} forbidden rule/audit price leaked into member items`);
  }
  const forbiddenMemberNamePatterns = Array.isArray(expect.forbiddenMemberNamePatterns)
    ? expect.forbiddenMemberNamePatterns
    : Array.isArray(expect.forbiddenNamePatterns) ? expect.forbiddenNamePatterns : [];
  if (forbiddenMemberNamePatterns.length > 0) {
    assertForbiddenNamePatterns(scenario, memberItems, forbiddenMemberNamePatterns);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const scenarios = await loadScenarioMatrix();
  const imageBuffer = await loadImageBuffer(args.imagePath);
  const results = [];
  const stability = {};
  for (let run = 1; run <= args.repeat; run += 1) {
    for (const scenario of scenarios) {
      const { roomId, response } = await parseEvidence(args.baseUrl, args.timeoutMs, scenario, imageBuffer);
      if (!response.ok) {
        throw new Error(`${scenario.id} run ${run} failed in room ${roomId}: ${response.data?.error || `HTTP ${response.status}`}`);
      }
      const memberItems = Array.isArray(response.data?.items) ? response.data.items : [];
      const candidates = Array.isArray(response.data?.parserCandidates) ? response.data.parserCandidates : memberItems;
      validateScenario(scenario, candidates);
      validateAntiPollutionState(scenario, response.data, candidates, memberItems);
      const scenarioStats = stability[scenario.id] || {
        id: scenario.id,
        runs: 0,
        pass: 0,
        statuses: {},
        highIssueCounts: {},
        itemCounts: {}
      };
      scenarioStats.runs += 1;
      scenarioStats.pass += 1;
      const status = response.data?.parseQuality?.status || 'unknown';
      const highIssueCount = String(response.data?.parseQuality?.highIssueCount || 0);
      const itemCount = String(candidates.length);
      scenarioStats.statuses[status] = (scenarioStats.statuses[status] || 0) + 1;
      scenarioStats.highIssueCounts[highIssueCount] = (scenarioStats.highIssueCounts[highIssueCount] || 0) + 1;
      scenarioStats.itemCounts[itemCount] = (scenarioStats.itemCounts[itemCount] || 0) + 1;
      stability[scenario.id] = scenarioStats;
      results.push({
        id: scenario.id,
        run,
        roomId,
        itemCount: candidates.length,
        memberItemCount: memberItems.length,
        calculationRuleCount: Array.isArray(response.data?.calculationRules) ? response.data.calculationRules.length : 0,
        parseStatus: status,
        highIssueCount: response.data?.parseQuality?.highIssueCount || 0,
        confidenceScore: response.data?.parseQuality?.adaptiveConfidence?.score ?? null,
        scenarioContract: response.data?.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        archetypeId: scenario.archetypeId,
        serviceBlueprint: response.data?.serviceBlueprintContract?.contractVersion || null,
        candidates: summarizeItems(candidates),
        memberItems: summarizeItems(memberItems)
      });
    }
  }
  console.log(JSON.stringify({
    ok: true,
    baseUrl: args.baseUrl,
    repeat: args.repeat,
    stability: Object.values(stability),
    scenarios: results
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
