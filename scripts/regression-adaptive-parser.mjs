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
    name: item.name,
    price: item.price,
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
    optionGroups: item.optionGroups || []
  }));
}

function assertExpectedPrices(scenario, items, expectedPrices) {
  const prices = items.map((item) => Number(item.price)).sort((a, b) => a - b);
  const expected = [...expectedPrices].sort((a, b) => a - b);
  assertCondition(JSON.stringify(prices) === JSON.stringify(expected), `${scenario.id} prices drifted: ${JSON.stringify(prices)}`);
}

function assertRequiredSizeItems(scenario, items, requiredSizeItems) {
  for (const requiredName of requiredSizeItems) {
    const item = items.find((candidate) => {
      return new RegExp(`^${requiredName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(String(candidate.name || ''));
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
    assertCondition(!items.some((item) => regexp.test(String(item.name || ''))), `${scenario.id} forbidden name pattern leaked: ${pattern}`);
  }
}

function assertExpectedPriceRoles(scenario, items, expectedRoles) {
  for (const [name, expectedRole] of Object.entries(expectedRoles || {})) {
    const item = items.find((candidate) => String(candidate.name || '') === name);
    assertCondition(item, `${scenario.id} missing role assertion item: ${name}`);
    assertCondition(item.priceRole === expectedRole, `${scenario.id} ${name} role drifted: expected ${expectedRole}, got ${item.priceRole}`);
  }
}

function validateScenario(scenario, items) {
  const expect = scenario.expect && typeof scenario.expect === 'object' ? scenario.expect : {};
  for (const item of items) {
    assertCondition(typeof item.priceRole === 'string' && item.priceRole.length > 0, `${scenario.id} item missing priceRole: ${item.name}`);
    assertCondition(typeof item.sourceNumberClass === 'string' && item.sourceNumberClass.length > 0, `${scenario.id} item missing sourceNumberClass: ${item.name}`);
    assertCondition(typeof item.currency === 'string' && item.currency.length > 0, `${scenario.id} item missing currency: ${item.name}`);
    assertCondition(Number.isFinite(Number(item.quantity)) && Number(item.quantity) >= 1, `${scenario.id} item missing valid quantity: ${item.name}`);
    assertCondition(Array.isArray(item.conditions), `${scenario.id} item conditions must be an array: ${item.name}`);
    assertCondition(Array.isArray(item.reviewFlags), `${scenario.id} item reviewFlags must be an array: ${item.name}`);
    assertCondition(typeof item.rawTextEvidence === 'string' && item.rawTextEvidence.length > 0, `${scenario.id} item missing rawTextEvidence: ${item.name}`);
    assertCondition(Number.isFinite(Number(item.confidence)), `${scenario.id} item missing confidence: ${item.name}`);
  }
  if (Number.isInteger(expect.itemCount)) {
    assertCondition(items.length === expect.itemCount, `${scenario.id} expected ${expect.itemCount} items, got ${items.length}`);
  }
  if (Number.isInteger(expect.itemCountAtLeast)) {
    assertCondition(items.length >= expect.itemCountAtLeast, `${scenario.id} expected at least ${expect.itemCountAtLeast} items, got ${items.length}`);
  }
  if (Array.isArray(expect.prices)) {
    assertExpectedPrices(scenario, items, expect.prices);
  }
  if (expect.priceRoles && typeof expect.priceRoles === 'object') {
    assertExpectedPriceRoles(scenario, items, expect.priceRoles);
  }
  if (Array.isArray(expect.allCategories) && expect.allCategories.length > 0) {
    const allowed = new Set(expect.allCategories);
    assertCondition(items.every((item) => allowed.has(item.category)), `${scenario.id} produced category outside ${expect.allCategories.join(',')}`);
  }
  if (Array.isArray(expect.forbiddenPrices) && expect.forbiddenPrices.length > 0) {
    const forbidden = new Set(expect.forbiddenPrices.map((price) => Number(price)));
    assertCondition(!items.some((item) => forbidden.has(Number(item.price))), `${scenario.id} non-price number leaked into price`);
  }
  if (Array.isArray(expect.requiredSizeItems)) {
    assertRequiredSizeItems(scenario, items, expect.requiredSizeItems);
  }
  if (Array.isArray(expect.forbiddenNamePatterns)) {
    assertForbiddenNamePatterns(scenario, items, expect.forbiddenNamePatterns);
  }
  if (Array.isArray(expect.forbiddenBaseItemPatterns)) {
    assertForbiddenNamePatterns(scenario, items, expect.forbiddenBaseItemPatterns);
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
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      validateScenario(scenario, items);
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
      const itemCount = String(items.length);
      scenarioStats.statuses[status] = (scenarioStats.statuses[status] || 0) + 1;
      scenarioStats.highIssueCounts[highIssueCount] = (scenarioStats.highIssueCounts[highIssueCount] || 0) + 1;
      scenarioStats.itemCounts[itemCount] = (scenarioStats.itemCounts[itemCount] || 0) + 1;
      stability[scenario.id] = scenarioStats;
      results.push({
        id: scenario.id,
        run,
        roomId,
        itemCount: items.length,
        parseStatus: status,
        highIssueCount: response.data?.parseQuality?.highIssueCount || 0,
        confidenceScore: response.data?.parseQuality?.adaptiveConfidence?.score ?? null,
        scenarioContract: response.data?.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        items: summarizeItems(items)
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
