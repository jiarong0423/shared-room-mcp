import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceFiles = {
  server: path.join(projectRoot, 'server.js'),
  client: path.join(projectRoot, 'public', 'index.html'),
  packageJson: path.join(projectRoot, 'package.json'),
  license: path.join(projectRoot, 'LICENSE'),
  readme: path.join(projectRoot, 'README.md'),
  submission: path.join(projectRoot, 'docs', 'submission', 'WEBMCP_SUBMISSION.md'),
  mermaid: path.join(projectRoot, 'docs', 'architecture', 'ADAPTIVE_CONTRACT_MCP.md'),
  stressContracts: path.join(projectRoot, 'scripts', 'stress-local-contracts.mjs'),
  stressMemberRelease: path.join(projectRoot, 'scripts', 'stress-member-release.mjs')
};

const reportDir = path.join(projectRoot, 'docs', 'ai-generated', '2026Q3');
const reportBaseName = 'shared_room_task_gap_decoupling_audit_20260831';

function publicPath(filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
}

const expectedTaskTypes = [
  'auto',
  'group_buy',
  'drink_order',
  'restaurant_split',
  'ktv_room',
  'sports_venue',
  'ticket_activity',
  'rental_share',
  'generic_split'
];

const expectedTaskRouterContractFields = [
  'taskRouterContract',
  'adaptive-contract-task-router-contract.v1',
  'contractVersion',
  'supportedTaskTypes',
  'selectedTaskType',
  'inferredTaskType',
  'taskType',
  'confidenceScore',
  'confidenceReason',
  'reviewStatus',
  'riskPolicy',
  'thresholdKind',
  'splitMode',
  'evidenceStrength',
  'hasTaskConflict',
  'conflictTaskType',
  'lockedByUser',
  'aiRepairAllowed',
  'aiRepairScope',
  'forbiddenAiActions'
];

const expectedFormulaModules = [
  'sameItemMerge',
  'participantSubtotal',
  'grandTotal',
  'averageSplit',
  'thresholdRemaining',
  'optionDelta',
  'sharedFeeSplit',
  'depositGate',
  'tierDiscount',
  'extraPersonalClaim'
];

const expectedFormulaContractFields = [
  'formulaContract',
  'adaptive-contract-formula-contract.v1',
  'adaptive-contract-formula.v1',
  'formulaModuleContracts',
  'deterministicOnly',
  'activeModules',
  'pendingModules',
  'inputSources',
  'outputFields',
  'aiAllowed',
  'externalCalculationAllowed',
  'externalFormulaTargetsAllowed',
  'forbiddenExternalCalculationTargets',
  'google_sheets',
  'calculate_money',
  'change_formula',
  'assign_cost_pool',
  'override_claim_mode'
];

const expectedEvidenceContractFields = [
  'evidenceContract',
  'adaptive-contract-evidence-ocr-contract.v1',
  'evidenceLine',
  'localFirst',
  'localOcr',
  'imageInput',
  'acceptedEvidenceSources',
  'forbiddenEvidenceSources',
  'deterministicParser',
  'qualityGate',
  'aiRepairGate',
  'privacyBoundary',
  'user_uploaded_price_photo',
  'user_provided_local_ocr_text',
  'fake_account_scraping',
  'vendor_api_reverse_engineering',
  'cookies_or_authenticated_vendor_session',
  'storeRawOcrInSheets',
  'repairScope'
];

const expectedClaimAuditFields = [
  'claimAuditVersion',
  'sharedCandidateTotal',
  'personalClaimTotal',
  'claimedOrderCount',
  'claimLedgerCount',
  'pendingClaimCount',
  'claimStateCounts',
  'claimLedger',
  'claim_id',
  'item_id',
  'claimer_id',
  'mode',
  'cost_pool',
  'verifiers',
  'approvals',
  'state',
  'updated_at',
  'unconfirmedParticipantCount',
  'unconfirmedParticipants',
  'settlementReady',
  'rules'
];

const expectedWhitelistFields = [
  'room_id',
  'invite_code_hash',
  'device_id_hash',
  'display_name',
  'role',
  'status',
  'expires_at',
  'created_at',
  'last_seen_at',
  'notes'
];

const requiredWebMcpToolNames = [
  'inspect_room',
  'get_task_router',
  'get_claim_audit',
  'get_formula_contract',
  'get_trust_layer_contract',
  'suggest_next_actions',
  'create_action_proposal',
  'agentProposals',
  'pending_host_confirmation',
  'document.modelContext',
  'registerTool',
  'webMcpToolSurface',
  'adaptive-contract-webmcp-tools.v2',
  'trustLayerContract',
  'adaptive-contract-trust-layer-contract.v1',
  'check_whitelist',
  'enroll_device',
  'revoke_device'
];

const expectedSubmissionPackageFields = [
  'MIT License',
  '"license": "MIT"',
  'WebMCP Hackathon Submission Packet',
  'Live URL',
  'Public repository URL',
  'YouTube demo URL',
  'docs/testing/VALIDATION_EVIDENCE.md',
  'What Changed After August 25, 2026',
  'document.modelContext.registerTool()',
  'Environment Variables',
  'TRUST_LAYER_SPREADSHEET_ID',
  'RATE_LIMIT_WINDOW_MS',
  'MENU_PARSE_RATE_LIMIT_MAX',
  'GEMINI_API_KEY',
  'Do not commit API keys',
  'Demo Script',
  'Compliance Notes'
];

const expectedTestingFields = [
  'stress:contracts',
  'stress-local-contracts.mjs',
  'stress:member-release',
  'stress-member-release.mjs',
  'VALIDATION_EVIDENCE.md',
  'scenarioCases',
  'joinRoomAsOwner',
  'local copied price text',
  'pending_host_confirmation',
  'Proposal creation must not change item count',
  'Traditional Chinese and English scenarios',
  '20 rounds per scenario',
  'AI/OCR upload creates a draft list and keeps member claiming closed',
  'memberClaimBeforeOpenBlocked',
  'hostParsedItemEditAfterOpenBlocked',
  'hostOpenAllowed'
];

function readRequiredFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read required file ${filePath}: ${error.message}`);
  }
}

function hasAll(text, markers) {
  return markers.map((marker) => ({
    marker,
    present: text.includes(marker)
  }));
}

function statusFromMissing(missing, partial = false) {
  if (missing.length === 0 && !partial) return 'ready';
  if (missing.length === 0 && partial) return 'partial';
  if (missing.length > 0 && partial) return 'partial';
  return 'missing';
}

function buildCheck(id, title, layer, priority, expected, evidence, remediation) {
  const missing = evidence.filter((entry) => !entry.present).map((entry) => entry.marker);
  return {
    id,
    title,
    layer,
    priority,
    status: missing.length === 0 ? 'ready' : 'partial',
    expected,
    missing,
    evidence,
    remediation
  };
}

function makeGap(id, title, layer, priority, status, evidence, nextAction, writeRisk = 'low') {
  return {
    id,
    title,
    layer,
    priority,
    status,
    evidence,
    nextAction,
    writeRisk
  };
}

function renderTable(rows) {
  const lines = [
    '| importance | area | status | finding | next action |',
    '|---|---|---|---|---|'
  ];
  for (const row of rows) {
    lines.push(`| ${row.priority} | ${row.layer} | ${row.status} | ${row.title} | ${row.nextAction} |`);
  }
  return lines.join('\n');
}

function renderMarkerList(title, markers) {
  const lines = [`### ${title}`];
  for (const marker of markers) {
    const icon = marker.present ? 'OK' : 'MISSING';
    lines.push(`- ${icon}: \`${marker.marker}\``);
  }
  return lines.join('\n');
}

function main() {
  const contents = Object.fromEntries(
    Object.entries(sourceFiles).map(([key, filePath]) => [key, readRequiredFile(filePath)])
  );

  const allSource = Object.values(contents).join('\n');
  const taskEvidence = hasAll(allSource, expectedTaskTypes);
  const taskRouterContractEvidence = hasAll(allSource, expectedTaskRouterContractFields);
  const formulaEvidence = hasAll(allSource, expectedFormulaModules);
  const formulaContractEvidence = hasAll(allSource, expectedFormulaContractFields);
  const evidenceContractEvidence = hasAll(allSource, expectedEvidenceContractFields);
  const claimAuditEvidence = hasAll(allSource, expectedClaimAuditFields);
  const whitelistEvidence = hasAll(allSource, expectedWhitelistFields);
  const webMcpEvidence = hasAll(allSource, requiredWebMcpToolNames);
  const submissionEvidence = hasAll(allSource, expectedSubmissionPackageFields);
  const testingEvidence = hasAll(allSource, expectedTestingFields);
  const hasFormulaSnapshot = contents.server.includes('function buildRoomFormulaSnapshot')
    && contents.server.includes('formulaResults')
    && contents.server.includes('adaptive-contract-formula.v1');
  const hasFormulaContract = [
    'formulaContract',
    'adaptive-contract-formula-contract.v1',
    'formulaModuleContracts',
    'deterministicOnly',
    'activeModules',
    'pendingModules',
    'aiAllowed'
  ].every((marker) => contents.server.includes(marker));
  const hasPerClaimLedger = [
    'claimLedger',
    'claim_id',
    'item_id',
    'claimer_id',
    'cost_pool',
    'verifiers',
    'approvals',
    'state',
    'updated_at'
  ].every((marker) => contents.server.includes(marker));
  const hasTaskConflictGate = [
    'hasTaskConflict',
    'conflictTaskType',
    "type: 'task_conflict'",
    'taskConflict',
    'needs_human_review'
  ].every((marker) => contents.server.includes(marker));
  const hasWebMcpToolSurface = [
    'document.modelContext',
    'registerTool',
    'inspect_room',
    'get_task_router',
    'get_claim_audit',
    'get_formula_contract',
    'get_trust_layer_contract',
    'webMcpToolSurface',
    'trustLayerContract'
  ].every((marker) => allSource.includes(marker));
  const hasEvidenceContract = expectedEvidenceContractFields
    .every((marker) => allSource.includes(marker));
  const hasContractStressMatrix = expectedTestingFields
    .every((marker) => allSource.includes(marker));
  const hasOpenGateContract = [
    'itemsOpenForMembers',
    'openItemsForMembers',
    'updateParsedItem',
    'removeParsedItem',
    'memberClaimBeforeOpenBlocked',
    'memberParsedItemEditBlocked',
    'hostParsedItemEditBeforeOpenAllowed',
    'memberOpenBlocked',
    'hostParsedItemEditAfterOpenBlocked'
  ].every((marker) => allSource.includes(marker));

  const checks = [
    buildCheck(
      'task-router-taxonomy',
      '固定任務模組分類',
      'task-router',
      'P0',
      expectedTaskTypes.concat(expectedTaskRouterContractFields),
      taskEvidence.concat(taskRouterContractEvidence),
      '維持 taskRouterContract 為任務路由獨立輸出；新增任務時必須同步 server、UI、README、Mermaid。'
    ),
    buildCheck(
      'formula-module-vocabulary',
      '公式模組詞彙',
      'formula-engine',
      'P0',
      expectedFormulaModules.concat(expectedFormulaContractFields),
      formulaEvidence.concat(formulaContractEvidence),
      '維持 formulaContract 為本地 deterministic formula engine 的獨立契約；P1 公式必須以 manual input 接入，不交給 AI。'
    ),
    buildCheck(
      'evidence-ocr-contract',
      '價格證據與 OCR 契約',
      'evidence-ocr',
      'P0',
      expectedEvidenceContractFields,
      evidenceContractEvidence,
      '維持 evidenceContract 為價格證據/OCR 的獨立契約；AI 只能 schema repair，OCR 文字與圖片不可送 Google Sheets。'
    ),
    buildCheck(
      'claim-audit-aggregate',
      '認領稽核聚合欄位',
      'claim-audit',
      'P0',
      expectedClaimAuditFields,
      claimAuditEvidence,
      '保留聚合欄位，下一步補 per-claim ledger 與 approvals state。'
    ),
    buildCheck(
      'google-sheets-whitelist-contract',
      'Google Sheets 短效白名單欄位',
      'trust-layer',
      'P1',
      expectedWhitelistFields,
      whitelistEvidence,
      '建立 MCP/Apps Script 工具前，先固定 hash-only schema 與 EXPIRED prune 規則。'
    ),
    buildCheck(
      'webmcp-tool-surface',
      'WebMCP 工具面',
      'webmcp',
      'P0',
      requiredWebMcpToolNames,
      webMcpEvidence,
      '補 WebMCP manifest 與 read-only room inspection tools；白名單工具維持 P1。'
    ),
    buildCheck(
      'submission-local-package',
      '本地比賽提交包',
      'submission',
      'P0',
      expectedSubmissionPackageFields,
      submissionEvidence,
      '保持 LICENSE、README、submission packet 與 env 需求同步；公開 repo、live URL、YouTube 仍需人工提交前確認。'
    ),
    buildCheck(
      'local-contract-stress-matrix',
      '本地合約壓測矩陣',
      'testing',
      'P0',
      expectedTestingFields,
      testingEvidence,
      '保持 20 個中英文情境 x 20 輪壓測可重跑；草稿必須停在發起者人工確認前。'
    )
  ];

  const gaps = [
    makeGap(
      'GAP-P0-001',
      '公式引擎合約狀態',
      'formula-engine',
      'P0',
      hasFormulaSnapshot && hasFormulaContract ? 'ready' : hasFormulaSnapshot ? 'partial' : 'open',
      hasFormulaSnapshot && hasFormulaContract
        ? 'server 已輸出 formulaContract 與 formulaResults；active/P1 模組已明確分離，AI 被禁止計算金額或覆寫公式。'
        : hasFormulaSnapshot
        ? 'server 已有 buildRoomFormulaSnapshot 與 formulaResults；仍缺 formulaContract 與 active/P1 模組狀態。'
        : '目前已有 grandTotal、sharedCandidateTotal、personalClaimTotal、thresholdRemaining、averageSplit，但計算仍分散在 server serializeRoom 與 public/index.html。',
      hasFormulaSnapshot && hasFormulaContract
        ? '下一步在 formula-controls 線補 UI manual inputs；不需要更動 formula engine contract。'
        : hasFormulaSnapshot
        ? '補 formulaContract，列出 activeModules、pendingModules、inputSources、outputFields 與 forbiddenAiActions。'
        : '建立 deterministic formula contract，先輸出 formulaResults，再由 API 與 UI 單純渲染。',
      'medium'
    ),
    makeGap(
      'GAP-P0-002',
      '認領稽核合約狀態',
      'claim-audit',
      'P0',
      hasPerClaimLedger ? 'ready' : 'open',
      hasPerClaimLedger
        ? 'server 已輸出 audit.claimLedger，包含 claim_id、item_id、claimer_id、mode、cost_pool、verifiers、approvals、state、updated_at。'
        : '目前 audit 有 claimAuditVersion、未確認人數、共享/自認總額，但沒有 claim_id、item_id、claimer_id、verifiers、approvals、state、updated_at。',
      hasPerClaimLedger
        ? '下一步在 testing 線補 socket 非空 ledger 測試；不需要改 claim audit contract。'
        : '新增 claim ledger pure builder；personal_claim 可由 claimant confirmed settle，shared_candidate 需要 affected participants approvals。',
      'medium'
    ),
    makeGap(
      'GAP-P0-003',
      'WebMCP 工具面狀態',
      'webmcp',
      'P0',
      hasWebMcpToolSurface ? 'ready' : statusFromMissing(webMcpEvidence.filter((entry) => !entry.present)),
      hasWebMcpToolSurface
        ? '前端已使用 document.modelContext.registerTool 註冊 read-only inspection tools 與 proposal-only draft tool，後端 API 已輸出 webMcpToolSurface、agentProposals 與 trustLayerContract。'
        : 'README 已對齊 WebMCP challenge，但專案還沒有完整 WebMCP tool surface。',
      hasWebMcpToolSurface
        ? '下一步只需要在瀏覽器支援 WebMCP 的環境做真機 demo；Sheets 寫入 bridge 仍屬 P1。'
        : '先做 read-only tools 與 proposal-only draft tool；避免第一版就碰外部寫入。',
      'medium'
    ),
    makeGap(
      'GAP-P0-004',
      '任務衝突與 AI 修補閘門狀態',
      'ai-repair-gate',
      'P0',
      hasTaskConflictGate ? 'ready' : 'open',
      hasTaskConflictGate
        ? 'server 已輸出 hasTaskConflict/conflictTaskType，且 parseQuality 會產生 task_conflict high issue 與 taskConflict flag。'
        : 'taskRouter 已有 confidence 與 reviewStatus；quality gate 目前主要看 OCR 品質，尚未把 user-selected task 與 evidence conflict 變成明確 high issue。',
      hasTaskConflictGate
        ? '下一步在 testing 線補 conflict smoke case，確認手動鎖定錯誤任務時 local-first 不放行。'
        : '在 parseQuality issues 補 task_conflict，高風險時才允許 AI schema repair 或人工確認。',
      'low'
    ),
    makeGap(
      'GAP-P0-005',
      '提交包狀態',
      'submission',
      'P0',
      statusFromMissing(submissionEvidence.filter((entry) => !entry.present), true),
      submissionEvidence.every((entry) => entry.present)
        ? '本地已補 LICENSE、package license、英文 submission packet、env 需求、demo script、合規邊界、public repo URL、live URL 與驗證證據；YouTube URL 仍需在 Devpost 提交前填入正式連結。'
        : 'Devpost 需要 live URL、public repo、OSS license、英文說明、三分鐘內 YouTube demo；本地提交包仍有欄位缺口。',
      submissionEvidence.every((entry) => entry.present)
        ? 'YouTube demo 完成後補入 submission packet 的正式 URL。'
        : '補 LICENSE 與 English submission checklist，並標記既有專案改造範圍。',
      'low'
    ),
    makeGap(
      'GAP-P1-001',
      'Google Sheets 白名單仍是設計稿',
      'trust-layer',
      'P1',
      statusFromMissing(whitelistEvidence.filter((entry) => !entry.present), true),
      'README 已有 hash-only schema，但沒有 check/enroll/revoke implementation，也沒有 expires prune。',
      '建立 Sheets bridge P1；只存短效 hash，不存原始 device id、付款資訊、社群帳號。',
      'medium'
    ),
    makeGap(
      'GAP-P1-002',
      '價格證據與 OCR contract 狀態',
      'evidence-ocr',
      'P0',
      hasEvidenceContract ? 'ready' : 'open',
      hasEvidenceContract
        ? 'server 已輸出 evidenceContract；local-first、image input、accepted/forbidden evidence sources、qualityGate、aiRepairGate、privacyBoundary 已獨立。'
        : '目前支援貼上本地 OCR 文字與後端 deterministic parser，但尚未有獨立 evidence/OCR contract。',
      hasEvidenceContract
        ? '後續加強可評估 Web OCR/WASM OCR 或裝置端 companion；不影響六線解耦完成。'
        : '補 evidenceContract；保持 local-first，AI 只補 schema，OCR 文字與圖片不可送 Sheets。',
      'medium'
    ),
    makeGap(
      'GAP-P1-003',
      '任務特定公式輸入不足',
      'formula-controls',
      'P1',
      'open',
      '目前前端只有一個門檻欄位，尚未有服務費百分比、時數、押金是否納入、運費分攤、團體折扣、人數門檻。',
      '依任務模組顯示最少必要公式欄位，不讓 AI 計算金額。',
      'medium'
    ),
    makeGap(
      'GAP-P1-004',
      '本地合約與開放順序壓測矩陣狀態',
      'testing',
      'P1',
      hasContractStressMatrix && hasOpenGateContract ? 'ready' : 'open',
      hasContractStressMatrix
        ? hasOpenGateContract
          ? '已補 scripts/stress-local-contracts.mjs 與 scripts/stress-member-release.mjs；覆蓋 20 個中英文情境合約壓測，以及 AI 草稿、人審核、Member-Visibility Release、成員確認、發起者結算的順序壓測。'
          : '已補 scripts/stress-local-contracts.mjs 與 npm run stress:contracts；覆蓋 20 個中英文情境，但尚缺 Member-Visibility Release 順序壓測。'
        : '已有 npm run check 與 API smoke；尚未有可重跑的中英文多情境草稿壓測矩陣。',
      hasContractStressMatrix
        ? hasOpenGateContract
          ? '後續若新增公式、任務模組、或成員權限流程，先擴充兩個壓測矩陣再提交。'
          : '補 Member-Visibility Release 壓測，驗證成員開放前不能認領、發起者開放後不能改解析清單。'
        : '補 deterministic parser、task router、formula、claim audit、proposal-only stress matrix。',
      'low'
    )
  ];

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    projectRoot: '.',
    sourceFiles: Object.fromEntries(
      Object.entries(sourceFiles).map(([key, filePath]) => [key, publicPath(filePath)])
    ),
    checks,
    gaps,
    nextDecouplingBatches: [
      {
        batch: 'A',
        priority: 'P0',
        scope: 'formula-engine + claim-audit pure contracts',
        stopCondition: 'API response exposes formulaResults and claim ledger without changing settlement behavior.'
      },
      {
        batch: 'B',
        priority: 'P0',
        scope: 'WebMCP read-only + proposal-only tools',
        stopCondition: 'Agent can inspect room state and create host-reviewed draft proposals without browser scraping or final-state mutation.'
      },
      {
        batch: 'C',
        priority: 'P0',
        scope: 'task conflict quality gate + submission checklist',
        stopCondition: 'Mismatched evidence routes to manual review; LICENSE/submission checklist present.'
      },
      {
        batch: 'D',
        priority: 'P1',
        scope: 'Google Sheets short-lived whitelist',
        stopCondition: 'check/enroll/revoke tools operate on hash-only rows and expired rows fail closed.'
      },
      {
        batch: 'E',
        priority: 'P1',
        scope: 'task-specific formula controls',
        stopCondition: 'UI emits formula inputs for service fee, hourly rate, deposit, shipping, and group thresholds.'
      }
    ]
  };

  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `${reportBaseName}.json`);
  const mdPath = path.join(reportDir, `${reportBaseName}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const readyChecks = checks.filter((check) => check.status === 'ready').length;
  const markdown = [
    '# Shared Room MCP Task Gap Decoupling Audit',
    '',
    `Generated at: ${generatedAt}`,
    '',
    'Owner project: `.`',
    '',
    '## Decision',
    '',
    '目前可以參賽的核心方向成立：這是用 WebMCP 讓 AI 幫忙準備草稿、人類保留最後確認的共享房間。下一步不是再擴張情境，而是保持現有房間流程、驗證證據、Live URL、GitHub README 與 Demo 腳本一致。',
    '',
    '## Current Readiness',
    '',
    `- Checks ready: ${readyChecks} / ${checks.length}`,
    `- Open gaps: ${gaps.filter((gap) => gap.status === 'open').length}`,
    `- Partial gaps: ${gaps.filter((gap) => gap.status === 'partial').length}`,
    '',
    '## Gap Matrix',
    '',
    renderTable(gaps),
    '',
    '## Evidence Markers',
    '',
    renderMarkerList('Task modules', taskEvidence),
    '',
    renderMarkerList('Room type rules', taskRouterContractEvidence),
    '',
    renderMarkerList('Evidence/OCR rules', evidenceContractEvidence),
    '',
    renderMarkerList('Formula modules', formulaEvidence),
    '',
    renderMarkerList('Local calculation rules', formulaContractEvidence),
    '',
    renderMarkerList('Claim audit fields', claimAuditEvidence),
    '',
    renderMarkerList('Google Sheets whitelist fields', whitelistEvidence),
    '',
    renderMarkerList('WebMCP tool names', webMcpEvidence),
    '',
    renderMarkerList('Submission package', submissionEvidence),
    '',
    '## Work Batches',
    '',
    '| batch | priority | scope | stop condition |',
    '|---|---|---|---|',
    ...report.nextDecouplingBatches.map((batch) => `| ${batch.batch} | ${batch.priority} | ${batch.scope} | ${batch.stopCondition} |`),
    '',
    '## Stop Conditions',
    '',
    '- AI 只可協助整理 OCR/文字欄位，不可計算金額、指定認領者、改房間類型或仲裁爭議。',
    '- 公式、門檻、均分、額外單點自認必須留在本地頁面與伺服器規則內。',
    '- WebMCP 工具維持讀取與草稿；Sheets 白名單是選配信任層，不碰金流。',
    '- 每一批解耦完成後都要重跑 `npm run check` 與 `npm run audit:tasks`。',
    ''
  ].join('\n');
  fs.writeFileSync(mdPath, markdown);

  console.log(JSON.stringify({
    ok: true,
    generatedAt,
    checksReady: readyChecks,
    checksTotal: checks.length,
    openGaps: gaps.filter((gap) => gap.status === 'open').length,
    partialGaps: gaps.filter((gap) => gap.status === 'partial').length,
    jsonPath,
    mdPath
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
}
