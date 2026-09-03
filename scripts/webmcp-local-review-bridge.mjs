import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const defaultBaseUrl = 'https://shared-room-mcp-next.zeabur.app';
const safeOutputRoots = [
  path.resolve(os.tmpdir()),
  '/private/tmp',
  '/tmp'
];
const allowedApiStyles = new Set(['chat', 'responses']);
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

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.TARGET_API_BASE || process.env.WEBMCP_BASE_URL || defaultBaseUrl,
    baseUrlExplicit: Boolean(process.env.TARGET_API_BASE || process.env.WEBMCP_BASE_URL),
    roomId: '',
    imagePath: '',
    participantId: process.env.WEBMCP_PARTICIPANT_ID || '',
    taskType: process.env.WEBMCP_TASK_TYPE || 'auto',
    tesseractBin: process.env.TESSERACT_BIN || 'tesseract',
    ocrLang: process.env.WEBMCP_OCR_LANG || 'eng',
    localVisionBaseUrl: process.env.LOCAL_VISION_BASE_URL || process.env.LOCAL_VISION_ENDPOINT || '',
    localVisionModel: process.env.LOCAL_VISION_MODEL || '',
    localVisionApiKey: process.env.LOCAL_VISION_API_KEY || '',
    localVisionApiStyle: process.env.LOCAL_VISION_API_STYLE || 'chat',
    timeoutMs: Math.max(8000, Math.min(180000, Number(process.env.LOCAL_VISION_TIMEOUT_MS || 60000))),
    maxOutputTokens: Math.max(1024, Math.min(64000, Number(process.env.LOCAL_VISION_MAX_OUTPUT_TOKENS || 16000))),
    imageDetail: process.env.LOCAL_VISION_IMAGE_DETAIL || 'high',
    outputDir: process.env.WEBMCP_BRIDGE_OUTPUT_DIR || path.join(os.tmpdir(), 'webmcp-local-review-bridge'),
    dryRun: true,
    writeCloudProposal: false,
    allowOcrOnly: false,
    skipOcr: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--base-url' && next) {
      args.baseUrl = next;
      args.baseUrlExplicit = true;
      index += 1;
    } else if (arg === '--room-id' && next) {
      args.roomId = next;
      index += 1;
    } else if (arg === '--image' && next) {
      args.imagePath = next;
      index += 1;
    } else if (arg === '--participant-id' && next) {
      args.participantId = next;
      index += 1;
    } else if (arg === '--task-type' && next) {
      args.taskType = next;
      index += 1;
    } else if (arg === '--tesseract-bin' && next) {
      args.tesseractBin = next;
      index += 1;
    } else if (arg === '--ocr-lang' && next) {
      args.ocrLang = next;
      index += 1;
    } else if (arg === '--local-vision-base-url' && next) {
      args.localVisionBaseUrl = next;
      index += 1;
    } else if (arg === '--local-vision-model' && next) {
      args.localVisionModel = next;
      index += 1;
    } else if (arg === '--local-vision-api-style' && next) {
      args.localVisionApiStyle = next;
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(8000, Math.min(180000, Number(next) || args.timeoutMs));
      index += 1;
    } else if (arg === '--max-output-tokens' && next) {
      args.maxOutputTokens = Math.max(1024, Math.min(64000, Number(next) || args.maxOutputTokens));
      index += 1;
    } else if (arg === '--image-detail' && next) {
      args.imageDetail = next;
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
      args.writeCloudProposal = false;
    } else if (arg === '--write-cloud-proposal') {
      args.dryRun = false;
      args.writeCloudProposal = true;
    } else if (arg === '--allow-ocr-only') {
      args.allowOcrOnly = true;
    } else if (arg === '--skip-ocr') {
      args.skipOcr = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  args.baseUrl = String(args.baseUrl || '').trim().replace(/\/+$/, '');
  args.localVisionBaseUrl = String(args.localVisionBaseUrl || '').trim().replace(/\/+$/, '');
  args.localVisionModel = String(args.localVisionModel || '').trim();
  args.localVisionApiStyle = allowedApiStyles.has(String(args.localVisionApiStyle).toLowerCase())
    ? String(args.localVisionApiStyle).toLowerCase()
    : 'chat';
  args.taskType = allowedTaskTypes.has(String(args.taskType || '').trim())
    ? String(args.taskType).trim()
    : 'auto';
  args.imagePath = args.imagePath ? path.resolve(args.imagePath) : '';
  args.outputDir = path.resolve(args.outputDir);

  return args;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/webmcp-local-review-bridge.mjs --room-id <room> --image <path> --participant-id <ownerParticipantId> [options]',
    '',
    'Required for cloud write:',
    '  --room-id <id>',
    '  --image <local image path>',
    '  --participant-id <owner participant id>',
    '',
    'Local vision options:',
    '  --local-vision-base-url http://127.0.0.1:1234',
    '  --local-vision-model <model>',
    '  --local-vision-api-style chat|responses',
    '',
    'Safety options:',
    '  --write-cloud-proposal',
    '                      Write the local-vision-backed proposal to the cloud room.',
    '  --dry-run           Build the proposal payload without writing to the cloud room.',
    '  --allow-ocr-only    Permit an OCR-only payload preview in dry-run only; cloud proposal writes still require local vision.',
    '  --skip-ocr          Skip tesseract and rely only on local vision.'
  ].join('\n'));
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeText(value, maxLength = 12000) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}

function normalizeBoundedText(value, maxLength = 700) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'image/png';
}

async function readImageEvidence(imagePath) {
  const buffer = await fs.readFile(imagePath);
  const metadata = await sharp(buffer, { failOn: 'none', limitInputPixels: 48_000_000 }).metadata();
  return {
    buffer,
    mimeType: detectMimeType(imagePath),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    byteSize: buffer.length,
    width: metadata.width || null,
    height: metadata.height || null
  };
}

async function buildOcrVariants(imagePath) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webmcp-bridge-ocr-'));
  const variants = [{ name: 'original', path: imagePath }];
  const metadata = await sharp(imagePath, { failOn: 'none', limitInputPixels: 48_000_000 }).metadata();
  const width = Number(metadata.width || 0);
  const targetWidth = width > 0 && width < 2200 ? 2200 : width || 2200;
  const grayPath = path.join(workDir, 'gray-sharp.png');
  const thresholdPath = path.join(workDir, 'threshold.png');
  await sharp(imagePath, { failOn: 'none', limitInputPixels: 48_000_000 })
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .sharpen()
    .png()
    .toFile(grayPath);
  await sharp(imagePath, { failOn: 'none', limitInputPixels: 48_000_000 })
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .threshold(175)
    .png()
    .toFile(thresholdPath);
  variants.push({ name: 'gray-sharp', path: grayPath });
  variants.push({ name: 'threshold', path: thresholdPath });
  return { workDir, variants };
}

function scoreOcrText(text) {
  const normalized = normalizeText(text);
  const lineCount = normalized ? normalized.split('\n').length : 0;
  const priceHits = (normalized.match(/(?:NT\$|TWD|\$|元|圓|塊)?\s*[0-9]{1,4}(?:\.[0-9]{1,2})?/gi) || []).length;
  const tableHits = (normalized.match(/(?:price|menu|receipt|ticket|fare|fee|total|subtotal|service|tax|small|medium|large|coffee|tea|adult|student|child|rental|deposit)/gi) || []).length;
  return lineCount * 3 + Math.min(priceHits, 40) * 6 + tableHits * 2 + Math.min(normalized.length, 1200) / 60;
}

async function runLocalOcr(args, imagePath) {
  if (args.skipOcr) {
    return {
      enabled: false,
      engine: null,
      lang: args.ocrLang,
      text: '',
      selectedVariant: null,
      selectedPsm: null,
      attempts: []
    };
  }

  const psmModes = ['4', '6', '11'];
  const attempts = [];
  let workDir = null;
  try {
    const bundle = await buildOcrVariants(imagePath);
    workDir = bundle.workDir;
    for (const variant of bundle.variants) {
      for (const psm of psmModes) {
        try {
          const { stdout } = await execFileAsync(args.tesseractBin, [
            variant.path,
            'stdout',
            '-l',
            args.ocrLang,
            '--psm',
            psm
          ], {
            timeout: Math.max(8000, args.timeoutMs),
            maxBuffer: 1024 * 1024 * 8
          });
          const text = normalizeText(stdout);
          attempts.push({
            variant: variant.name,
            psm,
            chars: text.length,
            score: scoreOcrText(text),
            text
          });
        } catch (error) {
          attempts.push({
            variant: variant.name,
            psm,
            chars: 0,
            score: 0,
            error: error.message,
            text: ''
          });
        }
      }
    }
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  const best = attempts.sort((a, b) => b.score - a.score || b.chars - a.chars)[0] || null;
  return {
    enabled: true,
    engine: 'tesseract',
    lang: args.ocrLang,
    text: best?.text || '',
    selectedVariant: best?.variant || null,
    selectedPsm: best?.psm || null,
    attempts: attempts.map((attempt) => ({
      variant: attempt.variant,
      psm: attempt.psm,
      chars: attempt.chars,
      score: attempt.score,
      error: attempt.error || null
    }))
  };
}

function buildLocalVisionPrompt(args, ocrText) {
  return [
    'You are the local visual review layer for Shared Room MCP.',
    'Read the attached image directly. Use OCR text only as a noisy hint, not as final truth.',
    'Return strict JSON only. Do not include markdown.',
    '',
    'Required JSON shape:',
    '{',
    '  "menuType": "general|drink|mixed",',
    '  "structuredItems": [',
    '    {',
    '      "name": "visible item name",',
    '      "price": 123,',
    '      "category": "main|side|snack|soup|dessert|drink|set|service|ticket|rental|venue|addon|other",',
    '      "priceRole": "line_item|discount|tax_and_fee|deposit|prepayment_down|aggregate_subtotal|aggregate_grand_total",',
    '      "sourceNumberClass": "currency_amount|age_range|itinerary_index|percentage_rate|receipt_total|payment_amount|points_value|distance|duration|quantity|unknown",',
    '      "rawTextEvidence": "short visible evidence",',
    '      "confidence": 0.0,',
    '      "reviewFlags": ["review_required"]',
    '    }',
    '  ],',
    '  "visualReviewNotes": ["short note"],',
    '  "warnings": ["short warning"]',
    '}',
    '',
    `Task type requested by host: ${args.taskType}`,
    '',
    'Rules:',
    '- Only include prices that are visible as selectable, shareable, or billable evidence.',
    '- Do not turn phone numbers, dates, addresses, calories, capacity, distance, age ranges, percentages, receipt ids, or totals into selectable items.',
    '- For size tables, merge one product into one item and describe size options in rawTextEvidence or review notes.',
    '- Deposits, service fees, tax, discounts, thresholds, and totals must be review-only evidence, not member-facing final decisions.',
    '- Every result is a draft for host review. The host must visually compare the image before approval.',
    '',
    'LOCAL_OCR_TEXT_START',
    ocrText || '',
    'LOCAL_OCR_TEXT_END'
  ].join('\n');
}

function buildChatMessages(image, prompt, detail) {
  return [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: prompt
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
          detail
        }
      }
    ]
  }];
}

function buildResponsesInput(image, prompt, detail) {
  return [{
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: prompt
      },
      {
        type: 'input_image',
        image_url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
        detail
      }
    ]
  }];
}

function localVisionEndpoint(args, route) {
  const base = args.localVisionBaseUrl.replace(/\/+$/, '');
  if (base.endsWith('/v1') && route.startsWith('/v1/')) {
    return `${base}${route.slice(3)}`;
  }
  return `${base}${route}`;
}

function extractOutputText(response, apiStyle) {
  if (apiStyle === 'responses') {
    if (typeof response?.output_text === 'string') {
      return response.output_text.trim();
    }
    const chunks = [];
    for (const outputItem of Array.isArray(response?.output) ? response.output : []) {
      for (const contentItem of Array.isArray(outputItem?.content) ? outputItem.content : []) {
        if (typeof contentItem?.text === 'string') {
          chunks.push(contentItem.text);
        }
      }
    }
    return chunks.join('\n').trim();
  }

  const chunks = [];
  for (const choice of Array.isArray(response?.choices) ? response.choices : []) {
    const content = choice?.message?.content;
    if (typeof content === 'string') {
      chunks.push(content);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item?.text === 'string') {
          chunks.push(item.text);
        }
      }
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  assertCondition(raw, 'local vision returned empty content');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch (directError) {
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(candidate.slice(objectStart, objectEnd + 1));
    }
    throw directError;
  }
}

function normalizeStructuredItems(value) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = [];
  for (const row of rows) {
    const name = normalizeBoundedText(row?.name, 120);
    const price = Number(row?.price);
    if (!name || !Number.isFinite(price) || price <= 0 || price > 100000) {
      continue;
    }
    normalized.push({
      name,
      price: Math.round(price),
      category: normalizeBoundedText(row?.category || 'other', 40),
      priceRole: normalizeBoundedText(row?.priceRole || 'line_item', 40),
      sourceNumberClass: normalizeBoundedText(row?.sourceNumberClass || 'currency_amount', 40),
      rawTextEvidence: normalizeBoundedText(row?.rawTextEvidence || name, 220),
      confidence: Math.max(0, Math.min(1, Number(row?.confidence || 0))),
      reviewFlags: Array.isArray(row?.reviewFlags)
        ? row.reviewFlags.map((flag) => normalizeBoundedText(flag, 48)).filter(Boolean).slice(0, 10)
        : ['review_required']
    });
  }
  return normalized.slice(0, 40);
}

async function runLocalVision(args, image, ocrText) {
  if (!args.localVisionBaseUrl || !args.localVisionModel) {
    return {
      configured: false,
      ok: false,
      model: null,
      rawText: '',
      structuredItems: [],
      visualReviewNotes: ['Local vision was not configured.'],
      warnings: ['No local vision model was available for OCR correction.']
    };
  }

  const endpoint = localVisionEndpoint(
    args,
    args.localVisionApiStyle === 'responses' ? '/v1/responses' : '/v1/chat/completions'
  );
  const prompt = buildLocalVisionPrompt(args, ocrText);
  const headers = { 'Content-Type': 'application/json' };
  if (args.localVisionApiKey) {
    headers.Authorization = `Bearer ${args.localVisionApiKey}`;
  }
  const body = args.localVisionApiStyle === 'responses'
    ? {
      model: args.localVisionModel,
      input: buildResponsesInput(image, prompt, args.imageDetail),
      text: { format: { type: 'json_object' } },
      max_output_tokens: args.maxOutputTokens,
      store: false
    }
    : {
      model: args.localVisionModel,
      messages: buildChatMessages(image, prompt, args.imageDetail),
      temperature: 0.1,
      max_tokens: args.maxOutputTokens,
      response_format: { type: 'json_object' }
    };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, args.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || response.statusText || 'local vision request failed';
      throw new Error(`Local Vision HTTP ${response.status}: ${message}`);
    }
    const rawText = extractOutputText(payload, args.localVisionApiStyle);
    const parsed = parseJsonFromText(rawText);
    const structuredItems = normalizeStructuredItems(parsed.structuredItems || parsed.items);
    return {
      configured: true,
      ok: structuredItems.length > 0,
      model: args.localVisionModel,
      rawText,
      menuType: normalizeBoundedText(parsed.menuType || 'general', 20),
      structuredItems,
      visualReviewNotes: Array.isArray(parsed.visualReviewNotes)
        ? parsed.visualReviewNotes.map((note) => normalizeBoundedText(note, 220)).filter(Boolean).slice(0, 10)
        : [normalizeBoundedText(parsed.visualReviewNotes || 'Local vision generated a host-review draft.', 220)],
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.map((warning) => normalizeBoundedText(warning, 220)).filter(Boolean).slice(0, 10)
        : []
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
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
    clearTimeout(timeoutId);
  }
}

async function readRoom(args) {
  const response = await fetchJson(`${args.baseUrl}/api/rooms/${encodeURIComponent(args.roomId)}`, {}, 30000);
  assertCondition(response.ok, `room read failed: HTTP ${response.status} ${response.data?.error || ''}`);
  return response.data;
}

function buildProposalPayload(args, room, image, ocrResult, visionResult) {
  const ocrPreview = normalizeText(ocrResult.text, 1200);
  const structuredItems = visionResult.structuredItems || [];
  const itemPreview = structuredItems
    .slice(0, 8)
    .map((item) => `${item.name} ${item.price}`)
    .join(', ');
  const sourceMode = visionResult.ok
    ? 'local_ocr_plus_local_vision'
    : 'local_ocr_only_bridge_draft';
  return {
    participantId: args.participantId,
    requesterId: args.participantId,
    proposalType: 'semantic_repair_draft',
    riskLevel: 'needs_human_review',
    summary: structuredItems.length > 0
      ? `Photo review draft prepared ${structuredItems.length} item(s): ${itemPreview}`.slice(0, 360)
      : 'Photo text was read, but the visual check did not return usable rows.',
    rationale: [
      visionResult.ok
        ? 'This draft was prepared from the photo with text reading and a visual check.'
        : 'Only photo text was read. A visual check is still needed before approval.',
      'The host should compare the draft with the original image before approving.'
    ].join(' ').slice(0, 700),
    payload: {
      sourceMode,
      hostReviewRequired: true,
      roomId: room.id,
      taskType: args.taskType,
      localVisionConfigured: visionResult.configured,
      localVisionModel: visionResult.model,
      evidenceImageSha256: image.sha256,
      evidenceImageBytes: image.byteSize,
      evidenceImageWidth: image.width,
      evidenceImageHeight: image.height,
      rawOcrPreview: ocrPreview,
      localOcr: {
        engine: ocrResult.engine,
        lang: ocrResult.lang,
        selectedVariant: ocrResult.selectedVariant,
        selectedPsm: ocrResult.selectedPsm,
        attempts: ocrResult.attempts
      },
      structuredItems,
      visualReviewNotes: visionResult.visualReviewNotes,
      warnings: [
        ...(Array.isArray(visionResult.warnings) ? visionResult.warnings : []),
        'This proposal is draft-only and requires host review before any member-facing state change.'
      ],
      createdAt: new Date().toISOString()
    }
  };
}

async function sendProposal(args, proposalPayload) {
  const response = await fetchJson(`${args.baseUrl}/api/rooms/${encodeURIComponent(args.roomId)}/agent-proposals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(proposalPayload)
  }, 30000);
  assertCondition(response.ok, `proposal write failed: HTTP ${response.status} ${response.data?.error || ''}`);
  return response.data;
}

async function writeReport(args, report) {
  const outputDir = path.resolve(args.outputDir);
  const isSafeOutputDir = safeOutputRoots.some((root) => outputDir === root || outputDir.startsWith(`${root}${path.sep}`));
  assertCondition(isSafeOutputDir, `unsafe --output-dir: bridge reports contain private OCR evidence and must stay under tmp (${safeOutputRoots.join(', ')})`);
  await fs.mkdir(args.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(args.outputDir, `webmcp-local-review-bridge-${stamp}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv);
  assertCondition(args.baseUrl, 'missing --base-url');
  assertCondition(args.roomId, 'missing --room-id');
  assertCondition(args.imagePath, 'missing --image');
  assertCondition(args.dryRun || args.writeCloudProposal, 'cloud writes require --write-cloud-proposal');
  assertCondition(args.dryRun || args.baseUrlExplicit, 'cloud proposal writes require an explicit --base-url or WEBMCP_BASE_URL/TARGET_API_BASE');
  assertCondition(args.dryRun || args.participantId, 'missing --participant-id for cloud proposal write');
  assertCondition(
    args.localVisionBaseUrl && args.localVisionModel || args.dryRun && args.allowOcrOnly,
    'missing local vision config; --allow-ocr-only is dry-run only and cannot write a cloud proposal'
  );

  const [room, image] = await Promise.all([
    readRoom(args),
    readImageEvidence(args.imagePath)
  ]);
  if (!args.dryRun) {
    assertCondition(room.ownerParticipantId, 'target room has no ownerParticipantId; apply a host name in the room first');
    assertCondition(room.ownerParticipantId === args.participantId, 'participant id does not match the target room ownerParticipantId');
  }

  const ocrResult = await runLocalOcr(args, args.imagePath);
  const visionResult = await runLocalVision(args, image, ocrResult.text);
  if (!visionResult.ok && !(args.dryRun && args.allowOcrOnly)) {
    throw new Error('local vision did not produce structured items; refusing to create a cloud proposal from OCR-only data');
  }

  const proposalPayload = buildProposalPayload(args, room, image, ocrResult, visionResult);
  const result = args.dryRun
    ? { ok: true, proposal: null, room: null }
    : await sendProposal(args, proposalPayload);
  const report = {
    ok: true,
    dryRun: args.dryRun,
    baseUrl: args.baseUrl,
    roomId: args.roomId,
    participantId: args.participantId ? '[provided]' : null,
    ownerParticipantId: room.ownerParticipantId ? '[room_owner_present]' : null,
    localVisionConfigured: Boolean(args.localVisionBaseUrl && args.localVisionModel),
    localVisionApiStyle: args.localVisionApiStyle,
    taskType: args.taskType,
    evidenceImageSha256: image.sha256,
    ocrChars: ocrResult.text.length,
    structuredItemCount: proposalPayload.payload.structuredItems.length,
    proposalId: result.proposal?.id || null,
    proposalStatus: result.proposal?.status || null,
    proposalPayload,
    cloudResult: args.dryRun ? null : {
      ok: result.ok,
      proposal: result.proposal
    }
  };
  const reportPath = await writeReport(args, report);
  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    roomId: args.roomId,
    localVisionConfigured: report.localVisionConfigured,
    ocrChars: report.ocrChars,
    structuredItemCount: report.structuredItemCount,
    proposalId: report.proposalId,
    proposalStatus: report.proposalStatus,
    reportPath
  }, null, 2));
}

main().catch(async (error) => {
  const args = parseArgs(process.argv);
  const report = {
    ok: false,
    dryRun: args.dryRun,
    baseUrl: args.baseUrl,
    roomId: args.roomId,
    error: error.message,
    createdAt: new Date().toISOString()
  };
  try {
    const reportPath = await writeReport(args, report);
    console.error(JSON.stringify({ ok: false, error: error.message, reportPath }, null, 2));
  } catch (reportError) {
    console.error(JSON.stringify({ ok: false, error: error.message, reportError: reportError.message }, null, 2));
  }
  process.exit(1);
});
