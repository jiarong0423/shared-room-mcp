import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const defaultMatrixRoot = process.env.IMAGE_MATRIX_ROOT || path.join('fixtures', 'image-matrix');
const defaultOutputPath = 'fixtures/image-fixture-manifest.json';

function parseArgs(argv) {
  const args = {
    matrixRoot: defaultMatrixRoot,
    outputPath: defaultOutputPath,
    includeEnglishExtension: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--matrix-root' && next) {
      args.matrixRoot = path.resolve(next);
      index += 1;
    } else if (arg === '--out' && next) {
      args.outputPath = path.resolve(next);
      index += 1;
    } else if (arg === '--base-only') {
      args.includeEnglishExtension = false;
    }
  }
  return args;
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
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    byteSize: buffer.length
  };
}

function normalizeLanguage(language) {
  if (language === 'zh' || language === 'zh-TW') {
    return 'zh-TW';
  }
  if (language === 'en' || language === 'en-US') {
    return 'en';
  }
  return String(language || '');
}

function sourceScenarioNumber(sourceScenarioId) {
  const match = String(sourceScenarioId || '').match(/[0-9]{2}/);
  return match ? match[0] : '';
}

function buildOracle(sourceScenario) {
  const expect = sourceScenario.expect && typeof sourceScenario.expect === 'object'
    ? sourceScenario.expect
    : {};
  return {
    expectedSelectableItems: {
      itemCount: expect.memberItemCount ?? null,
      itemCountAtLeast: expect.memberItemCountAtLeast ?? null,
      prices: Array.isArray(expect.memberPrices) ? expect.memberPrices : []
    },
    expectedCalculationRules: {
      count: expect.calculationRuleCount ?? null,
      countAtLeast: expect.calculationRuleCountAtLeast ?? null,
      priceRoles: expect.priceRoles || {}
    },
    expectedParserCandidates: {
      itemCount: expect.itemCount ?? null,
      itemCountAtLeast: expect.itemCountAtLeast ?? null,
      prices: Array.isArray(expect.candidatePrices) ? expect.candidatePrices : []
    },
    forbiddenNumbers: Array.from(new Set([
      ...(Array.isArray(expect.forbiddenPrices) ? expect.forbiddenPrices : []),
      ...(Array.isArray(expect.forbiddenCandidatePrices) ? expect.forbiddenCandidatePrices : []),
      ...(Array.isArray(expect.forbiddenMemberPrices) ? expect.forbiddenMemberPrices : [])
    ].map(Number).filter(Number.isFinite))).sort((a, b) => a - b),
    forbiddenParserCandidateNumbers: Array.from(new Set([
      ...(Array.isArray(expect.forbiddenCandidatePrices) ? expect.forbiddenCandidatePrices : [])
    ].map(Number).filter(Number.isFinite))).sort((a, b) => a - b),
    forbiddenMemberNumbers: Array.from(new Set([
      ...(Array.isArray(expect.forbiddenPrices) ? expect.forbiddenPrices : []),
      ...(Array.isArray(expect.forbiddenMemberPrices) ? expect.forbiddenMemberPrices : [])
    ].map(Number).filter(Number.isFinite))).sort((a, b) => a - b),
    forbiddenMemberVisibleItems: Array.from(new Set([
      ...(Array.isArray(expect.forbiddenNamePatterns) ? expect.forbiddenNamePatterns : []),
      ...(Array.isArray(expect.forbiddenMemberNamePatterns) ? expect.forbiddenMemberNamePatterns : []),
      ...(Array.isArray(expect.forbiddenBaseItemPatterns) ? expect.forbiddenBaseItemPatterns : [])
    ].map(String).filter(Boolean))).sort(),
    requiredSizeItems: Array.isArray(expect.requiredSizeItems) ? expect.requiredSizeItems : [],
    allCategories: Array.isArray(expect.allCategories) ? expect.allCategories : [],
    textLines: Array.isArray(sourceScenario.textLines) ? sourceScenario.textLines : []
  };
}

function imageFileName(prefix, slug, variantId) {
  return `${prefix}_${slug}_${variantId}.png`;
}

async function buildBaseTests(matrixRoot, baseManifest, sourceByScenario) {
  const tests = [];
  for (const scenario of baseManifest.scenarios || []) {
    const sourceScenarioId = scenario.id;
    const sourceScenario = sourceByScenario.get(sourceScenarioId);
    if (!sourceScenario) {
      throw new Error(`Missing source scenario for ${sourceScenarioId}`);
    }
    for (const variantId of scenario.generated || []) {
      const fileName = imageFileName(sourceScenarioId, scenario.slug, variantId);
      const relativePath = path.join('generated', fileName);
      const absolutePath = path.join(matrixRoot, relativePath);
      const image = await sha256File(absolutePath);
      tests.push({
        id: `${sourceScenarioId}_${scenario.slug}_${variantId}`,
        scenarioId: sourceScenarioId,
        sourceScenarioId,
        language: normalizeLanguage(scenario.language),
        contractId: scenario.contractId,
        archetypeId: scenario.archetypeId,
        taskType: sourceScenario.taskType,
        sourceKind: scenario.sourceKind || 'unknown_source',
        variantId,
        ocrRiskLevel: (baseManifest.variants || []).find((variant) => variant.id === variantId)?.ocrRisk || 'medium',
        image: {
          relativePath,
          ...image
        },
        oracle: buildOracle(sourceScenario)
      });
    }
  }
  return tests;
}

async function buildEnglishTests(matrixRoot, englishManifest, sourceByScenario) {
  const tests = [];
  for (const scenario of englishManifest.scenarios || []) {
    const sourceScenarioId = scenario.sourceScenarioId;
    const sourceScenario = sourceByScenario.get(sourceScenarioId);
    if (!sourceScenario) {
      throw new Error(`Missing source scenario for ${sourceScenarioId}`);
    }
    for (const variantId of scenario.generated || []) {
      const fileName = imageFileName(scenario.id, scenario.slug, variantId);
      const relativePath = path.join('english-extension', 'generated', fileName);
      const absolutePath = path.join(matrixRoot, relativePath);
      const image = await sha256File(absolutePath);
      tests.push({
        id: `${scenario.id}_${scenario.slug}_${variantId}`,
        scenarioId: scenario.id,
        sourceScenarioId,
        language: normalizeLanguage(scenario.language),
        contractId: scenario.contractId,
        archetypeId: sourceScenario.archetypeId,
        taskType: sourceScenario.taskType,
        sourceKind: `english_${sourceScenarioNumber(sourceScenarioId)}_${sourceScenario.taskType}`,
        variantId,
        ocrRiskLevel: (englishManifest.variants || []).find((variant) => variant.id === variantId)?.ocrRisk || 'medium',
        image: {
          relativePath,
          ...image
        },
        oracle: buildOracle(sourceScenario)
      });
    }
  }
  return tests;
}

async function main() {
  const args = parseArgs(process.argv);
  const fixture = await readJson(new URL('../fixtures/adaptive-parser-matrix.json', import.meta.url));
  const sourceByScenario = new Map((fixture.scenarios || []).map((scenario, index) => {
    const id = `S${String(index + 1).padStart(2, '0')}`;
    return [id, scenario];
  }));
  const baseManifest = await readJson(path.join(args.matrixRoot, 'manifests', 'image_fixture_queue.json'));
  const tests = await buildBaseTests(args.matrixRoot, baseManifest, sourceByScenario);
  if (args.includeEnglishExtension) {
    const englishManifest = await readJson(path.join(args.matrixRoot, 'english-extension', 'manifests', 'english_fixture_queue.json'));
    tests.push(...await buildEnglishTests(args.matrixRoot, englishManifest, sourceByScenario));
  }
  const manifest = {
    version: 'adaptive-contract-mcp-image-fixture-oracle.v1',
    project: 'Adaptive Contract MCP',
    generatedAt: new Date().toISOString(),
    artifactPolicy: {
      largeImagesExternal: true,
      checksumRequired: true,
      oracleReadOnly: true,
      actualOutputQuarantinedOnFail: true
    },
    tests
  };
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    outputPath: args.outputPath,
    testCount: tests.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
