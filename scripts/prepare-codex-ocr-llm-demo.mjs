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
    sectionName: 'Snack',
    rawTextEvidence: 'SNACK French Fries 90',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Special Fries',
    price: 110,
    category: 'main',
    sectionName: 'Snack',
    rawTextEvidence: 'SNACK Special Fries 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Fried Chicken',
    price: 130,
    category: 'main',
    sectionName: 'Snack',
    rawTextEvidence: 'SNACK Fried Chicken 130',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Hash Browns',
    price: 70,
    category: 'main',
    sectionName: 'Snack',
    rawTextEvidence: 'SNACK Hash Browns 70',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Americano',
    price: 90,
    category: 'drink',
    sectionName: 'Cafe',
    rawTextEvidence: 'CAFE Americano 90',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Cappuccino',
    price: 110,
    category: 'drink',
    sectionName: 'Cafe',
    rawTextEvidence: 'CAFE Cappuccino 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Latte',
    price: 120,
    category: 'drink',
    sectionName: 'Cafe',
    rawTextEvidence: 'CAFE Latte 120',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Special Blend Coffee',
    price: 100,
    category: 'drink',
    sectionName: 'Cafe',
    rawTextEvidence: 'CAFE Special Blend Coffee 100',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Coke',
    price: 70,
    category: 'drink',
    sectionName: 'Soft Drink',
    rawTextEvidence: 'SOFT DRINK Coke 70',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: '7 Up',
    price: 70,
    category: 'drink',
    sectionName: 'Soft Drink',
    rawTextEvidence: 'SOFT DRINK 7 Up 70',
    confidence: 0.98,
    reviewFlags: []
  },
  {
    name: 'Milk Tea',
    price: 100,
    category: 'drink',
    sectionName: 'Soft Drink',
    rawTextEvidence: 'SOFT DRINK Milk Tea 100',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Grapefruit Soda',
    price: 110,
    category: 'drink',
    sectionName: 'Soft Drink',
    rawTextEvidence: 'SOFT DRINK Grapefruit Soda 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Tiramisu',
    price: 100,
    category: 'dessert',
    sectionName: 'Dessert',
    rawTextEvidence: 'DESSERT Tiramisu 100',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Chocolate Brownie',
    price: 80,
    category: 'dessert',
    sectionName: 'Dessert',
    rawTextEvidence: 'DESSERT Chocolate Brownie 80',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Fresh Salad',
    price: 110,
    category: 'main',
    sectionName: 'Fresh Salad',
    rawTextEvidence: 'FRESH SALAD Fresh Salad 110',
    confidence: 0.99,
    reviewFlags: []
  },
  {
    name: 'Chicken',
    price: 30,
    category: 'addon',
    sectionName: 'Add-ons',
    rawTextEvidence: 'ADD-ONS Chicken +30',
    confidence: 0.98,
    reviewFlags: []
  },
  {
    name: 'Mozzarella Cheese',
    price: 30,
    category: 'addon',
    sectionName: 'Add-ons',
    rawTextEvidence: 'ADD-ONS Mozzarella Cheese +30',
    confidence: 0.98,
    reviewFlags: []
  },
  {
    name: 'Avocado',
    price: 50,
    category: 'addon',
    sectionName: 'Add-ons',
    rawTextEvidence: 'ADD-ONS Avocado +50',
    confidence: 0.98,
    reviewFlags: []
  }
]);

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.WEBMCP_BASE_URL || process.env.TARGET_API_BASE || defaultBaseUrl,
    imagePath: process.env.WEBMCP_DEMO_IMAGE || '',
    roomId: '',
    participantId: `codex-visual-review-${crypto.randomUUID().slice(0, 8)}`,
    ownerBootstrapToken: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    displayName: 'Codex Demo Host',
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
    '  --participant-id <id>     Host participant id used for the demo.',
    '  --owner-bootstrap-token <token>',
    '                            URL-safe short-lived host token embedded in the demo room link.',
    '  --display-name <name>     Host display name shown in the room.',
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
  const topGroups = [
    {
      heading: 'SNACK',
      x: 72,
      priceX: 402,
      rows: [
        ['French Fries', '90'],
        ['Special Fries', '110'],
        ['Fried Chicken', '130'],
        ['Hash Browns', '70']
      ]
    },
    {
      heading: 'CAFE',
      x: 512,
      priceX: 842,
      rows: [
        ['Americano', '90'],
        ['Cappuccino', '110'],
        ['Latte', '120'],
        ['Special Blend Coffee', '100']
      ]
    },
    {
      heading: 'SOFT DRINK',
      x: 952,
      priceX: 1282,
      rows: [
        ['Coke', '70'],
        ['7 Up', '70'],
        ['Milk Tea', '100'],
        ['Grapefruit Soda', '110']
      ]
    },
    {
      heading: 'DESSERT',
      x: 1392,
      priceX: 1728,
      rows: [
        ['Tiramisu', '100'],
        ['Chocolate Brownie', '80']
      ]
    }
  ];
  const lowerGroups = [
    {
      heading: 'FRESH SALAD',
      x: 72,
      priceX: 402,
      rows: [
        ['Fresh Salad', '110']
      ]
    },
    {
      heading: 'ADD-ONS',
      x: 512,
      priceX: 842,
      rows: [
        ['Chicken', '+30'],
        ['Mozzarella Cheese', '+30'],
        ['Avocado', '+50']
      ]
    },
    {
      heading: 'NOTE',
      x: 952,
      priceX: 1728,
      rows: [
        ['Take-out fee: -30 where marked.', ''],
        ['Organizer reviews menu before group order.', '']
      ]
    }
  ];
  const renderGroup = (group, y) => {
    const rows = group.rows.map((row, index) => {
      const rowY = y + 56 + index * 52;
      const price = row[1]
        ? `<text x="${group.priceX}" y="${rowY}" class="price">${escapeSvgText(row[1])}</text>`
        : '';
      return `<text x="${group.x}" y="${rowY}" class="cell">${escapeSvgText(row[0])}</text>${price}`;
    }).join('\n');
    return `<text x="${group.x}" y="${y}" class="head">${escapeSvgText(group.heading)}</text>${rows}`;
  };
  const textRows = [
    ...topGroups.map((group) => renderGroup(group, 170)),
    ...lowerGroups.map((group) => renderGroup(group, 430))
  ].join('\n');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1850" height="650" viewBox="0 0 1850 650">
  <rect width="1850" height="650" fill="#f7f4eb"/>
  <rect x="34" y="34" width="1782" height="582" rx="18" fill="#ffffff" stroke="#2f3a35" stroke-width="4"/>
  <text x="72" y="95" class="title">Moon Table Cafe Menu</text>
  <text x="72" y="132" class="meta">Fictional menu evidence for group ordering</text>
  ${textRows}
  <style>
    .title { font: 800 54px Arial, sans-serif; fill: #202524; }
    .meta { font: 500 24px Arial, sans-serif; fill: #626b65; }
    .head { font: 800 30px Arial, sans-serif; fill: #202524; }
    .cell { font: 600 27px Arial, sans-serif; fill: #202524; }
    .price { font: 800 29px Arial, sans-serif; fill: #202524; text-anchor: end; }
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

async function joinRoomAsHost(baseUrl, roomId, participantId, displayName, timeoutMs) {
  const connection = await connectSocket(baseUrl, timeoutMs);
  const ack = await emitWithAck(baseUrl, connection, 'joinRoom', {
    roomId,
    participantId,
    displayName
  }, timeoutMs);
  assertCondition(ack?.ok, `join room failed: ${ack?.error || 'unknown error'}`);
  assertCondition(ack?.room?.ownerParticipantId === participantId, 'demo participant did not become the room owner');
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

async function uploadImageAndOcr(baseUrl, roomId, participantId, ownerBootstrapToken, imagePath, ocrText, timeoutMs) {
  const imageBuffer = await fs.readFile(imagePath);
  const form = new FormData();
  form.append('menuImage', new Blob([imageBuffer], { type: detectMimeType(imagePath) }), path.basename(imagePath));
  form.append('ocrText', ocrText);
  form.append('taskType', 'restaurant_split');
  form.append('draftOnlyEvidence', 'true');
  form.append('ownerParticipantId', participantId);
  form.append('ownerBootstrapToken', ownerBootstrapToken);
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/menu`, {
    method: 'POST',
    body: form
  }, timeoutMs);
  assertCondition(response.ok, `upload image failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.menuLoaded === true, 'upload response did not mark menuLoaded');
  assertCondition(Array.isArray(response.data?.items) && response.data.items.length === 0, 'draft-only evidence route should not create member items before host approval');
  assertCondition(response.data?.taskRouter?.taskType === 'restaurant_split', `task selector did not stay locked to restaurant_split: ${response.data?.taskRouter?.taskType || 'missing'}`);
  return response.data;
}

function buildCodexProposal(roomId, participantId, ocrText, imageSha256) {
  return {
    participantId,
    proposalType: 'semantic_repair_draft',
    summary: `Codex visual review prepared ${codexReviewedItems.length} items from OCR plus the photo.`,
    rationale: 'OCR was treated as a noisy hint. Codex visually checked the photo, corrected the bad OCR rows, and left final approval to the host.',
    riskLevel: 'needs_human_review',
    payload: {
      sourceMode: 'local_ocr_plus_llm_visual_review',
      hostReviewRequired: true,
      roomId,
      taskType: 'restaurant_split',
      menuType: 'mixed',
      localVisionConfigured: false,
      llmVisualReview: {
        provider: 'codex',
        model: 'Codex visual review',
        completed: true
      },
      evidenceImageSha256: imageSha256,
      rawOcrPreview: ocrText,
      structuredItems: codexReviewedItems.map((item) => ({
        ...item,
        priceRole: 'line_item',
        sourceNumberClass: 'currency_amount'
      })),
      visualReviewNotes: [
        'Corrected the OCR mistake where 7 Up was read as 710; the visible price is 70.',
        'Added Mozzarella Cheese +30, which OCR missed.',
        'Kept the take-out fee note out of member choices because it is a rule note, not a selectable menu item.'
      ],
      warnings: [
        'Host should compare the draft with the original photo before opening the list to members.'
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
  assertCondition(response.data?.proposal?.status === 'pending_host_confirmation', 'proposal was not left pending for host review');
  return response.data;
}

async function acceptProposalForTest(baseUrl, connection, roomId, participantId, proposalId, timeoutMs) {
  const reviewed = await emitWithAck(baseUrl, connection, 'reviewAgentProposal', {
    roomId,
    participantId,
    proposalId,
    action: 'accept'
  }, timeoutMs);
  assertCondition(reviewed?.ok, `test accept failed: ${reviewed?.error || 'unknown error'}`);
  const itemCount = Array.isArray(reviewed.room?.items) ? reviewed.room.items.length : 0;
  assertCondition(itemCount === codexReviewedItems.length, `accepted draft item count mismatch: ${itemCount}`);
  const acceptedProposal = Array.isArray(reviewed.room?.agentProposals)
    ? reviewed.room.agentProposals.find((candidate) => candidate.id === proposalId)
    : null;
  assertCondition(acceptedProposal?.status === 'accepted_by_host', `proposal status after test accept mismatch: ${acceptedProposal?.status}`);
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
  const hostJoin = await joinRoomAsHost(
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
    args.ownerBootstrapToken,
    args.imagePath,
    ocrText,
    args.timeoutMs
  );
  const proposalPayload = buildCodexProposal(roomId, args.participantId, ocrText, imageSha256);
  const proposalResult = await createProposal(args.baseUrl, roomId, proposalPayload, args.timeoutMs);
  const acceptedRoom = args.acceptForTest
    ? await acceptProposalForTest(
      args.baseUrl,
      hostJoin.connection,
      roomId,
      args.participantId,
      proposalResult.proposal.id,
      args.timeoutMs
    )
    : null;
  const finalRoom = acceptedRoom || await readRoom(args.baseUrl, roomId, args.timeoutMs);
  const roomUrl = `${args.baseUrl}/?_owner_bootstrap=${encodeURIComponent(args.ownerBootstrapToken)}&room=${encodeURIComponent(roomId)}`;
  const report = {
    ok: true,
    acceptForTest: args.acceptForTest,
    roomId,
    roomUrl,
    participantId: args.participantId,
    displayName: args.displayName,
    imagePath: args.imagePath,
    imageSha256,
    ocrChars: ocrText.length,
    uploadedItemCount: Array.isArray(uploadedRoom.items) ? uploadedRoom.items.length : 0,
    structuredItemCount: codexReviewedItems.length,
    proposalId: proposalResult.proposal.id,
    proposalStatus: args.acceptForTest ? 'accepted_by_host' : proposalResult.proposal.status,
    itemsOpenForMembers: finalRoom.itemsOpenForMembers,
    finalItemCount: Array.isArray(finalRoom.items) ? finalRoom.items.length : 0,
    ownerParticipantId: hostJoin.room.ownerParticipantId,
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
