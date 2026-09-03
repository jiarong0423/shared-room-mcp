import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const defaultBaseUrl = 'http://127.0.0.1:3000';
const defaultMatrixRoot = process.env.IMAGE_MATRIX_ROOT || path.join('fixtures', 'image-matrix');
const defaultManifestPath = 'fixtures/image-fixture-manifest.json';
const defaultOutputDir = 'logs/runtime/image-matrix';
const execFileAsync = promisify(execFile);
const supportedModes = ['image-only', 'image-plus-oracle-text', 'image-plus-local-ocr'];

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    matrixRoot: defaultMatrixRoot,
    manifestPath: defaultManifestPath,
    outputDir: defaultOutputDir,
    timeoutMs: 30000,
    delayMs: 3500,
    retryAttempts: 4,
    retryDelayMs: 8000,
    tesseractBin: process.env.TESSERACT_BIN || 'tesseract',
    limit: 0,
    failFast: true,
    mode: 'image-only'
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--base-url' && next) {
      args.baseUrl = next.replace(/\/+$/, '');
      index += 1;
    } else if (arg === '--matrix-root' && next) {
      args.matrixRoot = path.resolve(next);
      index += 1;
    } else if (arg === '--manifest' && next) {
      args.manifestPath = path.resolve(next);
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = path.resolve(next);
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(5000, Number(next) || args.timeoutMs);
      index += 1;
    } else if (arg === '--delay-ms' && next) {
      args.delayMs = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === '--retry-attempts' && next) {
      args.retryAttempts = Math.max(0, Math.min(8, Number(next) || 0));
      index += 1;
    } else if (arg === '--retry-delay-ms' && next) {
      args.retryDelayMs = Math.max(1000, Number(next) || args.retryDelayMs);
      index += 1;
    } else if (arg === '--tesseract-bin' && next) {
      args.tesseractBin = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      args.limit = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === '--continue-on-failure') {
      args.failFast = false;
    } else if (arg === '--mode' && next) {
      args.mode = supportedModes.includes(next)
        ? next
        : 'image-only';
      index += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Missing image matrix artifact file: ${filePath}. Provide --matrix-root or IMAGE_MATRIX_ROOT pointing to the downloaded image-matrix artifact.`);
    }
    throw error;
  }
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return {
    buffer,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    byteSize: buffer.length
  };
}

function normalizeOcrText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 12000);
}

function uniqueLines(text) {
  const seen = new Set();
  const lines = [];
  for (const line of normalizeOcrText(text).split('\n')) {
    const key = line.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

function scoreOcrAttempt(text) {
  const normalized = normalizeOcrText(text);
  const lines = normalized ? normalized.split('\n') : [];
  const currencyHits = (normalized.match(/(?:NT\$|TWD|\$|元|圓|塊)\s*[0-9]/gi) || []).length;
  const plainPriceHits = (normalized.match(/\b[0-9]{2,4}\b/g) || []).length;
  const tableSignals = (normalized.match(/(?:會員|成人|child|adult|student|small|medium|large|ticket|price|費用|票|方案|course|rental|deposit)/gi) || []).length;
  const multiCurrencyRows = lines.filter((line) => ((line.match(/(?:NT\$|TWD|\$|元|圓|塊)\s*[0-9]/gi) || []).length >= 2)).length;
  const semanticPriceRows = lines.filter((line) => /(?:會員|非會員|成人|幼兒|嬰兒|小童|child|adult|student|member|non-member|ticket|course|rental|deposit)/i.test(line)
    && /(?:NT\$|TWD|\$|元|圓|塊)\s*[0-9]/i.test(line)).length;
  const contextOnlyRows = lines.filter((line) => /(?:歲|years?\s*old|營業時間|business hours|集合時間|截止|電話|phone|tel|地址|address|統編|tax id)/i.test(line)
    && !/(?:NT\$|TWD|\$|元|圓|塊)\s*[0-9]/i.test(line)).length;
  return currencyHits * 12
    + Math.min(plainPriceHits, 30) * 2
    + tableSignals * 3
    + multiCurrencyRows * 40
    + semanticPriceRows * 18
    + Math.min(lines.length, 40)
    - contextOnlyRows * 10;
}

function tesseractLanguageForTest(test) {
  if (String(test.language || '').toLowerCase().startsWith('zh')) {
    return 'chi_tra+eng';
  }
  return 'eng';
}

async function buildLocalOcrImageVariants(imagePath, testId) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `webmcp-ocr-${testId}-`));
  const variants = [];
  const base = sharp(imagePath, { limitInputPixels: false }).rotate();
  const metadata = await base.metadata();
  const width = Number(metadata.width || 0);
  const upscale = width > 0 && width < 2200 ? Math.min(3, Math.max(1.5, 2200 / width)) : 1;
  const variantSpecs = [
    {
      name: 'gray-sharp',
      chain: sharp(imagePath, { limitInputPixels: false }).rotate().grayscale().sharpen()
    },
    {
      name: 'upscale-gray-sharp',
      chain: sharp(imagePath, { limitInputPixels: false }).rotate().resize({
        width: Math.round(Math.max(width, 1) * upscale),
        withoutEnlargement: false
      }).grayscale().sharpen()
    },
    {
      name: 'threshold',
      chain: sharp(imagePath, { limitInputPixels: false }).rotate().resize({
        width: Math.round(Math.max(width, 1) * upscale),
        withoutEnlargement: false
      }).grayscale().normalize().threshold(175)
    }
  ];
  for (const spec of variantSpecs) {
    const filePath = path.join(workDir, `${spec.name}.png`);
    await spec.chain.png().toFile(filePath);
    variants.push({
      name: spec.name,
      path: filePath
    });
  }
  return {
    workDir,
    variants
  };
}

async function runLocalOcr(args, test, imagePath) {
  const lang = tesseractLanguageForTest(test);
  const psmModes = ['4', '6', '11'];
  const attempts = [];
  let workDir = null;
  try {
    const variantBundle = await buildLocalOcrImageVariants(imagePath, test.id);
    workDir = variantBundle.workDir;
    const inputVariants = [{ name: 'original', path: imagePath }, ...variantBundle.variants];
    for (const variant of inputVariants) {
      for (const psm of psmModes) {
        try {
          const { stdout } = await execFileAsync(args.tesseractBin, [
            variant.path,
            'stdout',
            '-l',
            lang,
            '--psm',
            psm
          ], {
            maxBuffer: 1024 * 1024 * 8,
            timeout: args.timeoutMs
          });
          const text = normalizeOcrText(stdout);
          attempts.push({
            variant: variant.name,
            psm,
            chars: text.length,
            text
          });
        } catch (error) {
          attempts.push({
            variant: variant.name,
            psm,
            chars: 0,
            error: error.message,
            text: ''
          });
        }
      }
    }
    const mergedLines = [];
    const seen = new Set();
    for (const attempt of attempts.sort((a, b) => b.chars - a.chars)) {
      for (const line of uniqueLines(attempt.text)) {
        const key = line.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          mergedLines.push(line);
        }
      }
    }
    const mergedText = mergedLines.join('\n').slice(0, 12000);
    const bestAttempt = attempts
      .map((attempt) => ({
        ...attempt,
        score: scoreOcrAttempt(attempt.text)
      }))
      .sort((a, b) => b.score - a.score || b.chars - a.chars)[0] || null;
    const text = normalizeOcrText(bestAttempt?.text || mergedText);
    assertCondition(text.length > 0, `${test.id} local OCR produced empty text`);
    return {
      text,
      engine: 'tesseract',
      lang,
      selectedVariant: bestAttempt?.variant || null,
      selectedPsm: bestAttempt?.psm || null,
      selectedScore: bestAttempt?.score || 0,
      mergedPreview: mergedText.slice(0, 500),
      attempts: attempts.map((attempt) => ({
        variant: attempt.variant,
        psm: attempt.psm,
        chars: attempt.chars,
        error: attempt.error || null
      }))
    };
  } catch (error) {
    throw new Error(`${test.id} local OCR failed with ${lang}: ${error.message}`);
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
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
      data,
      retryAfter: response.headers.get('retry-after')
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithRetry(url, options, args) {
  let lastResponse = null;
  for (let attempt = 0; attempt <= args.retryAttempts; attempt += 1) {
    const response = await fetchJson(url, options, args.timeoutMs);
    if (response.status !== 429) {
      return response;
    }
    lastResponse = response;
    const retryAfterMs = Number(response.retryAfter || 0) > 0
      ? Number(response.retryAfter) * 1000
      : args.retryDelayMs * (attempt + 1);
    if (attempt < args.retryAttempts) {
      await sleep(retryAfterMs);
    }
  }
  return lastResponse;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizePriceNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function sortedNumbers(values) {
  return (Array.isArray(values) ? values : [])
    .map(normalizePriceNumber)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
}

function assertCanonicalNumberNormalizer() {
  const values = ['$2,026', 'NT$ 2,026', '2,026元', 'TWD 2026'];
  const normalized = sortedNumbers(values);
  assertCondition(normalized.length === values.length, 'canonical number normalizer dropped formatted values');
  assertCondition(normalized.every((value) => value === 2026), `canonical number normalizer drifted: ${JSON.stringify(normalized)}`);
}

function extractPrices(items) {
  return sortedNumbers((Array.isArray(items) ? items : []).flatMap((item) => {
    return [item.price, item.amount, item.unitPrice].map(normalizePriceNumber);
  }).filter((value) => value !== null));
}

function assertExpectedPrices(test, label, items, expectedPrices) {
  const expected = sortedNumbers(expectedPrices);
  if (expected.length === 0) {
    return;
  }
  const actual = extractPrices(items);
  assertCondition(JSON.stringify(actual) === JSON.stringify(expected), `${test.id} ${label} prices drifted: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertExpectedCount(test, label, actualItems, exactCount, minCount) {
  const actualCount = Array.isArray(actualItems) ? actualItems.length : 0;
  if (Number.isInteger(exactCount)) {
    assertCondition(actualCount === exactCount, `${test.id} ${label} count drifted: expected ${exactCount}, got ${actualCount}`);
  }
  if (Number.isInteger(minCount)) {
    assertCondition(actualCount >= minCount, `${test.id} ${label} count below minimum: expected at least ${minCount}, got ${actualCount}`);
  }
}

function assertForbiddenNumbers(test, label, items, forbiddenNumbers) {
  const forbidden = new Set(sortedNumbers(forbiddenNumbers));
  if (forbidden.size === 0) {
    return;
  }
  const leaked = extractPrices(items).filter((price) => forbidden.has(price));
  assertCondition(leaked.length === 0, `${test.id} ${label} leaked forbidden price(s): ${JSON.stringify(leaked)}`);
}

function assertForbiddenNames(test, label, items, patterns) {
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    const regexp = new RegExp(pattern, 'i');
    const leaked = (Array.isArray(items) ? items : []).filter((item) => regexp.test(String(item.name || item.label || '')));
    assertCondition(leaked.length === 0, `${test.id} ${label} leaked forbidden member-visible pattern ${pattern}`);
  }
}

function assertBoundary(test, room) {
  assertCondition(room?.serviceBlueprintContract?.roomMode === 'single_direction_private_task_room', `${test.id} room mode drifted`);
  assertCondition(room?.serviceBlueprintContract?.hostProvidedOptionRequired === true, `${test.id} host-provided option boundary missing`);
  const actualContractId = room?.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null;
  assertCondition(actualContractId === test.contractId, `${test.id} contract drifted: expected ${test.contractId}, got ${actualContractId}`);
}

function isAdvisoryThresholdRule(rule) {
  const role = String(rule?.ruleType || rule?.priceRole || '');
  const text = [
    rule?.rawTextEvidence,
    rule?.auditAnchor,
    ...(Array.isArray(rule?.auditAnchors) ? rule.auditAnchors.map((anchor) => anchor.auditAnchor) : [])
  ].filter(Boolean).join(' ');
  return role === 'threshold_amount'
    && /(?:成團門檻|門檻|免運|最低|minimum|threshold|free\s*shipping)/i.test(text);
}

function evaluateOracle(args, test, room) {
  const oracle = test.oracle || {};
  const candidates = Array.isArray(room?.parserCandidates) ? room.parserCandidates : [];
  const memberItems = Array.isArray(room?.items) ? room.items : [];
  const calculationRules = Array.isArray(room?.calculationRules) ? room.calculationRules : [];
  const calculationRulesForExactOracle = args.mode === 'image-plus-local-ocr'
    ? calculationRules.filter((rule) => !isAdvisoryThresholdRule(rule))
    : calculationRules;
  assertBoundary(test, room);
  assertExpectedCount(test, 'extracted row', candidates, oracle.expectedParserCandidates?.itemCount, oracle.expectedParserCandidates?.itemCountAtLeast);
  assertExpectedCount(test, 'member item', memberItems, oracle.expectedSelectableItems?.itemCount, oracle.expectedSelectableItems?.itemCountAtLeast);
  assertExpectedCount(test, 'calculation rule', calculationRulesForExactOracle, oracle.expectedCalculationRules?.count, oracle.expectedCalculationRules?.countAtLeast);
  if (args.mode !== 'image-plus-local-ocr') {
    assertExpectedPrices(test, 'extracted row', candidates, oracle.expectedParserCandidates?.prices);
    assertExpectedPrices(test, 'member item', memberItems, oracle.expectedSelectableItems?.prices);
  }
  assertForbiddenNumbers(test, 'extracted row', candidates, oracle.forbiddenParserCandidateNumbers || oracle.forbiddenNumbers);
  assertForbiddenNumbers(test, 'member item', memberItems, oracle.forbiddenMemberNumbers || oracle.forbiddenNumbers);
  assertForbiddenNames(test, 'member item', memberItems, oracle.forbiddenMemberVisibleItems);
  for (const item of memberItems) {
    assertCondition(item.displaySurface === 'member_selectable', `${test.id} non-selectable role leaked to member item: ${item.name}`);
    assertCondition(item.sourceAssetId, `${test.id} member item missing sourceAssetId: ${item.name}`);
    assertCondition(Array.isArray(item.sourceObservationIds) && item.sourceObservationIds.length > 0, `${test.id} member item missing sourceObservationIds: ${item.name}`);
  }
}

async function createRoom(args) {
  const response = await fetchJsonWithRetry(`${args.baseUrl}/api/rooms`, {
    method: 'POST'
  }, args);
  assertCondition(response.ok, `create room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  return response.data;
}

async function uploadEvidence(args, roomId, test, ownerParticipantId, imageBuffer, localOcrResult = null) {
  const form = new FormData();
  form.append('menuImage', new Blob([imageBuffer], { type: 'image/png' }), `${test.id}.png`);
  form.append('taskType', test.taskType);
  form.append('ownerParticipantId', ownerParticipantId);
  form.append('displayName', 'Image Matrix Merchant');
  if (args.mode === 'image-plus-oracle-text') {
    form.append('ocrText', (test.oracle?.textLines || []).join('\n'));
  } else if (args.mode === 'image-plus-local-ocr') {
    form.append('ocrText', localOcrResult?.text || '');
  }
  const response = await fetchJsonWithRetry(`${args.baseUrl}/api/rooms/${encodeURIComponent(roomId)}/menu`, {
    method: 'POST',
    body: form
  }, args);
  assertCondition(response.ok, `upload failed: HTTP ${response.status} ${response.data?.error || ''}`);
  return response.data;
}

async function runOne(args, test) {
  const imagePath = path.join(args.matrixRoot, test.image.relativePath);
  const image = await sha256File(imagePath);
  assertCondition(image.sha256 === test.image.sha256, `${test.id} image sha256 mismatch`);
  assertCondition(image.byteSize === test.image.byteSize, `${test.id} image byte size mismatch`);
  const localOcrResult = args.mode === 'image-plus-local-ocr'
    ? await runLocalOcr(args, test, imagePath)
    : null;
  const room = await createRoom(args);
  const ownerParticipantId = `matrix-owner-${String(test.id || 'case').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50)}`;
  const parsed = await uploadEvidence(args, room.id, test, ownerParticipantId, image.buffer, localOcrResult);
  evaluateOracle(args, test, parsed);
  return {
    id: test.id,
    ok: true,
    roomId: room.id,
    language: test.language,
    contractId: test.contractId,
    variantId: test.variantId,
    parseStatus: parsed.parseQuality?.status || null,
    highIssueCount: parsed.parseQuality?.highIssueCount || 0,
    memberItemCount: Array.isArray(parsed.items) ? parsed.items.length : 0,
    candidateCount: Array.isArray(parsed.parserCandidates) ? parsed.parserCandidates.length : 0,
    calculationRuleCount: Array.isArray(parsed.calculationRules) ? parsed.calculationRules.length : 0,
    localOcrEngine: localOcrResult?.engine || null,
    localOcrLang: localOcrResult?.lang || null,
    localOcrChars: localOcrResult?.text?.length || 0,
    localOcrSelectedVariant: localOcrResult?.selectedVariant || null,
    localOcrSelectedPsm: localOcrResult?.selectedPsm || null,
    localOcrSelectedScore: localOcrResult?.selectedScore || 0,
    localOcrPreview: localOcrResult?.text?.slice(0, 240) || null,
    localOcrAttempts: localOcrResult?.attempts || []
  };
}

async function writeQuarantine(args, test, error) {
  const dir = path.join(args.outputDir, 'quarantine', test.id);
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    test,
    error: error.message,
    stack: error.stack || null,
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(dir, 'failure.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  assertCanonicalNumberNormalizer();
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifestPath);
  assertCondition(manifest.version === 'acmcp-image-fixture-oracle.v1', 'unsupported manifest version');
  assertCondition(manifest.artifactPolicy?.checksumRequired === true, 'manifest must require checksum validation');
  const selectedTests = args.limit > 0 ? manifest.tests.slice(0, args.limit) : manifest.tests;
  const results = [];
  const startedAt = Date.now();
  await fs.mkdir(args.outputDir, { recursive: true });
  for (const test of selectedTests) {
    try {
      if (results.length > 0 && args.delayMs > 0) {
        await sleep(args.delayMs);
      }
      const result = await runOne(args, test);
      results.push(result);
      console.log(`[PASS] ${test.id}`);
    } catch (error) {
      const result = {
        id: test.id,
        ok: false,
        error: error.message,
        language: test.language,
        contractId: test.contractId,
        variantId: test.variantId
      };
      results.push(result);
      await writeQuarantine(args, test, error);
      console.log(`[FAIL] ${test.id} ${error.message}`);
      if (args.failFast) {
        break;
      }
    }
  }
  const summary = {
    ok: results.every((result) => result.ok),
    baseUrl: args.baseUrl,
    mode: args.mode,
    tesseractBin: args.mode === 'image-plus-local-ocr' ? args.tesseractBin : null,
    delayMs: args.delayMs,
    retryAttempts: args.retryAttempts,
    retryDelayMs: args.retryDelayMs,
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    elapsedMs: Date.now() - startedAt
  };
  const report = {
    summary,
    modeClaims: {
      'image-only': 'Uploads only the image. This is a negative canary unless the target deployment has an explicit image-reading provider configured.',
      'image-plus-local-ocr': 'Runs OCR on the operator machine first, then writes OCR metadata and a draft proposal. The hosted room is not the OCR engine.',
      'image-plus-oracle-text': 'Uploads the image plus locked oracle text to validate checksum, contract routing, guardrails, member-visible masks, and HITL state transitions.'
    },
    results
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(args.outputDir, `image-matrix-stress-${stamp}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ...summary,
    reportPath
  }, null, 2));
  if (!summary.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
