import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const defaultBaseUrl = 'http://127.0.0.1:3000';
const defaultOutputDir = 'logs/runtime';
const onePixelPng = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80,
  15, 0, 5, 131, 2, 127, 148, 127, 87, 220, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130
]);

const scenarios = [
  {
    id: 'zh_group_buy_threshold_review',
    lang: 'zh',
    taskType: 'group_buy',
    hostName: '發起者',
    memberName: '小美',
    text: [
      '社區團購優惠 滿 NT$1,500 免運',
      '綜合堅果 320',
      '果乾組合 280',
      '能量棒 50',
      '售完 青芒果乾 199',
      '三件九折活動'
    ].join('\n'),
    editName: '綜合堅果補充包',
    editPrice: 330
  },
  {
    id: 'zh_drink_order_review',
    lang: 'zh',
    taskType: 'drink_order',
    hostName: '下午茶發起者',
    memberName: '阿倫',
    text: [
      '辦公室手搖飲',
      '珍珠奶茶 微糖微冰 65',
      '四季春青茶 去冰無糖 45',
      '黑糖珍珠鮮奶 85',
      '蜂蜜檸檬 常溫 55',
      '冬瓜青茶 少冰 50'
    ].join('\n'),
    editName: '珍珠奶茶 大杯',
    editPrice: 70
  },
  {
    id: 'en_sports_venue_review',
    lang: 'en',
    taskType: 'sports_venue',
    hostName: 'Host',
    memberName: 'Jamie',
    text: [
      'Indoor soccer pitch reservation',
      'Pitch rental two hours 220',
      'Equipment rental bibs and balls 30',
      'Referee fee 40',
      'Parking passes 25',
      'Water pack 18',
      'Minimum booking four players'
    ].join('\n'),
    editName: 'Pitch rental two hours confirmed',
    editPrice: 220
  },
  {
    id: 'en_ticket_activity_review',
    lang: 'en',
    taskType: 'ticket_activity',
    hostName: 'Organizer',
    memberName: 'Alex',
    text: [
      'Museum workshop signup',
      'Adult workshop ticket 45',
      'Student ticket 32',
      'Material kit 18',
      'Locker rental 8',
      'Early bird ends Friday'
    ].join('\n'),
    editName: 'Adult workshop ticket',
    editPrice: 45
  }
];

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    rounds: 20,
    timeoutMs: 20000,
    outputDir: defaultOutputDir,
    failFast: true,
    retryAttempts: 4,
    retryDelayMs: 8000
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--base-url' && next) {
      args.baseUrl = next.replace(/\/+$/, '');
      index += 1;
    } else if (arg === '--rounds' && next) {
      args.rounds = Math.max(1, Number(next) || args.rounds);
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(5000, Number(next) || args.timeoutMs);
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === '--continue-on-failure') {
      args.failFast = false;
    } else if (arg === '--retry-attempts' && next) {
      args.retryAttempts = Math.max(0, Math.min(8, Number(next) || 0));
      index += 1;
    } else if (arg === '--retry-delay-ms' && next) {
      args.retryDelayMs = Math.max(1000, Number(next) || args.retryDelayMs);
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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    let data;
    try {
      data = await response.json();
    } catch (error) {
      data = { error: `Response was not JSON: ${error.message}` };
    }
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url, options, args, label) {
  let lastResponse = null;
  for (let attempt = 0; attempt <= args.retryAttempts; attempt += 1) {
    const response = await fetchJson(url, options, args.timeoutMs);
    if (response.status !== 429) {
      return response;
    }
    lastResponse = response;
    if (attempt < args.retryAttempts) {
      await sleep(args.retryDelayMs * (attempt + 1));
    }
  }
  if (lastResponse) {
    lastResponse.data = {
      ...(lastResponse.data || {}),
      error: `${label || 'request'} rate limited after ${args.retryAttempts + 1} attempt(s): ${lastResponse.data?.error || 'HTTP 429'}`
    };
  }
  return lastResponse;
}

async function fetchText(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    clearTimeout(timer);
  }
}

async function fetchBuffer(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      buffer
    };
  } finally {
    clearTimeout(timer);
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

function parseSocketIoAck(packet, ackId) {
  const prefix = `43${ackId}`;
  if (!packet.startsWith(prefix)) {
    return null;
  }
  const jsonText = packet.slice(prefix.length);
  const data = JSON.parse(jsonText);
  return Array.isArray(data) ? data[0] : data;
}

async function pollSocketIoForAck(baseUrl, sid, ackId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetchText(makeSocketIoUrl(baseUrl, sid), {}, Math.min(5000, Math.max(1000, deadline - Date.now())));
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
  throw new Error(`socket.io ack ${ackId} timed out`);
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
    ackId: 0
  };
}

async function emitWithAck(baseUrl, connection, eventName, payload, timeoutMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ackId = connection.ackId;
    connection.ackId += 1;
    const packet = `42${ackId}${JSON.stringify([eventName, payload])}`;
    try {
      await socketIoPostPacket(baseUrl, connection.sid, packet, timeoutMs);
      return await pollSocketIoForAck(baseUrl, connection.sid, ackId, timeoutMs);
    } catch (error) {
      const message = String(error?.message || error);
      if (attempt === 0 && message.includes('Session ID unknown')) {
        const fresh = await connectSocket(baseUrl, timeoutMs);
        connection.sid = fresh.sid;
        connection.ackId = fresh.ackId;
        continue;
      }
      throw error;
    }
  }
  throw new Error(`socket.io emit failed for ${eventName}`);
}

async function createRoom(baseUrl, args) {
  const response = await fetchJsonWithRetry(`${baseUrl}/api/rooms`, {
    method: 'POST'
  }, args, 'create room');
  assertCondition(response.ok, `create room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.id, 'create room response missing room id');
  return response.data;
}

async function uploadPriceText(baseUrl, roomId, scenario, args) {
  const form = new FormData();
  form.append('menuImage', new Blob([onePixelPng], { type: 'image/png' }), `${scenario.id}.png`);
  form.append('ocrText', scenario.text);
  form.append('taskType', scenario.taskType);

  const response = await fetchJsonWithRetry(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/menu`, {
    method: 'POST',
    body: form
  }, args, 'upload price text');
  assertCondition(response.ok, `upload failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.menuLoaded === true, 'upload response did not mark menuLoaded=true');
  assertCondition(response.data?.itemsOpenForMembers === false, 'items should stay closed after evidence draft creation');
  assertCondition(Array.isArray(response.data?.items), 'upload response missing items array');
  assertCondition(response.data.items.length >= 3, `expected at least 3 items, got ${response.data.items.length}`);
  assertCondition(response.data?.taskRouter?.taskType === scenario.taskType, `task type drifted: expected ${scenario.taskType}, got ${response.data?.taskRouter?.taskType}`);
  return response.data;
}

async function readRoom(baseUrl, roomId, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}`, {}, timeoutMs);
  assertCondition(response.ok, `read room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.id === roomId, 'read room returned mismatched room id');
  return response.data;
}

function getOwnerParticipantId(room) {
  if (room?.ownerParticipantId) {
    return room.ownerParticipantId;
  }
  const owner = Array.isArray(room?.participants)
    ? room.participants.find((participant) => participant.role === 'owner' || participant.isOwner)
    : null;
  if (owner?.id) {
    return owner.id;
  }
  const first = Array.isArray(room?.participants) ? room.participants[0] : null;
  return first?.id || '';
}

function getFirstItemId(room) {
  const first = Array.isArray(room?.items) ? room.items[0] : null;
  assertCondition(first?.id, 'room has no first item id');
  return first.id;
}

async function createProposal(baseUrl, room, ownerParticipantId, scenario, timeoutMs) {
  const beforeItemCount = Array.isArray(room.items) ? room.items.length : 0;
  const structuredItems = (Array.isArray(room.items) ? room.items : []).map((item) => ({
    name: item.name || item.label || '',
    price: Number(item.price || item.amount || 0),
    category: item.category || 'other',
    rawTextEvidence: item.rawTextEvidence || item.name || item.label || ''
  }));
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/agent-proposals`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      participantId: ownerParticipantId,
      proposalType: 'semantic_repair_draft',
      summary: `Review parsed labels for ${scenario.id}.`,
      rationale: 'The agent can prepare a draft, but only the host can edit parsed rows and open the reviewed list.',
      riskLevel: 'needs_human_review',
      payload: {
        sourceMode: 'local_ocr_plus_local_vision',
        localVisionConfigured: true,
        localVision: {
          provider: 'stress_harness',
          model: 'mock-local-vision-review'
        },
        scenario: scenario.id,
        taskType: scenario.taskType,
        proposedAction: 'review_before_open',
        rawOcrPreview: scenario.text,
        structuredItems,
        visualReviewNotes: [
          'Stress harness simulates a local vision correction layer for HITL release-gate validation.'
        ]
      }
    })
  }, timeoutMs);
  assertCondition(response.ok, `proposal failed: HTTP ${response.status} ${response.data?.error || ''}`);

  const after = await readRoom(baseUrl, room.id, timeoutMs);
  const afterItemCount = Array.isArray(after.items) ? after.items.length : 0;
  const latestProposal = Array.isArray(after.agentProposals) ? after.agentProposals[0] : null;
  assertCondition(afterItemCount === beforeItemCount, `proposal changed item count: ${beforeItemCount} -> ${afterItemCount}`);
  assertCondition(latestProposal?.status === 'pending_host_confirmation', `proposal status mismatch: ${latestProposal?.status}`);
  assertCondition(after.itemsOpenForMembers === false, 'proposal opened items unexpectedly');
  return after;
}

async function acceptLatestReviewProposal(baseUrl, connection, room, ownerParticipantId, timeoutMs) {
  const proposal = Array.isArray(room.agentProposals)
    ? room.agentProposals.find((candidate) => candidate.status === 'pending_host_confirmation')
    : null;
  assertCondition(proposal?.id, 'missing pending host review proposal');
  const reviewed = await emitWithAck(baseUrl, connection, 'reviewAgentProposal', {
    roomId: room.id,
    participantId: ownerParticipantId,
    proposalId: proposal.id,
    action: 'accept'
  }, timeoutMs);
  assertCondition(reviewed?.ok, `host proposal accept failed: ${reviewed?.error || 'unknown error'}`);
  assertCondition(reviewed.room?.itemsOpenForMembers === false, 'host proposal accept opened items unexpectedly');
  const remainingBlocks = Array.isArray(reviewed.room?.antiPollution?.blocks) ? reviewed.room.antiPollution.blocks : [];
  assertCondition(remainingBlocks.length === 0, `host proposal accept left anti-pollution blocks: ${remainingBlocks.map((block) => block.id || block.detail || 'unknown').join(', ')}`);
  return reviewed.room;
}

async function runScenarioRound(baseUrl, scenario, round, args) {
  const timeoutMs = args.timeoutMs;
  const startedAt = Date.now();
  const room = await createRoom(baseUrl, args);
  const hostConnection = await connectSocket(baseUrl, timeoutMs);
  const hostJoin = await emitWithAck(baseUrl, hostConnection, 'joinRoom', {
    roomId: room.id,
    participantId: `host-${scenario.id}-${round}-${Math.random().toString(36).slice(2)}`,
    displayName: `${scenario.hostName} ${round}`
  }, timeoutMs);
  assertCondition(hostJoin?.ok, `host join failed: ${hostJoin?.error || 'unknown error'}`);
  const ownerParticipantId = getOwnerParticipantId(hostJoin.room);
  assertCondition(ownerParticipantId, 'missing owner participant id');

  const uploaded = await uploadPriceText(baseUrl, room.id, scenario, args);
  const drafted = await createProposal(baseUrl, uploaded, ownerParticipantId, scenario, timeoutMs);

  const memberConnection = await connectSocket(baseUrl, timeoutMs);
  const memberJoin = await emitWithAck(baseUrl, memberConnection, 'joinRoom', {
    roomId: room.id,
    participantId: `member-${scenario.id}-${round}-${Math.random().toString(36).slice(2)}`,
    displayName: `${scenario.memberName} ${round}`
  }, timeoutMs);
  assertCondition(memberJoin?.ok, `member join failed: ${memberJoin?.error || 'unknown error'}`);
  const memberParticipantId = memberJoin.participantId;
  assertCondition(memberParticipantId, 'missing member participant id');

  const firstItemId = getFirstItemId(drafted);
  const memberClaimBeforeOpen = await emitWithAck(baseUrl, memberConnection, 'setItemQty', {
    roomId: room.id,
    participantId: memberParticipantId,
    itemId: firstItemId,
    qty: 1
  }, timeoutMs);
  assertCondition(memberClaimBeforeOpen?.ok === false, 'member was able to claim before host opened list');

  const memberEditAttempt = await emitWithAck(baseUrl, memberConnection, 'updateParsedItem', {
    roomId: room.id,
    participantId: memberParticipantId,
    itemId: firstItemId,
    name: scenario.editName,
    price: scenario.editPrice
  }, timeoutMs);
  assertCondition(memberEditAttempt?.ok === false, 'member was able to edit parsed item');

  const hostEdit = await emitWithAck(baseUrl, hostConnection, 'updateParsedItem', {
    roomId: room.id,
    participantId: ownerParticipantId,
    itemId: firstItemId,
    name: scenario.editName,
    price: scenario.editPrice
  }, timeoutMs);
  assertCondition(hostEdit?.ok, `host edit failed: ${hostEdit?.error || 'unknown error'}`);
  assertCondition(hostEdit.room?.itemsOpenForMembers === false, 'host edit opened items unexpectedly');

  const memberOpenAttempt = await emitWithAck(baseUrl, memberConnection, 'openItemsForMembers', {
    roomId: room.id,
    participantId: memberParticipantId
  }, timeoutMs);
  assertCondition(memberOpenAttempt?.ok === false, 'member was able to open list');

  const antiBlocksBeforeReview = Array.isArray(drafted.antiPollution?.blocks) ? drafted.antiPollution.blocks : [];
  if (antiBlocksBeforeReview.length > 0) {
    const blockedHostOpenBeforeReview = await emitWithAck(baseUrl, hostConnection, 'openItemsForMembers', {
      roomId: room.id,
      participantId: ownerParticipantId
    }, timeoutMs);
    assertCondition(blockedHostOpenBeforeReview?.ok === false, 'host was able to open list while anti-pollution review was still pending');
  }

  const reviewed = await acceptLatestReviewProposal(baseUrl, hostConnection, drafted, ownerParticipantId, timeoutMs);

  const hostOpen = await emitWithAck(baseUrl, hostConnection, 'openItemsForMembers', {
    roomId: room.id,
    participantId: ownerParticipantId
  }, timeoutMs);
  assertCondition(hostOpen?.ok, `host open failed: ${hostOpen?.error || 'unknown error'}`);
  assertCondition(hostOpen.room?.itemsOpenForMembers === true, 'host open did not mark itemsOpenForMembers=true');

  const hostEditAfterOpen = await emitWithAck(baseUrl, hostConnection, 'updateParsedItem', {
    roomId: room.id,
    participantId: ownerParticipantId,
    itemId: firstItemId,
    name: `${scenario.editName} late edit`,
    price: scenario.editPrice + 1
  }, timeoutMs);
  assertCondition(hostEditAfterOpen?.ok === false, 'host was able to edit parsed item after member release');

  const memberClaimAfterOpen = await emitWithAck(baseUrl, memberConnection, 'setItemQty', {
    roomId: room.id,
    participantId: memberParticipantId,
    itemId: firstItemId,
    qty: 1
  }, timeoutMs);
  assertCondition(memberClaimAfterOpen?.ok, `member claim after open failed: ${memberClaimAfterOpen?.error || 'unknown error'}`);

  const memberConfirm = await emitWithAck(baseUrl, memberConnection, 'confirmOrder', {
    roomId: room.id,
    participantId: memberParticipantId,
    confirmed: true
  }, timeoutMs);
  assertCondition(memberConfirm?.ok, `member confirm failed: ${memberConfirm?.error || 'unknown error'}`);

  const hostSettle = await emitWithAck(baseUrl, hostConnection, 'settleRoom', {
    roomId: room.id,
    participantId: ownerParticipantId
  }, timeoutMs);
  assertCondition(hostSettle?.ok, `host settle failed: ${hostSettle?.error || 'unknown error'}`);
  assertCondition(hostSettle.room?.settled === true, 'host settlement did not mark room settled');

  const htmlExport = await fetchText(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/export.html`, {}, timeoutMs);
  assertCondition(htmlExport.ok, `HTML export failed: HTTP ${htmlExport.status} ${htmlExport.text}`);
  assertCondition(htmlExport.text.includes('Action Review Summary'), 'HTML export missing action review title');
  assertCondition(htmlExport.text.includes(room.id), 'HTML export missing room id');
  assertCondition(htmlExport.text.includes('Total'), 'HTML export missing total line');

  const pdfExport = await fetchBuffer(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/export.pdf`, {}, timeoutMs);
  const pdfType = pdfExport.headers.get('content-type') || '';
  const pdfHeader = pdfExport.buffer.subarray(0, 8).toString('utf8');
  const pdfTail = pdfExport.buffer.subarray(-32).toString('utf8');
  assertCondition(pdfExport.ok, `PDF export failed: HTTP ${pdfExport.status}`);
  assertCondition(pdfType.includes('application/pdf'), `PDF export content type mismatch: ${pdfType}`);
  assertCondition(pdfHeader.startsWith('%PDF-'), `PDF export header mismatch: ${pdfHeader}`);
  assertCondition(pdfTail.includes('%%EOF'), 'PDF export missing EOF marker');
  assertCondition(pdfExport.buffer.length > 500, `PDF export too small: ${pdfExport.buffer.length} bytes`);
  assertCondition(pdfExport.buffer.includes(Buffer.from('/BaseFont /Helvetica')), 'PDF export missing readable Latin font');
  assertCondition(pdfExport.buffer.includes(Buffer.from('/BaseFont /MSung-Light')), 'PDF export missing readable CJK font');

  return {
    ok: true,
    scenario: scenario.id,
    lang: scenario.lang,
    taskType: scenario.taskType,
    round,
    roomId: room.id,
    itemCount: uploaded.items.length,
    finalTotal: hostSettle.room?.totals?.grandTotal || 0,
    elapsedMs: Date.now() - startedAt,
    gates: {
      proposalStayedDraft: true,
      itemsClosedAfterUpload: true,
      memberClaimBeforeOpenBlocked: true,
      memberParsedItemEditBlocked: true,
      hostParsedItemEditBeforeOpenAllowed: true,
      memberOpenBlocked: true,
      hostOpenAllowed: true,
      hostParsedItemEditAfterOpenBlocked: true,
      memberClaimAfterOpenAllowed: true,
      memberConfirmAllowed: true,
      hostSettleAllowed: true,
      htmlExportReadable: true,
      pdfExportReadable: true,
      pdfLatinFontPresent: true,
      pdfCjkFontPresent: true
    },
    exports: {
      htmlStatus: htmlExport.status,
      pdfStatus: pdfExport.status,
      pdfBytes: pdfExport.buffer.length
    }
  };
}

function summarize(results) {
  const summaryByScenario = {};
  for (const scenario of scenarios) {
    const rows = results.filter((result) => result.scenario === scenario.id);
    const passed = rows.filter((result) => result.ok).length;
    const failed = rows.length - passed;
    const elapsed = rows.filter((result) => result.ok).map((result) => Number(result.elapsedMs || 0));
    summaryByScenario[scenario.id] = {
      lang: scenario.lang,
      taskType: scenario.taskType,
      total: rows.length,
      passed,
      failed,
      minElapsedMs: elapsed.length ? Math.min(...elapsed) : 0,
      maxElapsedMs: elapsed.length ? Math.max(...elapsed) : 0,
      avgElapsedMs: elapsed.length ? Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length) : 0
    };
  }
  const total = results.length;
  const passed = results.filter((result) => result.ok).length;
  return {
    total,
    passed,
    failed: total - passed,
    summaryByScenario
  };
}

function renderMarkdown(args, summary, results, plannedTotal) {
  const lines = [
    '# Member-Visibility Release Stress Evidence',
    '',
    `- Target: ${args.baseUrl}`,
    `- Rounds per scenario: ${args.rounds}`,
    `- Scenarios: ${scenarios.length}`,
    `- Planned cases: ${plannedTotal}`,
    `- Attempted cases: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Stopped early: ${summary.total < plannedTotal ? 'yes' : 'no'}`,
    `- Generated at: ${new Date().toISOString()}`,
    '',
    '## Scenario Summary',
    '',
    '| scenario | lang | task type | total | passed | failed | avg ms | max ms |',
    '|---|---|---|---:|---:|---:|---:|---:|'
  ];

  for (const [scenario, row] of Object.entries(summary.summaryByScenario)) {
    lines.push(`| ${scenario} | ${row.lang} | ${row.taskType} | ${row.total} | ${row.passed} | ${row.failed} | ${row.avgElapsedMs} | ${row.maxElapsedMs} |`);
  }

  lines.push('', '## Checked Boundaries', '');
  lines.push('- Evidence parser creates a draft list and keeps member claiming closed.');
  lines.push('- Agent proposal stays `pending_host_confirmation` and does not open or mutate final state.');
  lines.push('- The host cannot release the list while parser candidates or rule candidates still require review.');
  lines.push('- The script accepts the pending review proposal before Member-Visibility Release so the positive flow follows the HITL recording path.');
  lines.push('- A room member cannot edit parsed items.');
  lines.push('- A room member cannot claim items before the host releases the reviewed list.');
  lines.push('- Only the host can edit parsed items before releasing the reviewed list.');
  lines.push('- A room member cannot release the list.');
  lines.push('- After Member-Visibility Release, parsed item editing is locked again.');
  lines.push('- Members can claim and confirm only after Member-Visibility Release.');
  lines.push('- The host can settle only after the group-facing flow is open and confirmed.');
  lines.push('- Completed rooms export readable HTML and valid PDF files after final human settlement.');
  lines.push('', '## Failed Cases', '');

  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    lines.push('- None.');
  } else {
    for (const result of failed) {
      lines.push(`- ${result.scenario} round ${result.round}: ${result.error}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(args.outputDir, { recursive: true });

  const health = await fetchJson(`${args.baseUrl}/healthz`, {}, args.timeoutMs);
  assertCondition(health.ok, `health check failed: HTTP ${health.status}`);

  const tasks = [];
  for (const scenario of scenarios) {
    for (let round = 1; round <= args.rounds; round += 1) {
      tasks.push({ scenario, round });
    }
  }

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(args.outputDir, `member-release-stress-${stamp}.json`);
  const mdPath = path.join(args.outputDir, `member-release-stress-${stamp}.md`);

  console.log(`Target: ${args.baseUrl}`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log(`Rounds per scenario: ${args.rounds}`);
  console.log(`Total cases: ${tasks.length}`);

  const results = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const { scenario, round } = tasks[index];
    try {
      const result = await runScenarioRound(args.baseUrl, scenario, round, args);
      results.push(result);
      console.log(`[${index + 1}/${tasks.length}] ${scenario.id} round ${round} OK ${result.elapsedMs}ms`);
    } catch (error) {
      const result = {
        ok: false,
        scenario: scenario.id,
        lang: scenario.lang,
        taskType: scenario.taskType,
        round,
        elapsedMs: 0,
        error: error.name === 'AbortError' ? 'request timeout' : error.message
      };
      results.push(result);
      console.log(`[${index + 1}/${tasks.length}] ${scenario.id} round ${round} FAIL ${result.error}`);
      if (args.failFast) {
        console.log(`Stopped after first failure at case ${index + 1}/${tasks.length}.`);
        break;
      }
    }
    await sleep(15);
  }

  const summary = summarize(results);
  const payload = {
    args,
    health: health.data,
    scenarios,
    plannedTotal: tasks.length,
    stoppedEarly: results.length < tasks.length,
    summary,
    results
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(mdPath, `${renderMarkdown(args, summary, results, tasks.length)}\n`);

  console.log(JSON.stringify({
    summary,
    jsonPath,
    mdPath
  }, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
