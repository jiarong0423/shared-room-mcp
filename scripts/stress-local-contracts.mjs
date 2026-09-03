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
    lang: 'zh',
    taskType: 'drink_order',
    label: '辦公室下午茶手搖飲統計',
    conflict: '有人缺少甜度或冰量，且總杯數是否包含代點仍需確認。',
    text: [
      '科技大樓辦公室下午茶',
      '珍珠奶茶 微糖微冰 65',
      '四季春青茶 去冰無糖 加椰果 45',
      '黑糖珍珠鮮奶 固定甜度冰量 85',
      '燕麥拿鐵 熱 95',
      '經典紅茶 正常甜少冰 35'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'group_buy',
    label: '社區小農水果團購',
    conflict: '缺少自取或宅配確認，未達免運時的運費分攤也需確認。',
    text: [
      '社區水果團購',
      '大盒草莓特級 450',
      '中盒草莓 300',
      '小盒草莓 200',
      '水蜜桃禮盒 880',
      '未滿免運加收運費 150'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'restaurant_split',
    label: '大學同學聚餐分帳',
    conflict: '共享開胃菜是否所有人分攤，以及服務費基準需要人工確認。',
    text: [
      '週末美式餐廳聚餐費用',
      '開胃菜拼盤 全體平分 580',
      '美式培根牛肉堡 320',
      '香煎鮭魚燉飯 380',
      'BBQ豬肋排 460',
      '經典披薩 280',
      '服務費 10'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'ktv_room',
    label: '週五夜唱包廂試算',
    conflict: '晚到成員的人頭費是否能折抵，需要發起者向店家確認。',
    text: [
      '週五夜唱試算',
      '大包廂費用三小時 2400',
      '基本歡唱人頭費 399',
      '炸物拼盤 499',
      '飲料壺 180',
      '清潔費 300'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'sports_venue',
    label: '羽球臨打場地與球資',
    conflict: '球資是否由教練贊助一桶，會影響分攤金額。',
    text: [
      '週六羽球臨打費用',
      '一號場地費兩小時 600',
      '二號場地費兩小時 600',
      '比賽級羽球一桶 550',
      '第二桶羽球 550',
      '球拍租借 80'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'ticket_activity',
    label: '密室逃脫人數確認',
    conflict: '若一人未確認，可能低於包場最低人數，需要候補或改方案。',
    text: [
      '密室逃脫預約',
      '平日全包場六到八人 4800',
      '單人票 850',
      '候補保留費 100',
      '道具加購 300',
      '場地清潔費 200'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'rental_share',
    label: '合租公寓公共帳單',
    conflict: '室友出差整月，固定費與用量費是否不同分攤需要確認。',
    text: [
      '302室公共帳單',
      '公共區域電費 840',
      '水費 360',
      '天然氣費 520',
      '網路費 999',
      '共用清潔用品 280'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'generic_split',
    label: '畢業旅行租車與油資',
    conflict: '群組總額和明細加總不同，需要發起者確認是否漏掉停車費。',
    text: [
      '花蓮行租車費用結算',
      '租車三天訂金 3200',
      '第一天加油 1050',
      '第二天加油 980',
      '過路費 345',
      '駕駛辛勞津貼 600'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'drink_order',
    label: '週五雞排加飲料下午茶',
    conflict: '其中一項可能來自不同店家，需確認是否拆成兩張單。',
    text: [
      '週五福利下午茶',
      '雞排梅子加珍奶 145',
      '辣味雞排加綠茶 135',
      '脆皮雞排加鐵觀音拿鐵 160',
      '雞排胡椒加珍珠鮮奶 165',
      '單點雞排 85'
    ].join('\n')
  },
  {
    lang: 'zh',
    taskType: 'group_buy',
    label: '辦公室日本零食伴手禮',
    conflict: '熱門品項有限購，訂購數量超過可買數量，需要候補方案。',
    text: [
      '日本伴手禮團購',
      '大盒綜合餅乾禮盒 880',
      '薯條零食三盒 1050',
      '夾心餅乾二盒 1240',
      '小盒綜合餅乾禮盒 480',
      '第二份大盒禮盒 1760'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'drink_order',
    label: 'Team Coffee Run',
    conflict: 'Milk surcharge and sweetness preference need host review.',
    text: [
      'Friday coffee run options',
      'Iced caramel macchiato venti 625',
      'Hot matcha latte grande oat milk 575',
      'Cold brew trenta 525',
      'Nitro cold brew tall 475',
      'Iced americano grande 425'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'group_buy',
    label: 'Mechanical Keyboard Bulk Order',
    conflict: 'International shipping is missing from the member item breakdown.',
    text: [
      'Custom keyboard group buy batch',
      'Linear switches pack 54',
      'Tactile switches pack 58',
      'Deskmat topography edition 25',
      'Linear switches smaller pack 42',
      'Stabilizers set 24',
      'Base shipping fee 35'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'restaurant_split',
    label: 'Birthday Dinner Invoice',
    conflict: 'Cocktails were not claimed by specific attendees.',
    text: [
      'Birthday dinner expenses',
      'Shared appetizers 42',
      'Ribeye steak 45',
      'Truffle risotto 32',
      'Seafood paella 38',
      'Grilled salmon 35',
      'Cocktails four glasses 60'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'ktv_room',
    label: 'Weekend Karaoke Booking',
    conflict: 'One attendee will stay for half the time and asks for reduced room fee.',
    text: [
      'Saturday night karaoke lineup',
      'VIP room four hours 180',
      'Snack platter combo 45',
      'Soda tower package 35',
      'Microphone cleaning fee 12',
      'Late-night surcharge 20'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'sports_venue',
    label: 'Indoor Soccer Pitch Reservation',
    conflict: 'One player dropped out and no substitute has confirmed.',
    text: [
      'Indoor soccer pitch reservation',
      'Pitch rental two hours 220',
      'Equipment rental bibs and balls 30',
      'Referee fee 40',
      'Parking passes 25',
      'Water pack 18'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'ticket_activity',
    label: 'Theme Park Group Pass',
    conflict: 'The group may fall below the discount threshold if one person drops.',
    text: [
      'Festival season theme park passes',
      'Adult single ticket 85',
      'Group discount ticket 70',
      'Locker rental 12',
      'Shuttle bus seat 18',
      'Meal voucher 25'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'rental_share',
    label: 'Ski Cabin Weekend Lodging',
    conflict: 'Some participants opted out of one shared surcharge.',
    text: [
      'Ski cabin weekend lodging',
      'Base rent 1200',
      'Cleaning fee 150',
      'Local lodging tax 96',
      'Hot tub service surcharge 75',
      'Firewood bundle 42'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'generic_split',
    label: 'Co-Working Desk Share',
    conflict: 'Meeting room overage may belong to only one partner.',
    text: [
      'Innovation hub desk share',
      'Dedicated desk base rate 450',
      'High speed fiber add-on 40',
      'Printing credits 15',
      'Meeting room overage fee 65',
      'Shared coffee supplies 22'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'drink_order',
    label: 'Boba Office Catering',
    conflict: 'One drink is missing mandatory ice and sweetness fields.',
    text: [
      'Boba break breakdown',
      'Brown sugar milk tea 750',
      'Classic milk tea herbal jelly 600',
      'Mango green tea cheese foam 700',
      'Taro milk tea large 650',
      'Delivery fee 499'
    ].join('\n')
  },
  {
    lang: 'en',
    taskType: 'group_buy',
    label: 'Board Game Collective Pledge',
    conflict: 'One add-on is unclaimed and should not be assigned automatically.',
    text: [
      'Board game collective pledge',
      'Core box tier 90',
      'Deluxe edition tier 140',
      'Second core box tier 90',
      'All-in gameplay bundle 210',
      'Custom dice set add-on 25'
    ].join('\n')
  }
];

const scenarioCases = scenarios.map((scenario, index) => ({
  ...scenario,
  id: `${scenario.lang}_${String(index + 1).padStart(2, '0')}_${scenario.taskType}`
}));

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    rounds: 20,
    concurrency: 4,
    timeoutMs: 20000,
    outputDir: defaultOutputDir
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
    } else if (arg === '--concurrency' && next) {
      args.concurrency = Math.max(1, Math.min(12, Number(next) || args.concurrency));
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(5000, Number(next) || args.timeoutMs);
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
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
  throw new Error('socket.io join ack timed out');
}

async function joinRoomAsOwner(baseUrl, roomId, scenario, round, timeoutMs) {
  const handshake = await fetchText(makeSocketIoUrl(baseUrl), {}, timeoutMs);
  assertCondition(handshake.ok, `socket.io handshake failed: HTTP ${handshake.status} ${handshake.text}`);
  const openPacket = splitEngineIoPackets(handshake.text).find((packet) => packet.startsWith('0'));
  assertCondition(openPacket, 'socket.io handshake missing open packet');
  const open = JSON.parse(openPacket.slice(1));
  assertCondition(open?.sid, 'socket.io handshake missing sid');

  await socketIoPostPacket(baseUrl, open.sid, '40', timeoutMs);
  await sleep(5);

  const participantId = `stress-owner-${scenario.id}-${round}-${Math.random().toString(36).slice(2)}`;
  const displayName = scenario.lang === 'zh' ? `發起者${round}` : `Host ${round}`;
  const ackId = 0;
  const eventPacket = `42${ackId}${JSON.stringify([
    'joinRoom',
    {
      roomId,
      participantId,
      displayName
    }
  ])}`;
  await socketIoPostPacket(baseUrl, open.sid, eventPacket, timeoutMs);
  const ack = await pollSocketIoForAck(baseUrl, open.sid, ackId, timeoutMs);
  assertCondition(ack?.ok, `join room failed: ${ack?.error || 'unknown error'}`);
  assertCondition(ack?.participantId, 'join room response missing participant id');
  assertCondition(ack?.room?.ownerParticipantId === ack.participantId, 'joined participant did not become room owner');
  return {
    participantId: ack.participantId,
    room: ack.room
  };
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

async function createRoom(baseUrl, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms`, {
    method: 'POST'
  }, timeoutMs);
  assertCondition(response.ok, `create room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.id, 'create room response missing room id');
  return response.data;
}

async function uploadPriceText(baseUrl, roomId, scenario, timeoutMs) {
  const form = new FormData();
  form.append('menuImage', new Blob([onePixelPng], { type: 'image/png' }), `${scenario.taskType}.png`);
  form.append('ocrText', scenario.text);
  form.append('taskType', scenario.taskType);

  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/menu`, {
    method: 'POST',
    body: form
  }, timeoutMs);
  assertCondition(response.ok, `upload failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.menuLoaded === true, 'upload response did not mark menuLoaded=true');
  assertCondition(Array.isArray(response.data?.items), 'upload response missing items array');
  assertCondition(response.data.items.length >= 3, `expected at least 3 items, got ${response.data.items.length}`);
  assertCondition(response.data?.taskRouter?.taskType === scenario.taskType, `task type drifted: expected ${scenario.taskType}, got ${response.data?.taskRouter?.taskType}`);
  assertCondition(Boolean(response.data?.localOcr?.enabled), 'local text parser did not mark localOcr enabled');
  return response.data;
}

async function readRoom(baseUrl, roomId, timeoutMs) {
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}`, {}, timeoutMs);
  assertCondition(response.ok, `read room failed: HTTP ${response.status} ${response.data?.error || ''}`);
  assertCondition(response.data?.id === roomId, 'read room returned mismatched room id');
  return response.data;
}

async function createProposal(baseUrl, room, scenario, timeoutMs) {
  const ownerParticipantId = getOwnerParticipantId(room);
  assertCondition(ownerParticipantId, 'missing owner participant id');

  const beforeItemCount = Array.isArray(room.items) ? room.items.length : 0;
  const beforeMenuLoaded = Boolean(room.menuLoaded);
  const beforeProposalCount = Array.isArray(room.agentProposals) ? room.agentProposals.length : 0;

  const proposalBody = {
    participantId: ownerParticipantId,
    proposalType: 'missing_confirmation',
    summary: `Review ${scenario.label} items and ask participants to confirm their own selections.`,
    rationale: `The assistant can prepare a review draft, but the host remains responsible for the final confirmation. Scenario note: ${scenario.conflict}`,
    riskLevel: 'needs_human_review',
    payload: {
      taskType: scenario.taskType,
      nextStep: 'host_review'
    }
  };
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/agent-proposals`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(proposalBody)
  }, timeoutMs);

  assertCondition(response.ok, `proposal failed: HTTP ${response.status} ${response.data?.error || ''}`);

  const duplicateResponse = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/agent-proposals`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ...proposalBody,
      summary: `Replacement review draft for ${scenario.label}.`,
      payload: {
        ...proposalBody.payload,
        replacementCheck: true
      }
    })
  }, timeoutMs);

  assertCondition(duplicateResponse.ok, `replacement proposal failed: HTTP ${duplicateResponse.status} ${duplicateResponse.data?.error || ''}`);

  const after = await readRoom(baseUrl, room.id, timeoutMs);
  const afterItemCount = Array.isArray(after.items) ? after.items.length : 0;
  const afterProposalCount = Array.isArray(after.agentProposals) ? after.agentProposals.length : 0;
  const latestProposal = Array.isArray(after.agentProposals) ? after.agentProposals[0] : null;
  const pendingSameTypeCount = Array.isArray(after.agentProposals)
    ? after.agentProposals.filter((proposal) => proposal.status === 'pending_host_confirmation' && proposal.proposalType === 'missing_confirmation').length
    : 0;

  assertCondition(afterItemCount === beforeItemCount, `proposal changed item count: ${beforeItemCount} -> ${afterItemCount}`);
  assertCondition(Boolean(after.menuLoaded) === beforeMenuLoaded, 'proposal changed menuLoaded state');
  assertCondition(afterProposalCount === beforeProposalCount + 1, `proposal count mismatch: ${beforeProposalCount} -> ${afterProposalCount}`);
  assertCondition(latestProposal?.status === 'pending_host_confirmation', `proposal status mismatch: ${latestProposal?.status}`);
  assertCondition(latestProposal?.summary === `Replacement review draft for ${scenario.label}.`, 'latest same-type draft was not replaced');
  assertCondition(pendingSameTypeCount === 1, `pending same-type proposal count mismatch: ${pendingSameTypeCount}`);

  return {
    beforeItemCount,
    afterItemCount,
    beforeProposalCount,
    afterProposalCount,
    latestProposalStatus: latestProposal.status,
    pendingSameTypeCount,
    replacementKeptLatest: true
  };
}

async function runCase(baseUrl, scenario, round, timeoutMs) {
  const startedAt = Date.now();
  const room = await createRoom(baseUrl, timeoutMs);
  await joinRoomAsOwner(baseUrl, room.id, scenario, round, timeoutMs);
  const uploaded = await uploadPriceText(baseUrl, room.id, scenario, timeoutMs);
  const readBack = await readRoom(baseUrl, room.id, timeoutMs);
  const proposal = await createProposal(baseUrl, readBack, scenario, timeoutMs);
  return {
    ok: true,
    scenario: scenario.id,
    taskType: scenario.taskType,
    lang: scenario.lang,
    label: scenario.label,
    round,
    roomId: room.id,
    elapsedMs: Date.now() - startedAt,
    itemCount: uploaded.items.length,
    taskType: uploaded.taskRouter?.taskType,
    menuType: uploaded.menuType || null,
    localOcrEnabled: Boolean(uploaded.localOcr?.enabled),
    proposal
  };
}

async function runWithConcurrency(tasks, concurrency, worker) {
  const results = [];
  let cursor = 0;

  async function runWorker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(tasks[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return results;
}

function summarize(results) {
  const summaryByScenario = {};
  for (const scenario of scenarioCases) {
    const scenarioResults = results.filter((result) => result.scenario === scenario.id);
    const ok = scenarioResults.filter((result) => result.ok).length;
    const failed = scenarioResults.length - ok;
    const elapsed = scenarioResults
      .filter((result) => result.ok)
      .map((result) => Number(result.elapsedMs || 0));
    summaryByScenario[scenario.id] = {
      lang: scenario.lang,
      taskType: scenario.taskType,
      label: scenario.label,
      total: scenarioResults.length,
      ok,
      failed,
      minElapsedMs: elapsed.length ? Math.min(...elapsed) : 0,
      maxElapsedMs: elapsed.length ? Math.max(...elapsed) : 0,
      avgElapsedMs: elapsed.length
        ? Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length)
        : 0
    };
  }

  const total = results.length;
  const ok = results.filter((result) => result.ok).length;
  return {
    total,
    ok,
    failed: total - ok,
    summaryByScenario
  };
}

function renderMarkdown(args, summary, results) {
  const lines = [
    '# Local Contract Stress Evidence',
    '',
    `- Target: ${args.baseUrl}`,
    `- Rounds per scenario: ${args.rounds}`,
    `- Scenarios: ${scenarioCases.length}`,
    `- Total cases: ${summary.total}`,
    `- Passed: ${summary.ok}`,
    `- Failed: ${summary.failed}`,
    `- Concurrency: ${args.concurrency}`,
    `- Generated at: ${new Date().toISOString()}`,
    '',
    '## Scenario Summary',
    '',
    '| scenario | lang | task type | total | ok | failed | avg ms | max ms |',
    '|---|---|---|---:|---:|---:|---:|---:|'
  ];

  for (const [scenario, row] of Object.entries(summary.summaryByScenario)) {
    lines.push(`| ${scenario}: ${row.label} | ${row.lang} | ${row.taskType} | ${row.total} | ${row.ok} | ${row.failed} | ${row.avgElapsedMs} | ${row.maxElapsedMs} |`);
  }

  lines.push('', '## Checked Boundaries', '');
  lines.push('- Each case creates a fresh room.');
  lines.push('- Each case uploads a small image plus local copied price text.');
  lines.push('- Each case must parse at least three items without provider keys.');
  lines.push('- Each case must keep the selected task scenario stable.');
  lines.push('- Each case creates two same-type proposal-only drafts.');
  lines.push('- Same-type pending drafts must collapse to one latest visible decision.');
  lines.push('- The kept proposal must remain `pending_host_confirmation`.');
  lines.push('- Proposal creation must not change item count or loaded-room state.');
  lines.push('', '## Failed Cases', '');

  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    lines.push('- None.');
  } else {
    for (const result of failed) {
      lines.push(`- ${result.scenario} (${result.label}) round ${result.round}: ${result.error}`);
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
  for (const scenario of scenarioCases) {
    for (let round = 1; round <= args.rounds; round += 1) {
      tasks.push({ scenario, round });
    }
  }

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(args.outputDir, `local-contract-stress-${stamp}.json`);
  const mdPath = path.join(args.outputDir, `local-contract-stress-${stamp}.md`);

  console.log(`Target: ${args.baseUrl}`);
  console.log(`Scenarios: ${scenarioCases.length}`);
  console.log(`Rounds per scenario: ${args.rounds}`);
  console.log(`Total cases: ${tasks.length}`);

  const results = await runWithConcurrency(tasks, args.concurrency, async ({ scenario, round }, index) => {
    try {
      const result = await runCase(args.baseUrl, scenario, round, args.timeoutMs);
      console.log(`[${index + 1}/${tasks.length}] ${scenario.id} round ${round} OK ${result.elapsedMs}ms items=${result.itemCount}`);
      return result;
    } catch (error) {
      const result = {
        ok: false,
        scenario: scenario.id,
        taskType: scenario.taskType,
        lang: scenario.lang,
        label: scenario.label,
        round,
        elapsedMs: 0,
        error: error.name === 'AbortError' ? 'request timeout' : error.message
      };
      console.log(`[${index + 1}/${tasks.length}] ${scenario.id} round ${round} FAIL ${result.error}`);
      return result;
    } finally {
      await sleep(10);
    }
  });

  const summary = summarize(results);
  const payload = {
    args,
    health: health.data,
    scenarios: scenarioCases.map(({ id, lang, taskType, label, conflict }) => ({
      id,
      lang,
      taskType,
      label,
      conflict
    })),
    summary,
    results
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(mdPath, `${renderMarkdown(args, summary, results)}\n`);

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
