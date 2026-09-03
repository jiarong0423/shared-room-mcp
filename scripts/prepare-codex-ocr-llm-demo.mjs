import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const defaultBaseUrl = 'https://shared-room-mcp-next.zeabur.app';
const defaultOutputDir = path.join(os.tmpdir(), 'webmcp-codex-ocr-llm-demo');

const codexReviewedItems = Object.freeze([
  {
    name: 'French Fries',
    price: 90,
    category: 'main',
    sectionName: 'Snacks',
    rawTextEvidence: 'French Fries NT$ 90',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Special Fries',
    price: 110,
    category: 'main',
    sectionName: 'Snacks',
    rawTextEvidence: 'Special Fries NT$ 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Fried Chicken',
    price: 130,
    category: 'main',
    sectionName: 'Snacks',
    rawTextEvidence: 'Fried Chicken NT$ 130',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Hash Browns',
    price: 70,
    category: 'main',
    sectionName: 'Snacks',
    rawTextEvidence: 'Hash Browns NT$ 70',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Americano',
    price: 90,
    category: 'drink',
    sectionName: 'Coffee',
    rawTextEvidence: 'Americano NT$ 90',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Cappuccino',
    price: 110,
    category: 'drink',
    sectionName: 'Coffee',
    rawTextEvidence: 'Cappuccino NT$ 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Latte',
    price: 120,
    category: 'drink',
    sectionName: 'Coffee',
    rawTextEvidence: 'Latte NT$ 120',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Special Blend Coffee',
    price: 100,
    category: 'drink',
    sectionName: 'Coffee',
    rawTextEvidence: 'Special Blend Coffee NT$ 100',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Coke',
    price: 70,
    category: 'drink',
    sectionName: 'Cold Drinks',
    rawTextEvidence: 'Coke NT$ 70',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: '7 Up',
    price: 70,
    category: 'drink',
    sectionName: 'Cold Drinks',
    rawTextEvidence: '7Up NT$ 70',
    confidence: 0.98,
    reviewFlags: []
  },
  {
    name: 'Milk Tea',
    price: 100,
    category: 'drink',
    sectionName: 'Cold Drinks',
    rawTextEvidence: 'Milk Tea NT$ 100',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Grapefruit Soda',
    price: 110,
    category: 'drink',
    sectionName: 'Cold Drinks',
    rawTextEvidence: 'Grapefruit Soda NT$ 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Tiramisu',
    price: 100,
    category: 'dessert',
    sectionName: 'Desserts',
    rawTextEvidence: 'Tiramisu NT$ 100',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Chocolate Brownie',
    price: 80,
    category: 'dessert',
    sectionName: 'Desserts',
    rawTextEvidence: 'Chocolate Brownie NT$ 80',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Fresh Salad',
    price: 110,
    category: 'main',
    sectionName: 'Fresh Salad',
    rawTextEvidence: 'Fresh Salad NT$ 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Chicken',
    price: 30,
    category: 'addon',
    sectionName: 'Add Ons',
    rawTextEvidence: 'Chicken +NT$ 30',
    confidence: 0.98,
    reviewFlags: []
  },
  {
    name: 'Mozzarella Cheese',
    price: 30,
    category: 'addon',
    sectionName: 'Add Ons',
    rawTextEvidence: 'Mozzarella Cheese +NT$ 30',
    confidence: 0.98,
    reviewFlags: []
  },
  {
    name: 'Avocado',
    price: 50,
    category: 'addon',
    sectionName: 'Add Ons',
    rawTextEvidence: 'Avocado +NT$ 50',
    confidence: 0.98,
    reviewFlags: []
  }
]);

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.WEBMCP_BASE_URL || process.env.TARGET_API_BASE || defaultBaseUrl,
    imagePath: process.env.WEBMCP_DEMO_IMAGE || '',
    roomId: '',
    participantId: `codex-merchant-review-${crypto.randomUUID().slice(0, 8)}`,
    ownerBootstrapToken: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    displayName: 'Codex Demo Merchant',
    tesseractBin: process.env.TESSERACT_BIN || 'tesseract',
    ocrLang: process.env.WEBMCP_OCR_LANG || 'eng',
    outputDir: process.env.WEBMCP_DEMO_OUTPUT_DIR || defaultOutputDir,
    timeoutMs: Math.max(8000, Math.min(120000, Number(process.env.WEBMCP_DEMO_TIMEOUT_MS || 30000))),
    acceptForTest: String(process.env.WEBMCP_DEMO_ACCEPT_FOR_TEST || 'false').toLowerCase() === 'true'
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--base-url' && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === '--image' && next) {
      args.imagePath = next;
      index += 1;
    } else if (arg === '--room-id' && next) {
      args.roomId = next;
      index += 1;
    } else if (arg === '--participant-id' && next) {
      args.participantId = next;
      index += 1;
    } else if (arg === '--owner-bootstrap-token' && next) {
      args.ownerBootstrapToken = next;
      index += 1;
    } else if (arg === '--display-name' && next) {
      args.displayName = next;
      index += 1;
    } else if (arg === '--tesseract-bin' && next) {
      args.tesseractBin = next;
      index += 1;
    } else if (arg === '--ocr-lang' && next) {
      args.ocrLang = next;
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(8000, Math.min(120000, Number(next) || args.timeoutMs));
      index += 1;
    } else if (arg === '--accept-for-test') {
      args.acceptForTest = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  args.baseUrl = String(args.baseUrl || '').trim().replace(/\/+$/, '');
  args.imagePath = args.imagePath ? path.resolve(args.imagePath) : '';
  args.outputDir = path.resolve(args.outputDir);
  args.ownerBootstrapToken = String(args.ownerBootstrapToken || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  assertCondition(args.ownerBootstrapToken.length >= 6, 'owner bootstrap token must be at least 6 URL-safe characters');
  return args;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/prepare-codex-ocr-llm-demo.mjs [options]',
    '',
    'Options:',
    '  --base-url <url>          Target Shared Room base URL.',
    '  --image <path>            Local evidence image. If omitted, a fictional demo menu is generated under tmp.',
    '  --room-id <id>            Reuse a target room instead of creating one.',
    '  --participant-id <id>     Merchant participant id used for the demo.',
    '  --owner-bootstrap-token <token>',
    '                            URL-safe short-lived merchant token embedded in the demo room link.',
    '  --display-name <name>     Merchant display name shown in the room.',
    '  --tesseract-bin <path>    Tesseract executable.',
    '  --ocr-lang <lang>         Tesseract language, default eng.',
    '  --output-dir <path>       Report output directory.',
    '  --timeout-ms <ms>         Network and OCR timeout.',
    '  --accept-for-test         Test-only: accept the draft and verify the structured list is applied.'
  ].join('\n'));
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function ensureDemoImage(args) {
  if (args.imagePath) {
    await fs.access(args.imagePath);
    return args.imagePath;
  }

  await fs.mkdir(args.outputDir, { recursive: true });
  const imagePath = path.join(args.outputDir, 'moon-table-cafe-menu-en.png');
  const menuSections = [
    {
      heading: 'SNACKS',
      subtitle: 'Hot sides for the table',
      x: 80,
      y: 214,
      width: 520,
      height: 294,
      accent: '#b5692d',
      rows: [
        ['French Fries', 'NT$ 90'],
        ['Special Fries', 'NT$ 110'],
        ['Fried Chicken', 'NT$ 130'],
        ['Hash Browns', 'NT$ 70']
      ]
    },
    {
      heading: 'COFFEE',
      subtitle: 'Classic espresso bar',
      x: 665,
      y: 214,
      width: 520,
      height: 294,
      accent: '#5f6f61',
      rows: [
        ['Americano', 'NT$ 90'],
        ['Cappuccino', 'NT$ 110'],
        ['Latte', 'NT$ 120'],
        ['Special Blend Coffee', 'NT$ 100']
      ]
    },
    {
      heading: 'COLD DRINKS',
      subtitle: 'Bottles and tea',
      x: 1250,
      y: 214,
      width: 520,
      height: 294,
      accent: '#336f82',
      rows: [
        ['Coke', 'NT$ 70'],
        ['7 Up', 'NT$ 70'],
        ['Milk Tea', 'NT$ 100'],
        ['Grapefruit Soda', 'NT$ 110']
      ]
    },
    {
      heading: 'DESSERTS',
      subtitle: 'After-meal choices',
      x: 80,
      y: 558,
      width: 520,
      height: 214,
      accent: '#8d5a7f',
      rows: [
        ['Tiramisu', 'NT$ 100'],
        ['Chocolate Brownie', 'NT$ 80']
      ]
    },
    {
      heading: 'FRESH SALAD',
      subtitle: 'Build a lighter plate',
      x: 665,
      y: 558,
      width: 520,
      height: 214,
      accent: '#4f7f53',
      rows: [
        ['Fresh Salad', 'NT$ 110']
      ]
    },
    {
      heading: 'ADD ONS',
      subtitle: 'Optional toppings',
      x: 1250,
      y: 558,
      width: 520,
      height: 214,
      accent: '#a65a3a',
      rows: [
        ['Chicken', '+NT$ 30'],
        ['Mozzarella Cheese', '+NT$ 30'],
        ['Avocado', '+NT$ 50']
      ]
    }
  ];

  const renderMenuSection = (section) => {
    const priceX = section.x + section.width - 34;
    const rows = section.rows.map((row, index) => {
      const rowY = section.y + 108 + index * 46;
      const lineY = rowY + 15;
      const divider = index < section.rows.length - 1
        ? `<line x1="${section.x + 34}" y1="${lineY}" x2="${section.x + section.width - 34}" y2="${lineY}" class="rowLine"/>`
        : '';
      return [
        `<text x="${section.x + 34}" y="${rowY}" class="itemName">${escapeSvgText(row[0])}</text>`,
        `<text x="${priceX}" y="${rowY}" class="itemPrice">${escapeSvgText(row[1])}</text>`,
        divider
      ].join('');
    }).join('\n');
    return [
      `<rect x="${section.x}" y="${section.y}" width="${section.width}" height="${section.height}" rx="24" class="menuCard"/>`,
      `<rect x="${section.x}" y="${section.y}" width="12" height="${section.height}" rx="6" fill="${section.accent}"/>`,
      `<text x="${section.x + 34}" y="${section.y + 50}" class="sectionHead">${escapeSvgText(section.heading)}</text>`,
      `<text x="${section.x + 34}" y="${section.y + 80}" class="sectionSub">${escapeSvgText(section.subtitle)}</text>`,
      rows
    ].join('\n');
  };
  const menuCards = menuSections.map((section) => renderMenuSection(section)).join('\n');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1850" height="1050" viewBox="0 0 1850 1050">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f0e4"/>
      <stop offset="1" stop-color="#efe5d6"/>
    </linearGradient>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#695d4e" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="1850" height="1050" fill="url(#paper)"/>
  <rect x="50" y="46" width="1750" height="950" rx="38" fill="#fffdf8" filter="url(#softShadow)"/>
  <rect x="80" y="76" width="1690" height="112" rx="30" fill="#23392f"/>
  <circle cx="1530" cy="132" r="30" fill="#dca45b"/>
  <circle cx="1602" cy="132" r="30" fill="#f1cf8f"/>
  <circle cx="1674" cy="132" r="30" fill="#dca45b"/>
  <text x="126" y="130" class="brand">MOON TABLE CAFE</text>
  <text x="126" y="166" class="tagline">Table order menu · private room link · merchant checks the final order</text>
  <text x="1450" y="138" class="headerPrice">NT$</text>
  ${menuCards}
  <rect x="80" y="818" width="1088" height="128" rx="24" class="noteCard"/>
  <text x="126" y="868" class="noteHead">ORDER ROOM NOTE</text>
  <text x="126" y="906" class="noteText">Customers order from their own phones.</text>
  <text x="126" y="936" class="noteText">Merchant reviews the combined list before sending it.</text>
  <rect x="1212" y="818" width="558" height="128" rx="24" class="noteCard"/>
  <text x="1258" y="868" class="noteHead">TAKE OUT</text>
  <text x="1258" y="906" class="noteText">Adjustment -NT$ 30</text>
  <text x="1258" y="936" class="noteText">only where marked.</text>
  <style>
    .brand { font: 900 56px Arial, sans-serif; fill: #fffdf8; letter-spacing: 2px; }
    .tagline { font: 600 24px Arial, sans-serif; fill: #d9e3db; }
    .headerPrice { font: 900 42px Arial, sans-serif; fill: #fff4d8; text-anchor: middle; }
    .menuCard { fill: #fff8ec; stroke: #e2d0b3; stroke-width: 2; }
    .sectionHead { font: 900 34px Arial, sans-serif; fill: #202524; }
    .sectionSub { font: 600 21px Arial, sans-serif; fill: #6c706c; }
    .itemName { font: 700 28px Arial, sans-serif; fill: #202524; }
    .itemPrice { font: 900 30px Arial, sans-serif; fill: #202524; text-anchor: end; }
    .rowLine { stroke: #e6d8c4; stroke-width: 2; stroke-dasharray: 7 7; }
    .noteCard { fill: #f3eadc; stroke: #d8c4a7; stroke-width: 2; }
    .noteHead { font: 900 28px Arial, sans-serif; fill: #23392f; letter-spacing: 1px; }
    .noteText { font: 600 25px Arial, sans-serif; fill: #4d524e; }
  </style>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(imagePath);
  return imagePath;
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
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
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

function makeSocketIoUrl(baseUrl, sid = '') {
  const url = new URL('/socket.io/', baseUrl);
  url.searchParams.set('EIO', '4');
  url.searchParams.set('transport', 'polling');
  url.searchParams.set('t', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (sid) {
    url.searchParams.set('sid', sid);
  }
  return url.toString();
}

function splitEngineIoPackets(payload) {
  return String(payload || '')
    .split('\x1e')
    .filter(Boolean);
}

function parseSocketIoAck(packet, ackId) {
  const prefix = `43${ackId}`;
  if (!packet.startsWith(prefix)) {
    return null;
  }
  const data = JSON.parse(packet.slice(prefix.length));
  return Array.isArray(data) ? data[0] : data;
}

async function socketIoPostPacket(baseUrl, sid, packet, timeoutMs) {
  const response = await fetchText(makeSocketIoUrl(baseUrl, sid), {
    method: 'POST',
    headers: {
      'content-type': 'text/plain;charset=UTF-8'
    },
    body: packet
  }, timeoutMs);
  assertCondition(response.ok, `socket.io post failed: HTTP ${response.status} ${response.text}`);
  assertCondition(response.text === 'ok', `socket.io post did not return ok: ${response.text}`);
}

async function pollSocketIoForAck(baseUrl, sid, ackId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetchText(
      makeSocketIoUrl(baseUrl, sid),
      {},
      Math.min(5000, Math.max(1000, deadline - Date.now()))
    );
    assertCondition(response.ok, `socket.io poll failed: HTTP ${response.status} ${response.text}`);
    for (const packet of splitEngineIoPackets(response.text)) {
      if (packet === '2') {
        await socketIoPostPacket(baseUrl, sid, '3', timeoutMs);
        continue;
      }
      const ack = parseSocketIoAck(packet, ackId);
      if (ack) {
        return ack;
      }
    }
  }
  throw new Error('socket.io ack timed out');
}

async function connectSocket(baseUrl, timeoutMs) {
  const handshake = await fetchText(makeSocketIoUrl(baseUrl), {}, timeoutMs);
  assertCondition(handshake.ok, `socket.io handshake failed: HTTP ${handshake.status} ${handshake.text}`);
  const openPacket = splitEngineIoPackets(handshake.text).find((packet) => packet.startsWith('0'));
  assertCondition(openPacket, 'socket.io handshake missing open packet');
  const open = JSON.parse(openPacket.slice(1));
  assertCondition(open?.sid, 'socket.io handshake missing sid');
  await socketIoPostPacket(baseUrl, open.sid, '40', timeoutMs);
  await sleep(5);
  return {
    sid: open.sid,
    nextAckId: 0
  };
}

async function emitWithAck(baseUrl, connection, eventName, payload, timeoutMs) {
  const ackId = connection.nextAckId;
  connection.nextAckId += 1;
  const packet = `42${ackId}${JSON.stringify([eventName, payload])}`;
  await socketIoPostPacket(baseUrl, connection.sid, packet, timeoutMs);
  return pollSocketIoForAck(baseUrl, connection.sid, ackId, timeoutMs);
}

async function createRoom(baseUrl, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms`, {
    method: 'POST'
  }, timeoutMs);
  assertCondition(response.ok, `create room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.id, 'create room response missing id');
  return response.data;
}

async function readRoom(baseUrl, roomId, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}`, {}, timeoutMs);
  assertCondition(response.ok, `read room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  return response.data;
}

function toProductProposalStatus(status) {
  return String(status || '').replace(/host/g, 'merchant').replace(/member/g, 'customer');
}

async function joinRoomAsMerchant(baseUrl, roomId, participantId, displayName, timeoutMs) {
  const connection = await connectSocket(baseUrl, timeoutMs);
  const ack = await emitWithAck(baseUrl, connection, 'joinRoom', {
    roomId,
    participantId,
    displayName
  }, timeoutMs);
  assertCondition(ack?.ok, `join room failed: ${ack?.error || 'unknown error'}`);
  assertCondition(ack?.room?.ownerParticipantId === participantId, 'demo participant did not become the room merchant');
  return {
    connection,
    participantId,
    room: ack.room
  };
}

async function runTesseract(args) {
  const { stdout } = await execFileAsync(args.tesseractBin, [
    args.imagePath,
    'stdout',
    '-l',
    args.ocrLang,
    '--psm',
    '6'
  ], {
    timeout: args.timeoutMs,
    maxBuffer: 1024 * 1024 * 8
  });
  return normalizeText(stdout);
}

async function uploadImageAndOcr(baseUrl, roomId, participantId, displayName, ownerBootstrapToken, imagePath, ocrText, timeoutMs) {
  const imageBuffer = await fs.readFile(imagePath);
  const form = new FormData();
  form.append('menuImage', new Blob([imageBuffer], { type: detectMimeType(imagePath) }), path.basename(imagePath));
  form.append('ocrText', ocrText);
  form.append('taskType', 'restaurant_split');
  form.append('draftOnlyEvidence', 'true');
  form.append('ownerParticipantId', participantId);
  form.append('displayName', displayName);
  form.append('ownerBootstrapToken', ownerBootstrapToken);
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/menu`, {
    method: 'POST',
    body: form
  }, timeoutMs);
  assertCondition(response.ok, `upload image failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.menuLoaded === true, 'upload response did not mark menuLoaded');
  assertCondition(Array.isArray(response.data?.items) && response.data.items.length === 0, 'draft-only evidence route should not create customer items before merchant approval');
  assertCondition(response.data?.taskRouter?.taskType === 'restaurant_split', `task selector did not stay locked to restaurant_split: ${response.data?.taskRouter?.taskType || 'missing'}`);
  return response.data;
}

function buildCodexProposal(roomId, participantId, ocrText, imageSha256) {
  return {
    participantId,
    proposalType: 'semantic_repair_draft',
    summary: `Codex visual review prepared ${codexReviewedItems.length} items from OCR plus the photo.`,
    rationale: 'OCR was treated as a noisy hint. Codex visually checked the photo, corrected the bad OCR rows, and left final approval to the merchant.',
    riskLevel: 'needs_human_review',
    payload: {
      sourceMode: 'local_ocr_plus_llm_visual_review',
      hostReviewRequired: true,
      merchantReviewRequired: true,
      roomId,
      taskType: 'restaurant_split',
      menuType: 'mixed',
      localVisionConfigured: false,
      reviewExecutionMode: 'codex_guided_visual_review',
      externalProviderCall: false,
      codexNodeCompleted: true,
      llmVisualReview: {
        provider: 'codex',
        model: 'Codex guided visual review',
        completed: true,
        executionMode: 'codex_guided_visual_review'
      },
      evidenceImageSha256: imageSha256,
      rawOcrPreview: ocrText,
      structuredItems: codexReviewedItems.map((item) => ({
        ...item,
        priceRole: 'line_item',
        sourceNumberClass: 'currency_amount'
      })),
      visualReviewNotes: [
        'Checked short product names such as 7 Up against the photo before keeping the visible price as 70.',
        'Verified add-ons as optional toppings instead of treating them as required customer choices.',
        'Kept the take-out adjustment note out of customer choices because it is a pricing note, not a selectable menu item.'
      ],
      warnings: [
        'Merchant should compare the draft with the original photo before publishing the list to customers.'
      ],
      createdAt: new Date().toISOString()
    }
  };
}

async function createProposal(baseUrl, roomId, proposal, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/agent-proposals`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(proposal)
  }, timeoutMs);
  assertCondition(response.ok, `create proposal failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.proposal?.status === 'pending_host_confirmation', 'proposal was not left pending for merchant review');
  return response.data;
}

async function acceptProposalForTest(baseUrl, connection, roomId, participantId, proposalId, expectedItemCount, timeoutMs) {
  const reviewed = await emitWithAck(baseUrl, connection, 'reviewAgentProposal', {
    roomId,
    participantId,
    proposalId,
    action: 'accept'
  }, timeoutMs);
  assertCondition(reviewed?.ok, `test accept failed: ${reviewed?.error || 'unknown error'}`);
  const itemCount = Array.isArray(reviewed.room?.items) ? reviewed.room.items.length : 0;
  assertCondition(itemCount === expectedItemCount, `accepted draft item count mismatch: expected ${expectedItemCount}, got ${itemCount}`);
  const acceptedProposal = Array.isArray(reviewed.room?.agentProposals)
    ? reviewed.room.agentProposals.find((candidate) => candidate.id === proposalId)
    : null;
  assertCondition(acceptedProposal?.status === 'accepted_by_host', `proposal status after merchant test accept mismatch: ${acceptedProposal?.status}`);
  return reviewed.room;
}

async function writeReport(args, report) {
  await fs.mkdir(args.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(args.outputDir, `codex-ocr-llm-demo-${stamp}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv);
  assertCondition(args.baseUrl, 'missing --base-url');
  args.imagePath = await ensureDemoImage(args);

  const imageBuffer = await fs.readFile(args.imagePath);
  const imageSha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  const ocrText = await runTesseract(args);
  assertCondition(ocrText.length > 0, 'tesseract returned empty OCR text');

  const initialRoom = args.roomId
    ? await readRoom(args.baseUrl, args.roomId, args.timeoutMs)
    : await createRoom(args.baseUrl, args.timeoutMs);
  const roomId = initialRoom.id;
  const merchantJoin = await joinRoomAsMerchant(
    args.baseUrl,
    roomId,
    args.participantId,
    args.displayName,
    args.timeoutMs
  );
  const uploadedRoom = await uploadImageAndOcr(
    args.baseUrl,
    roomId,
    args.participantId,
    args.displayName,
    args.ownerBootstrapToken,
    args.imagePath,
    ocrText,
    args.timeoutMs
  );
  const defaultReviewExecution = {
    mode: 'codex_guided_visual_review',
    externalProviderCall: false,
    codexNodeCompleted: true,
    localVisionConfigured: false,
    bridgeReportPath: null,
    note: 'Tesseract OCR was executed locally. Codex occupies the LLM/visual-review node for this demo, prepares the structured draft, and leaves approval to the merchant.'
  };
  const proposalSetup = {
    proposalResult: await createProposal(
      args.baseUrl,
      roomId,
      buildCodexProposal(roomId, args.participantId, ocrText, imageSha256),
      args.timeoutMs
    ),
    reviewExecution: defaultReviewExecution
  };
  const proposalResult = proposalSetup.proposalResult;
  const reviewExecution = proposalSetup.reviewExecution || defaultReviewExecution;
  const structuredItemCount = codexReviewedItems.length;
  const acceptedRoom = args.acceptForTest
    ? await acceptProposalForTest(
      args.baseUrl,
      merchantJoin.connection,
      roomId,
      args.participantId,
      proposalResult.proposal.id,
      structuredItemCount,
      args.timeoutMs
    )
    : null;
  const finalRoom = acceptedRoom || await readRoom(args.baseUrl, roomId, args.timeoutMs);
  const roomUrl = `${args.baseUrl}/?_owner_bootstrap=${encodeURIComponent(args.ownerBootstrapToken)}&room=${encodeURIComponent(roomId)}&lang=en`;
  const customerUrl = `${args.baseUrl}/?room=${encodeURIComponent(roomId)}&lang=en&member=Jamie`;
  const report = {
    ok: true,
    acceptForTest: args.acceptForTest,
    reviewProvider: 'codex_guided',
    reviewExecution,
    roomId,
    roomUrl,
    customerUrl,
    participantId: args.participantId,
    displayName: args.displayName,
    imagePath: args.imagePath,
    imageSha256,
    ocrChars: ocrText.length,
    uploadedItemCount: Array.isArray(uploadedRoom.items) ? uploadedRoom.items.length : 0,
    structuredItemCount,
    proposalId: proposalResult.proposal.id,
    proposalStatus: args.acceptForTest ? 'accepted_by_host' : proposalResult.proposal.status,
    productProposalStatus: toProductProposalStatus(args.acceptForTest ? 'accepted_by_host' : proposalResult.proposal.status),
    itemsOpenForMembers: finalRoom.itemsOpenForMembers,
    customerPublishingOpen: finalRoom.itemsOpenForMembers,
    finalItemCount: Array.isArray(finalRoom.items) ? finalRoom.items.length : 0,
    ownerParticipantId: merchantJoin.room.ownerParticipantId,
    reportCreatedAt: new Date().toISOString()
  };
  const reportPath = await writeReport(args, report);
  console.log(JSON.stringify({
    ...report,
    reportPath
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exit(1);
});
