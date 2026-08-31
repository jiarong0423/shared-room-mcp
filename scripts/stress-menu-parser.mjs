import fs from 'fs/promises';
import path from 'path';

const defaultImageDir = '/Users/sunjiarong/Desktop/圖檔';
const defaultBaseUrl = 'https://group-menu-order.zeabur.app';
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const sizeWords = [
  '小杯', '中杯', '大杯', '特大杯', '分享瓶', '瓶裝', '瓶', '熱', '冰',
  'small', 'medium', 'med', 'regular', 'reg', 'large', 'extra large',
  'x-large', 'share bottle', 's', 'm', 'l', 'xl'
];
const suspiciousMenuNoise = /(總糖量|總熱量|大卡|卡路里|熱量|糖量|建議表|使用期限|外送|回饋|點數|電話|地址|營業|店長推薦|不建議)/;
const suspiciousAddon = /^(加料|加購|加價|升級|免費升級|珍珠|波霸|椰果|仙草|布丁|蘆薈|脆纖果|百年仙草凍|鮮奶酪)$/;

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    imageDir: defaultImageDir,
    limit: 6,
    concurrency: 1,
    repeat: 1,
    timeoutMs: 70000,
    outputDir: 'logs/runtime',
    imageFiles: [],
    delayMs: 0,
    quotaRetry: true
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--base-url' && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === '--image-dir' && next) {
      args.imageDir = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      args.limit = Math.max(1, Number(next) || args.limit);
      index += 1;
    } else if (arg === '--concurrency' && next) {
      args.concurrency = Math.max(1, Math.min(4, Number(next) || args.concurrency));
      index += 1;
    } else if (arg === '--repeat' && next) {
      args.repeat = Math.max(1, Math.min(5, Number(next) || args.repeat));
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Math.max(10000, Number(next) || args.timeoutMs);
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === '--image' && next) {
      args.imageFiles.push(next);
      index += 1;
    } else if (arg === '--delay-ms' && next) {
      args.delayMs = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === '--no-quota-retry') {
      args.quotaRetry = false;
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, '');
  return args;
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'application/octet-stream';
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractRetryDelayMs(message) {
  const text = String(message || '');
  const match = text.match(/retry in\s+([0-9.]+)s/i);
  if (!match) {
    return 65000;
  }
  return Math.min(120000, Math.max(5000, Math.ceil(Number(match[1]) * 1000) + 2500));
}

async function discoverImages(imageDir, limit) {
  const entries = await fs.readdir(imageDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(imageDir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExtensions.has(ext)) {
      continue;
    }
    const stat = await fs.stat(filePath);
    files.push({
      path: filePath,
      name: entry.name,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }

  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

async function loadSpecifiedImages(imageFiles) {
  const files = [];
  for (const filePath of imageFiles) {
    const absolutePath = path.resolve(filePath);
    const stat = await fs.stat(absolutePath);
    files.push({
      path: absolutePath,
      name: path.basename(absolutePath),
      bytes: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }
  return files;
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, Object.assign({}, options, {
      signal: controller.signal
    }));
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = { error: `回應不是 JSON：${error.message}` };
    }
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
    throw new Error(response.data?.error || `建立房間失敗 HTTP ${response.status}`);
  }
  return response.data;
}

function normalizeNameForSize(name) {
  let text = String(name || '').toLowerCase();
  text = text.replace(/[（(].*?[）)]/g, '');
  for (const word of sizeWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), '');
  }
  return text.replace(/\s+/g, '').trim();
}

function hasSizeMarker(name) {
  const lower = String(name || '').toLowerCase();
  return sizeWords.some((word) => lower.includes(word.toLowerCase()))
    || /(^|[^a-z])([sml])($|[^a-z])/.test(lower);
}

function analyzeItems(room) {
  const issues = [];
  const items = Array.isArray(room?.items) ? room.items : [];
  const menuType = String(room?.menuType || 'unknown');

  if (items.length < 3) {
    issues.push({
      type: 'too_few_items',
      severity: 'high',
      detail: `只解析到 ${items.length} 個品項`
    });
  }
  if (items.length > 120) {
    issues.push({
      type: 'too_many_items',
      severity: 'medium',
      detail: `解析到 ${items.length} 個品項，可能把說明文字或營養資訊也當成品項`
    });
  }

  const exactNames = new Map();
  const baseNames = new Map();
  for (const item of items) {
    const name = String(item.name || '').trim();
    const price = Number(item.price);
    const exact = exactNames.get(name) || new Set();
    exact.add(price);
    exactNames.set(name, exact);

    const base = normalizeNameForSize(name);
    if (base) {
      const group = baseNames.get(base) || [];
      group.push(item);
      baseNames.set(base, group);
    }

    if (suspiciousMenuNoise.test(name)) {
      issues.push({
        type: 'menu_noise_as_item',
        severity: 'medium',
        item: name,
        price,
        detail: '疑似把營養資訊、說明或非點餐文字當成品項'
      });
    }

    if (suspiciousAddon.test(name)) {
      issues.push({
        type: 'addon_as_item',
        severity: 'medium',
        item: name,
        price,
        detail: '疑似把加料或升級選項當成獨立品項'
      });
    }

    if (menuType === 'drink' && price > 220) {
      issues.push({
        type: 'drink_price_outlier',
        severity: 'medium',
        item: name,
        price,
        detail: '飲料單價格偏高，可能讀到熱量或其他欄位'
      });
    }

    for (const group of Array.isArray(item.optionGroups) ? item.optionGroups : []) {
      if (group?.type !== 'addon') {
        continue;
      }
      if (group.selectionType !== 'multiple') {
        issues.push({
          type: 'addon_not_multiple',
          severity: 'high',
          item: name,
          detail: '加料群組必須是 multiple，否則無法同時選珍珠與椰果'
        });
      }
      const optionLabels = Array.isArray(group.options)
        ? group.options.map((option) => String(option.label || '').replace(/\s+/g, ''))
        : [];
      if (optionLabels.some((label) => /^(不加|不要|無|無加料|不需加料)$/i.test(label))) {
        issues.push({
          type: 'addon_contains_no_add',
          severity: 'medium',
          item: name,
          detail: '多選加料不應包含「不加」，未勾選即代表不加'
        });
      }
    }
  }

  for (const [name, prices] of exactNames.entries()) {
    if (prices.size > 1) {
      issues.push({
        type: 'same_name_multiple_prices',
        severity: 'high',
        item: name,
        prices: Array.from(prices).sort((a, b) => a - b),
        detail: '同品名有多個價格但名稱未拆大小杯或規格'
      });
    }
  }

  for (const [base, group] of baseNames.entries()) {
    const prices = Array.from(new Set(group.map((item) => Number(item.price)))).sort((a, b) => a - b);
    const names = Array.from(new Set(group.map((item) => String(item.name || '').trim())));
    if (group.length > 1 && prices.length > 1 && names.some((name) => !hasSizeMarker(name))) {
      issues.push({
        type: 'size_variant_missing_marker',
        severity: 'high',
        base,
        names,
        prices,
        detail: '疑似大小杯或規格價差，但部分名稱沒有標明規格'
      });
    }
  }

  return issues;
}

async function uploadMenuOnce(baseUrl, image, timeoutMs) {
  const room = await createRoom(baseUrl, timeoutMs);
  const buffer = await fs.readFile(image.path);
  const form = new FormData();
  form.append('menuImage', new Blob([buffer], {
    type: mimeFromPath(image.path)
  }), image.name);

  const startedAt = Date.now();
  const response = await fetchJson(`${baseUrl}/api/rooms/${encodeURIComponent(room.id)}/menu`, {
    method: 'POST',
    body: form
  }, timeoutMs);
  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    return {
      ok: false,
      image: image.path,
      imageBytes: image.bytes,
      roomId: room.id,
      status: response.status,
      elapsedMs,
      error: response.data?.error || `HTTP ${response.status}`,
      details: response.data?.details || null,
      itemCount: 0,
      menuType: null,
      issues: []
    };
  }

  const issues = analyzeItems(response.data);
  return {
    ok: true,
    image: image.path,
    imageBytes: image.bytes,
    roomId: room.id,
    status: response.status,
    elapsedMs,
    itemCount: Array.isArray(response.data?.items) ? response.data.items.length : 0,
    menuType: response.data?.menuType || null,
    grandTotal: response.data?.totals?.grandTotal || 0,
    issues,
    sampleItems: Array.isArray(response.data?.items)
      ? response.data.items.slice(0, 12).map((item) => ({
        name: item.name,
        price: item.price,
        supportsDrinkOptions: item.supportsDrinkOptions,
        optionGroups: item.optionGroups || []
      }))
      : []
  };
}

async function uploadMenu(baseUrl, image, timeoutMs, options = {}) {
  const first = await uploadMenuOnce(baseUrl, image, timeoutMs);
  const isQuotaError = !first.ok
    && first.status === 429
    && /quota|rate-limit|rate limit|retry in/i.test(`${first.error || ''} ${first.details || ''}`);

  if (!isQuotaError || !options.quotaRetry) {
    return first;
  }

  const delayMs = extractRetryDelayMs(first.error || first.details);
  console.log(`Quota hit for ${path.basename(image.path)}; retrying after ${Math.round(delayMs / 1000)}s`);
  await sleep(delayMs);
  const second = await uploadMenuOnce(baseUrl, image, timeoutMs);
  second.retryOfRoomId = first.roomId;
  second.retryDelayMs = delayMs;
  return second;
}

async function runWithConcurrency(tasks, concurrency, worker) {
  const results = [];
  let cursor = 0;

  async function runOne() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(tasks[index], index);
      } catch (error) {
        results[index] = {
          ok: false,
          image: tasks[index]?.path || '',
          error: error.name === 'AbortError' ? '請求逾時' : error.message,
          issues: []
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runOne()));
  return results;
}

function summarize(results) {
  const success = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const issueCounts = new Map();
  for (const result of results) {
    for (const issue of result.issues || []) {
      issueCounts.set(issue.type, (issueCounts.get(issue.type) || 0) + 1);
    }
  }

  const elapsedValues = success.map((result) => Number(result.elapsedMs || 0)).filter(Boolean);
  const avgElapsed = elapsedValues.length
    ? Math.round(elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length)
    : 0;
  const maxElapsed = elapsedValues.length ? Math.max(...elapsedValues) : 0;

  return {
    total: results.length,
    success: success.length,
    failed: failed.length,
    avgElapsedMs: avgElapsed,
    maxElapsedMs: maxElapsed,
    issueCounts: Object.fromEntries(Array.from(issueCounts.entries()).sort((a, b) => b[1] - a[1]))
  };
}

function buildMarkdownReport(args, images, results, summary) {
  const lines = [
    '# Menu Parser Stress Test',
    '',
    `- Target: ${args.baseUrl}`,
    `- Image source: ${args.imageFiles.length > 0 ? 'specified files' : args.imageDir}`,
    `- Images: ${images.length}`,
    `- Concurrency: ${args.concurrency}`,
    `- Repeat: ${args.repeat}`,
    `- Delay: ${args.delayMs} ms`,
    `- Quota retry: ${args.quotaRetry}`,
    `- Success: ${summary.success}/${summary.total}`,
    `- Avg elapsed: ${summary.avgElapsedMs} ms`,
    `- Max elapsed: ${summary.maxElapsedMs} ms`,
    '',
    '## Issue Counts',
    ''
  ];

  const issueEntries = Object.entries(summary.issueCounts);
  if (issueEntries.length === 0) {
    lines.push('- No automatic issues detected.');
  } else {
    for (const [type, count] of issueEntries) {
      lines.push(`- ${type}: ${count}`);
    }
  }

  lines.push('', '## Results', '');
  for (const result of results) {
    lines.push(`### ${path.basename(result.image || 'unknown')}`);
    lines.push('');
    lines.push(`- Status: ${result.ok ? 'OK' : 'FAILED'}`);
    lines.push(`- Room: ${result.roomId || '-'}`);
    lines.push(`- Elapsed: ${result.elapsedMs || 0} ms`);
    lines.push(`- Menu type: ${result.menuType || '-'}`);
    lines.push(`- Item count: ${result.itemCount || 0}`);
    if (!result.ok) {
      lines.push(`- Error: ${result.error || '-'}`);
      if (result.details) {
        lines.push(`- Details: ${result.details}`);
      }
    }
    if (Array.isArray(result.issues) && result.issues.length > 0) {
      lines.push('- Issues:');
      for (const issue of result.issues) {
        const target = issue.item || issue.base || '';
        lines.push(`  - [${issue.severity}] ${issue.type}${target ? `: ${target}` : ''} - ${issue.detail}`);
      }
    }
    if (Array.isArray(result.sampleItems) && result.sampleItems.length > 0) {
      lines.push('- Sample items:');
      for (const item of result.sampleItems) {
        lines.push(`  - ${item.name} / ${item.price} / drinkOptions=${item.supportsDrinkOptions}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(args.outputDir, { recursive: true });
  const images = args.imageFiles.length > 0
    ? await loadSpecifiedImages(args.imageFiles)
    : await discoverImages(args.imageDir, args.limit);
  const tasks = [];
  for (let repeat = 0; repeat < args.repeat; repeat += 1) {
    tasks.push(...images);
  }

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const jsonlPath = path.join(args.outputDir, `menu-parser-stress-${stamp}.jsonl`);
  const reportPath = path.join(args.outputDir, `menu-parser-stress-${stamp}.md`);

  console.log(`Target: ${args.baseUrl}`);
  console.log(`Images: ${images.length}, tasks: ${tasks.length}, concurrency: ${args.concurrency}`);

  const results = await runWithConcurrency(tasks, args.concurrency, async (image, index) => {
    if (args.delayMs > 0 && index > 0) {
      await sleep(args.delayMs);
    }
    const result = await uploadMenu(args.baseUrl, image, args.timeoutMs, {
      quotaRetry: args.quotaRetry
    });
    await fs.appendFile(jsonlPath, `${JSON.stringify(result)}\n`);
    const issueText = result.issues?.length ? `, issues=${result.issues.length}` : '';
    console.log(`[${index + 1}/${tasks.length}] ${path.basename(image.path)} ${result.ok ? 'OK' : 'FAIL'} ${result.elapsedMs || 0}ms items=${result.itemCount || 0}${issueText}`);
    return result;
  });

  const summary = summarize(results);
  const report = buildMarkdownReport(args, images, results, summary);
  await fs.writeFile(reportPath, report);

  console.log(JSON.stringify({
    summary,
    jsonlPath,
    reportPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
