import express from 'express';
import fs from 'fs';
import http from 'http';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GoogleGenAI, Type } from '@google/genai';
import {
  buildAdaptivePipelineMetadata,
  buildAdaptivePromptLines,
  buildExtractionFeatureProfile,
  scoreAdaptiveParseQuality
} from './lib/adaptive/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const configuredCorsOrigin = String(process.env.CORS_ORIGIN || '').trim();
const io = new Server(server, configuredCorsOrigin
  ? {
    cors: {
      origin: configuredCorsOrigin
    }
  }
  : {});

function parsePort(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

const hasConfiguredPort = typeof process.env.PORT === 'string' && process.env.PORT.trim() !== '';
const port = parsePort(process.env.PORT) || parsePort(process.env.WEB_PORT) || (hasConfiguredPort ? 8080 : 3000);
const host = process.env.HOST || '0.0.0.0';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const geminiFallbackModels = (process.env.GEMINI_MODEL_FALLBACKS || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const geminiRetryAttempts = Math.max(1, Math.min(3, Number(process.env.GEMINI_RETRY_ATTEMPTS || 1)));
const geminiTimeoutMs = Math.max(8000, Math.min(60000, Number(process.env.GEMINI_TIMEOUT_MS || 25000)));
const openAiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const openAiFallbackModels = (process.env.OPENAI_MODEL_FALLBACKS || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const openAiTimeoutMs = Math.max(8000, Math.min(90000, Number(process.env.OPENAI_TIMEOUT_MS || 35000)));
const openAiMaxOutputTokens = Math.max(1024, Math.min(64000, Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 16000)));
const openAiImageDetails = new Set(['low', 'high', 'auto', 'original']);
const openAiImageDetail = openAiImageDetails.has(String(process.env.OPENAI_IMAGE_DETAIL || '').toLowerCase())
  ? String(process.env.OPENAI_IMAGE_DETAIL).toLowerCase()
  : 'high';
const localVisionBaseUrl = String(process.env.LOCAL_VISION_BASE_URL || '').trim().replace(/\/+$/, '');
const localVisionModel = String(process.env.LOCAL_VISION_MODEL || '').trim();
const localVisionApiKey = String(process.env.LOCAL_VISION_API_KEY || '').trim();
const localVisionTimeoutMs = Math.max(8000, Math.min(180000, Number(process.env.LOCAL_VISION_TIMEOUT_MS || 60000)));
const localVisionMaxOutputTokens = Math.max(1024, Math.min(64000, Number(process.env.LOCAL_VISION_MAX_OUTPUT_TOKENS || 16000)));
const localVisionImageDetail = openAiImageDetails.has(String(process.env.LOCAL_VISION_IMAGE_DETAIL || '').toLowerCase())
  ? String(process.env.LOCAL_VISION_IMAGE_DETAIL).toLowerCase()
  : openAiImageDetail;
const localVisionApiStyles = new Set(['chat', 'responses']);
const localVisionApiStyle = localVisionApiStyles.has(String(process.env.LOCAL_VISION_API_STYLE || '').toLowerCase())
  ? String(process.env.LOCAL_VISION_API_STYLE).toLowerCase()
  : 'chat';
const allowRemoteVisionFallback = String(process.env.ALLOW_REMOTE_VISION_FALLBACK || 'false').toLowerCase() === 'true';
const aiProviderTypes = new Set(['local_vision', 'gemini', 'openai']);
const aiProviderOrder = normalizeAiProviderOrder(process.env.AI_PROVIDER_ORDER || 'local_vision,gemini,openai');
const roomTtlMs = Number(process.env.ROOM_TTL_HOURS || 12) * 60 * 60 * 1000;
const maxImageMb = Number(process.env.MAX_IMAGE_MB || 8);
const maxImageBytes = maxImageMb * 1024 * 1024;
const rateLimitWindowMs = Math.max(1000, Math.min(15 * 60 * 1000, Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000)));
const apiRateLimitMax = Math.max(10, Math.min(3000, Number(process.env.API_RATE_LIMIT_MAX || 180)));
const roomCreateRateLimitMax = Math.max(2, Math.min(300, Number(process.env.ROOM_CREATE_RATE_LIMIT_MAX || 20)));
const menuParseRateLimitMax = Math.max(1, Math.min(120, Number(process.env.MENU_PARSE_RATE_LIMIT_MAX || 30)));
const imageMaxDimension = Math.max(640, Math.min(1800, Number(process.env.IMAGE_MAX_DIMENSION || 1400)));
const imageOcrTargetDimension = Math.max(imageMaxDimension, Math.min(2400, Number(process.env.IMAGE_OCR_TARGET_DIMENSION || 1800)));
const imageJpegQuality = Math.max(50, Math.min(86, Number(process.env.IMAGE_JPEG_QUALITY || 80)));
const itemThumbSize = Math.max(96, Math.min(360, Number(process.env.ITEM_THUMB_SIZE || 160)));
const localOcrMaxChars = Math.max(0, Math.min(24000, Number(process.env.LOCAL_OCR_MAX_CHARS || 12000)));
const localOcrFirst = String(process.env.LOCAL_OCR_FIRST || 'true').toLowerCase() !== 'false';
const localOcrMinItems = Math.max(1, Math.min(20, Number(process.env.LOCAL_OCR_MIN_ITEMS || 3)));
const localOcrOnlyReviewIssueId = 'local_ocr_only_requires_visual_review';
const llmVisualReviewSourceModes = new Set([
  'local_ocr_plus_local_vision',
  'local_ocr_plus_llm_visual_review'
]);
const trustLayerSpreadsheetId = String(process.env.TRUST_LAYER_SPREADSHEET_ID || '').trim();
const trustLayerSpreadsheetUrl = trustLayerSpreadsheetId
  ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(trustLayerSpreadsheetId)}/edit`
  : '';
const roomPersistenceEnabled = String(process.env.ROOM_PERSISTENCE || 'json').toLowerCase() !== 'memory';
const roomStorePath = path.resolve(__dirname, process.env.ROOM_STORE_PATH || 'data/rooms.json');
const guardrailMemoryPath = path.resolve(__dirname, process.env.GUARDRAIL_MEMORY_PATH || 'data/guardrail-memory.json');
const roomStoreVersion = 'acmcp-room-store.v1';
const guardrailMemoryVersion = 'shared-room-guardrail-memory.v1';
const roomPersistDebounceMs = Math.max(0, Math.min(1000, Number(process.env.ROOM_PERSIST_DEBOUNCE_MS || 35)));
const roomPersistJitterMs = Math.max(0, Math.min(2000, Number(process.env.ROOM_PERSIST_JITTER_MS || 120)));
const rooms = new Map();
let roomPersistTimer = null;
let roomPersistPendingReason = '';
const geminiApiKeyNames = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_GEMINI_API_KEY',
  'GEMINI_KEY'
];
const openAiApiKeyNames = [
  'OPENAI_API_KEY'
];
const menuModes = new Set(['auto', 'general', 'drink']);
const menuTypes = new Set(['general', 'drink', 'mixed']);
const roomTaskTypes = new Set([
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
const defaultTaskRouter = Object.freeze({
  taskType: 'generic_split',
  confidenceScore: 0.42,
  confidenceReason: '未提供任務類型，先用一般分帳房處理。',
  riskPolicy: 'conservative',
  thresholdKind: 'none',
  splitMode: 'individual_items',
  evidenceStrength: 'medium',
  reviewStatus: 'needs_human_review',
  fixedTaxonomyVersion: 'acmcp-task-router.v1'
});
const taskRouterContractVersion = 'acmcp-task-router-contract.v1';
const formulaContractVersion = 'acmcp-formula-contract.v1';
const formulaResultVersion = 'acmcp-formula.v1';
const formulaField = (name) => ['formulaResults', name].join('.');
const formulaModuleContracts = Object.freeze([
  {
    id: 'participantSubtotal',
    status: 'active',
    inputSource: 'participant.order',
    outputField: formulaField('participantSubtotal')
  },
  {
    id: 'sameItemMerge',
    status: 'active',
    inputSource: 'room.items + participant.order',
    outputField: formulaField('sameItemMerge')
  },
  {
    id: 'grandTotal',
    status: 'active',
    inputSource: formulaField('sameItemMerge'),
    outputField: formulaField('grandTotal')
  },
  {
    id: 'averageSplit',
    status: 'active',
    inputSource: 'sharedCandidateTotal + active participants',
    outputField: formulaField('averageSplit')
  },
  {
    id: 'optionDelta',
    status: 'active',
    inputSource: 'item.optionGroups + participant selected options',
    outputField: 'claimLedger.unit_price'
  },
  {
    id: 'extraPersonalClaim',
    status: 'active',
    inputSource: 'claimMode=personal_claim',
    outputField: formulaField('extraPersonalClaim')
  },
  {
    id: 'thresholdRemaining',
    status: 'p1_manual_input_required',
    inputSource: 'client threshold input',
    outputField: formulaField('thresholdRemaining')
  },
  {
    id: 'sharedFeeSplit',
    status: 'p1_manual_input_required',
    inputSource: 'service fee / room fee / venue fee inputs',
    outputField: formulaField('sharedFeeSplit')
  },
  {
    id: 'depositGate',
    status: 'p1_manual_input_required',
    inputSource: 'deposit include/exclude toggle',
    outputField: formulaField('depositGate')
  },
  {
    id: 'tierDiscount',
    status: 'p1_manual_input_required',
    inputSource: 'discount threshold and discount rule inputs',
    outputField: formulaField('tierDiscount')
  }
]);
const trustLayerContractVersion = 'acmcp-trust-layer-contract.v1';
const webMcpToolSurfaceVersion = 'acmcp-webmcp-tools.v2';
const webMcpImplementationName = ['document', 'modelContext', 'registerTool'].join('.');
const webMcpStateSource = ['browser', 'page', 'state'].join('_');
const evidenceContractVersion = 'acmcp-evidence-review.v1';
const serviceBlueprintContractVersion = 'acmcp-service-blueprint.v1';
const agentProposalContractVersion = 'acmcp-agent-proposal.v1';
const rateLimitBuckets = new Map();
const agentProposalTypes = new Set([
  'claim_assignment',
  'missing_confirmation',
  'evidence_review',
  'semantic_repair_draft',
  'task_router_review',
  'booking_draft',
  'service_request_draft',
  'activity_signup_draft',
  'generic_next_step'
]);
const agentProposalRiskLevels = new Set(['low', 'medium', 'needs_human_review']);
const agentProposalStatuses = new Set([
  'pending_host_confirmation',
  'accepted_by_host',
  'rejected_by_host'
]);
const optionGroupTypes = new Set(['size', 'addon', 'custom']);
const optionSelectionTypes = new Set(['single', 'multiple']);
const sweetnessOptions = ['正常糖', '少糖', '半糖', '微糖', '無糖'];
const iceOptions = ['正常冰', '少冰', '微冰', '去冰', '熱'];
const defaultDrinkOptions = {
  sweetness: '正常糖',
  ice: '正常冰'
};
const nonMenuPriceFieldPattern = /總糖量|糖量|總熱量|熱量|大卡|卡路里|營養|公克|克數|容量|毫升|ml|ML|代碼|編號|期限|效期|日期|使用期限|有效期限|電話|地址|營業|外送|回饋|點數|儲值|送點|建議表|統一編號|統編|發票號碼|收據號碼|卡號|末四碼|交易序號|機台|桌號|小計|總計|合計|實收|找零|服務費率|稅率|折扣率|入住|退房/;
const addonOnlyItemPattern = /^(加料|加購|加價|升級|免費升級|飲品免費升級|珍珠|波霸|椰果|仙草|布丁|蘆薈|脆纖果|百年仙草凍|鮮奶酪|奶蓋|加珍珠|加波霸|加椰果|加仙草|加布丁|加蘆薈|pearl\s*topping|tapioca\s*topping|boba\s*topping|oat\s*milk\s*upgrade|milk\s*upgrade|extra\s*shot|add-?on|topping|upgrade)$/i;
const noAddonOptionPattern = /^(不加|不要|無|無加料|不需加料|none|no)$/i;
const standaloneBottlePattern = /(?:^|[\s｜|/（(])瓶(?:$|[\s｜|/）)])|瓶$/;
const drinkSizePattern = /小杯|中杯|大杯|特大杯|分享瓶|瓶裝|加大|小瓶|中瓶|大瓶|\bS\b|\bM\b|\bL\b|\bXL\b|\bSmall\b|\bMedium\b|\bMed\b|\bRegular\b|\bReg\b|\bLarge\b|\bExtra\s*Large\b|\bX-Large\b/i;
const largeDrinkSizePattern = /大杯|特大杯|分享瓶|瓶裝|加大|大瓶|\bL\b|\bXL\b|\bLarge\b|\bExtra\s*Large\b|\bX-Large\b/i;
const localOcrPricePattern = /(?:NT\$?\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,4})(?:\s*(?:元|圓|塊))?/g;
const localOcrRuleAmountPattern = /(?:NT\$?\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,6})(?:\s*(?:元|圓|塊))?/g;
const localOcrSectionPattern = /^(飯類|麵類|粥品|湯品|湯類|小菜|點心|炸物|主餐|套餐|便當|飲品|飲料|咖啡|茶飲|鮮奶茶|果汁|冰沙|甜點|加料|配料|包廂|場地|場租|票券|門票|活動|課程|器材|租借|低消|服務費|Toppings?|Add-?ons?|Meals?|Drinks?|Coffee|Tea|Rooms?|Tickets?|Rentals?|Activities?|Courts?|Venues?)$/i;
const localOcrSkipLinePattern = /總糖量|糖量|總熱量|熱量|大卡|卡路里|營養|公克|克數|容量|毫升|ml|ML|電話|电话|手機|手机|聯絡|联系|聯繫|客服|tel|phone|cell|mobile|fax|地址|住址|門牌|门牌|路段|街|巷|弄|號|号|address|addr|營業|营业|營業時間|营业时间|business hours|opening hours|service hours|統一編號|统一编号|統編|税号|稅號|tax id|vat|business number|發票號碼|发票号码|invoice|booking id|reservation no|order no|預約編號|预约编号|回饋|點數|儲值|送\s*[0-9,]+\s*點|送點|建議表|使用期限|有效期限|卡號|末四碼|交易序號|機台|桌號|小計|總計|合計|實收|找零|服務費率|稅率|每梯次|名額|人數|限額|行程約|%/i;
const localOcrPaymentLinePattern = /^(?:現金|刷卡|信用卡|付款|支付|cash|card|paid)\s*(?:NT\$?\s*)?[0-9,]+/i;
const localOcrQuantityContextPattern = /^(?:\s*(?:cups?|qty|quantity|count|pcs?|pieces?|orders?|sets?|boxes?|packs?|items?|people|persons?|pax|players?|attendees?|tickets?|hours?|hrs?|days?|人|位|杯|瓶|份|件|個|張|名|小時|鐘|天|組|盒|包|套|桶|次|顆)\b|\s*(?:人|位|杯|瓶|份|件|個|張|名|小時|鐘|天|組|盒|包|套|桶|次|顆))/i;
const localOcrQuantityPrefixPattern = /(?:^|\s)(?:qty|quantity|count|subtotal|total\s*qty|數量|小計|合計|總杯數|總數|人數)\s*$/i;
const localOcrAgeContextPattern = /^(?:\s*(?:歲|歲以上|歲以下|歲[（(]?含[）)]?|years?\s*old|yo)\b|\s*(?:歲|歲以上|歲以下|歲[（(]?含[）)]?))/i;
const localOcrItineraryHeadingPattern = /^\s*(?:行程|方案|路線|route|trip|tour)\s*[0-9一二三四五六七八九十]+\s*[：:、.)-]/i;
const localOcrSoldOutLinePattern = /售完|完售|缺貨|暫停供應|sold\s*out|out\s*of\s*stock|unavailable/i;
const localOcrFreeShippingRulePattern = /免運|免物流|免配送|free\s*shipping|free\s*delivery|free\s*shipping\s*gap/i;
const localOcrMinimumRulePattern = /門檻|滿額|起送|低消|最低消費|minimum\s*(?:order|spend|charge|consume)|min\.?\s*(?:order|spend|charge)|threshold/i;
const localOcrDiscountRulePattern = /數量優惠|滿件|滿\s*[0-9]+\s*(?:件|個|組|盒|包|pcs?|pieces?|items?)|滿\s*(?:NT\$?\s*)?[0-9,]+\s*(?:元|圓|塊)?\s*(?:折|減|抵)|[0-9.]+\s*折|買\s*[0-9]+\s*送\s*[0-9]+|第\s*[二三四五六七八九十0-9]+\s*件|折扣|折抵|優惠券|折價券|coupon|voucher|bulk\s*discount|volume\s*discount|quantity\s*discount|tier(?:ed)?\s*discount|buy\s*[0-9]+\s*get\s*[0-9]+|[0-9]+\s*for\s*[0-9]+|save\s*[0-9]+%|[0-9]+%\s*off|coupon\s*(?:code|discount)|promo(?:tion)?\s*(?:code|discount)|promo\s*code/i;
const suspiciousMenuNoise = /(總糖量|總熱量|大卡|卡路里|熱量|糖量|建議表|使用期限|外送|回饋|點數|電話|地址|營業|店長推薦|不建議)/;
const suspiciousAddon = /^(加料|加購|加價|升級|免費升級|飲品免費升級|珍珠|波霸|椰果|仙草|布丁|蘆薈|脆纖果|百年仙草凍|鮮奶酪|pearl\s*topping|tapioca\s*topping|boba\s*topping|oat\s*milk\s*upgrade|milk\s*upgrade|extra\s*shot|add-?on|topping|upgrade)$/i;
const menuCategories = new Set([
  'main',
  'side',
  'snack',
  'soup',
  'dessert',
  'drink',
  'set',
  'service',
  'ticket',
  'rental',
  'venue',
  'addon',
  'other'
]);
const priceRoles = new Set([
  'line_item',
  'shared_fixed_fee',
  'tax_rate',
  'tax_fixed_fee',
  'service_rate',
  'service_fixed_fee',
  'discount_rate',
  'discount_amount',
  'discount',
  'tax_and_fee',
  'deposit',
  'prepayment_down',
  'aggregate_subtotal',
  'aggregate_grand_total',
  'subtotal_observation',
  'grand_total_observation',
  'threshold_amount',
  'points_value',
  'non_price_context'
]);
const sourceNumberClasses = new Set([
  'currency_amount',
  'age_range',
  'itinerary_index',
  'percentage_rate',
  'capacity',
  'receipt_total',
  'payment_amount',
  'identifier',
  'points',
  'points_value',
  'distance',
  'duration',
  'date_time',
  'quantity',
  'unknown'
]);
const displaySurfaces = new Set([
  'member_selectable',
  'host_rule_panel',
  'audit_anchor',
  'metadata_only',
  'blocked_noise'
]);
const parserCandidateStatuses = new Set([
  'pending',
  'accepted',
  'rejected',
  'modified',
  'blocked'
]);
const reviewGateSeverities = new Set([
  'info',
  'warn',
  'block'
]);
const structuralReviewGateIds = new Set([
  'forbidden_context_number',
  'member_item_non_currency_number_review',
  'unresolved_formula_requires_edit'
]);
const reviewFlagTypes = new Set([
  'multiple_price_candidates',
  'deposit_detected',
  'prepayment_detected',
  'discount_scope_unclear',
  'tax_or_fee_detected',
  'arithmetic_mismatch',
  'missing_grand_total',
  'age_range_near_price',
  'itinerary_number_near_price',
  'percentage_near_price',
  'points_cash_confusion',
  'review_required',
  'threshold_advisory'
]);
const temperatureOptions = ['冷', '熱', '常溫', '冷熱皆可', '未標示'];
const spiceLevels = ['none', 'mild', 'medium', 'hot', 'extra_hot', 'unknown'];
const allowedDietaryFlags = new Set([
  'vegetarian',
  'vegan',
  'contains_meat',
  'contains_pork',
  'contains_beef',
  'contains_chicken',
  'contains_seafood',
  'contains_dairy',
  'contains_egg',
  'contains_nuts',
  'contains_caffeine',
  'decaf',
  'unknown'
]);
const allowedItemTags = new Set([
  'signature',
  'popular',
  'limited',
  'seasonal',
  'new',
  'discount',
  'combo',
  'shareable',
  'single_serving',
  'customizable',
  'per_person',
  'room_package',
  'time_limited',
  'spicy',
  'vegetarian',
  'caffeinated',
  'non_caffeinated',
  'manual_review'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxImageBytes,
    files: 1,
    fields: 4,
    fieldNameSize: 64,
    fieldSize: localOcrMaxChars + 1024,
    parts: 6
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new Error('只接受圖片檔案'));
      return;
    }
    cb(null, true);
  }
});

app.set('trust proxy', true);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '64kb' }));
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static('public', {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));
app.use('/api', createRateLimitMiddleware('api', apiRateLimitMax));

const menuSchema = {
  type: Type.OBJECT,
  properties: {
    menuType: {
      type: Type.STRING,
      description: '整張菜單類型，只能輸出 general、drink 或 mixed。一般餐點菜單輸出 general，飲料店菜單輸出 drink，同時有餐點與飲料輸出 mixed。'
    },
    items: {
      type: Type.ARRAY,
      description: '菜單品項清單。每一列必須是可點選的品項與單價。',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: '餐點或飲料品名。若圖片有 S/M/L、Small/Medium/Large、Regular/Large、小杯/中杯/大杯、L/瓶等尺寸價差，品名只輸出基礎名稱，尺寸放在 optionGroups，不要把 L 或 瓶 寫進品名。'
          },
          price: {
            type: Type.INTEGER,
            description: '單價，只能是整數，不含貨幣符號。若飲料表格有 L/瓶 兩欄價格，price 使用 L 欄或最低尺寸價格。'
          },
          priceRole: {
            type: Type.STRING,
            description: '價格角色，只能輸出 line_item、discount、tax_and_fee、deposit、prepayment_down、aggregate_subtotal 或 aggregate_grand_total。一般商品輸出 line_item；押金輸出 deposit；服務費或稅輸出 tax_and_fee；折扣輸出 discount。'
          },
          sourceNumberClass: {
            type: Type.STRING,
            description: '原始數字類型，只能輸出 currency_amount、age_range、itinerary_index、percentage_rate、receipt_total、payment_amount、points_value、distance、duration、quantity 或 unknown。'
          },
          currency: {
            type: Type.STRING,
            description: '幣別代碼，台幣輸出 TWD；未標示但明顯是本地台幣也輸出 TWD。'
          },
          quantity: {
            type: Type.INTEGER,
            description: '此列品項數量，沒有明確數量固定輸出 1。'
          },
          unit: {
            type: Type.STRING,
            description: '單位，例如 人、小時、晚、天、件、組、盒、公里。沒有標示輸出空字串。'
          },
          conditions: {
            type: Type.ARRAY,
            description: '影響價格但不是價格本身的條件，例如年齡、會員、平假日、時段、房型、公里、梯次。',
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description: '條件類型，例如 age、membership、day_type、time、capacity、distance、payment_role。'
                },
                label: {
                  type: Type.STRING,
                  description: '圖片或文字中看到的條件原文。'
                }
              },
              required: ['type', 'label']
            }
          },
          reviewFlags: {
            type: Type.ARRAY,
            description: '需要人工複查的原因代碼，例如 deposit_detected、discount_scope_unclear、age_range_near_price、percentage_near_price、points_cash_confusion。沒有就輸出空陣列。',
            items: {
              type: Type.STRING
            }
          },
          rawTextEvidence: {
            type: Type.STRING,
            description: '此 item 對應的原始 OCR 或圖片文字片段，用來讓人審核來源。'
          },
          confidence: {
            type: Type.NUMBER,
            description: '此 item 的解析信心，0 到 1。'
          },
          supportsDrinkOptions: {
            type: Type.BOOLEAN,
            description: '此品項是否適合甜度與冰塊選項。飲料品項為 true，一般餐點、小菜、便當、麵飯為 false。'
          },
          sourceImageIndex: {
            type: Type.INTEGER,
            description: '此品項來自第幾張菜單圖片，單張上傳固定輸出 1。'
          },
          category: {
            type: Type.STRING,
            description: '可分攤項目分類，只能輸出 main、side、snack、soup、dessert、drink、set、service、ticket、rental、venue、addon 或 other。餐飲主餐輸出 main，套餐/多人方案輸出 set，唱歌/活動服務費輸出 service，票券輸出 ticket，器材租借輸出 rental，場地/包廂/球場輸出 venue。'
          },
          sectionName: {
            type: Type.STRING,
            description: '圖片上此項目所屬區塊標題，例如 飯類、咖啡、季節限定、包廂、場地、票券、器材租借、低消。沒有明確區塊則輸出空字串。'
          },
          sizeLabel: {
            type: Type.STRING,
            description: '此列若本身就是固定份量或固定規格，輸出例如 小份、大份、單人、雙人、L、瓶、加大。若尺寸已放入 optionGroups 或沒有標示，輸出空字串。'
          },
          temperature: {
            type: Type.STRING,
            description: '飲品或餐點溫度，只能輸出 冷、熱、常溫、冷熱皆可 或 未標示。沒有明確標示輸出 未標示。'
          },
          spiceLevel: {
            type: Type.STRING,
            description: '辣度，只能輸出 none、mild、medium、hot、extra_hot 或 unknown。沒有辣度資訊輸出 unknown；明確不辣輸出 none。'
          },
          dietaryFlags: {
            type: Type.ARRAY,
            description: '可見飲食/成分標籤，只輸出 vegetarian、vegan、contains_meat、contains_pork、contains_beef、contains_chicken、contains_seafood、contains_dairy、contains_egg、contains_nuts、contains_caffeine、decaf、unknown。不要猜測圖片沒有寫的過敏原。',
            items: {
              type: Type.STRING
            }
          },
          tags: {
            type: Type.ARRAY,
            description: '可見銷售標籤，只輸出 signature、popular、limited、seasonal、new、discount、combo、shareable、single_serving、customizable、spicy、vegetarian、caffeinated、non_caffeinated、manual_review。沒有就輸出空陣列。',
            items: {
              type: Type.STRING
            }
          },
          note: {
            type: Type.STRING,
            description: '必要備註，例如 固定套餐含紅茶、包廂限 2 小時、需另收服務費、器材押金另計、圖片價格模糊需人工確認。沒有就輸出空字串，最多 60 字。'
          },
          optionGroups: {
            type: Type.ARRAY,
            description: '此品項可用的隱藏選項群組。只有菜單明確有大小杯、尺寸、加料或加價升級時才輸出；沒有就輸出空陣列。',
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  description: '選項群組名稱，例如 大小、Size、加料、升級。'
                },
                type: {
                  type: Type.STRING,
                  description: '只能輸出 size、addon 或 custom。大小杯輸出 size，加料輸出 addon。'
                },
                selectionType: {
                  type: Type.STRING,
                  description: '只能輸出 single 或 multiple。size/custom 固定 single；addon 固定 multiple，代表可同時選多個加料。'
                },
                options: {
                  type: Type.ARRAY,
                  description: '選項清單。size 群組需包含基準尺寸且 priceDelta 為 0；addon 群組只輸出可加購配料，不要輸出不加。',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: {
                        type: Type.STRING,
                        description: '選項名稱，例如 小杯、中杯、大杯、L、瓶、Small、Medium、Large、珍珠。'
                      },
                      priceDelta: {
                        type: Type.INTEGER,
                        description: '此選項相對於品項 price 的加價。原價或不加為 0，大杯加 10 就輸出 10。'
                      }
                    },
                    required: ['label', 'priceDelta']
                  }
                }
              },
              required: ['label', 'type', 'selectionType', 'options']
            }
          }
        },
        required: ['name', 'price', 'supportsDrinkOptions', 'sourceImageIndex']
      }
    },
    addonSection: {
      type: Type.OBJECT,
      description: '菜單上獨立的全域加料/配料區。若沒有看到加料區，detected 為 false 且 options 為空陣列。',
      properties: {
        detected: {
          type: Type.BOOLEAN,
          description: '是否看到獨立的加料、配料、Topping、Add-ons 區塊。'
        },
        label: {
          type: Type.STRING,
          description: '加料區標題，例如 加料、配料升級、ADD-ONS。沒有看到則輸出空字串。'
        },
        selectionType: {
          type: Type.STRING,
          description: '固定輸出 multiple。'
        },
        options: {
          type: Type.ARRAY,
          description: '全域加料選項，每個品項都必須有名稱與加價。若標題寫全區 +10，所有選項 priceDelta 都填 10。',
          items: {
            type: Type.OBJECT,
            properties: {
              label: {
                type: Type.STRING,
                description: '配料名稱，例如 珍珠、椰果、仙草凍。'
              },
              priceDelta: {
                type: Type.INTEGER,
                description: '加料加價整數。'
              }
            },
            required: ['label', 'priceDelta']
          }
        }
      },
      required: ['detected', 'label', 'selectionType', 'options']
    },
    warnings: {
      type: Type.ARRAY,
      description: '無法確認或疑似模糊的辨識提醒。',
      items: {
        type: Type.STRING
      }
    }
  },
  required: ['menuType', 'items', 'addonSection']
};

const openAiMenuSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['menuType', 'items', 'addonSection', 'warnings'],
  properties: {
    menuType: {
      type: 'string',
      enum: ['general', 'drink', 'mixed']
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'price',
          'supportsDrinkOptions',
          'sourceImageIndex',
          'category',
          'sectionName',
          'sizeLabel',
          'temperature',
          'spiceLevel',
          'dietaryFlags',
          'tags',
          'note',
          'optionGroups'
        ],
        properties: {
          name: {
            type: 'string'
          },
          price: {
            type: 'integer'
          },
          priceRole: {
            type: 'string',
            enum: ['line_item', 'discount', 'tax_and_fee', 'deposit', 'prepayment_down', 'aggregate_subtotal', 'aggregate_grand_total']
          },
          sourceNumberClass: {
            type: 'string',
            enum: ['currency_amount', 'age_range', 'itinerary_index', 'percentage_rate', 'receipt_total', 'payment_amount', 'points_value', 'distance', 'duration', 'quantity', 'unknown']
          },
          currency: {
            type: 'string'
          },
          quantity: {
            type: 'number'
          },
          unit: {
            type: 'string'
          },
          conditions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'label'],
              properties: {
                type: {
                  type: 'string'
                },
                label: {
                  type: 'string'
                }
              }
            }
          },
          reviewFlags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['multiple_price_candidates', 'deposit_detected', 'prepayment_detected', 'discount_scope_unclear', 'tax_or_fee_detected', 'arithmetic_mismatch', 'missing_grand_total', 'age_range_near_price', 'itinerary_number_near_price', 'percentage_near_price', 'points_cash_confusion', 'review_required']
            }
          },
          rawTextEvidence: {
            type: 'string'
          },
          confidence: {
            type: 'number'
          },
          supportsDrinkOptions: {
            type: 'boolean'
          },
          sourceImageIndex: {
            type: 'integer'
          },
          category: {
            type: 'string',
            enum: ['main', 'side', 'snack', 'soup', 'dessert', 'drink', 'set', 'service', 'ticket', 'rental', 'venue', 'addon', 'other']
          },
          sectionName: {
            type: 'string'
          },
          sizeLabel: {
            type: 'string'
          },
          temperature: {
            type: 'string',
            enum: ['冷', '熱', '常溫', '冷熱皆可', '未標示']
          },
          spiceLevel: {
            type: 'string',
            enum: ['none', 'mild', 'medium', 'hot', 'extra_hot', 'unknown']
          },
          dietaryFlags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['vegetarian', 'vegan', 'contains_meat', 'contains_pork', 'contains_beef', 'contains_chicken', 'contains_seafood', 'contains_dairy', 'contains_egg', 'contains_nuts', 'contains_caffeine', 'decaf', 'unknown']
            }
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['signature', 'popular', 'limited', 'seasonal', 'new', 'discount', 'combo', 'shareable', 'single_serving', 'customizable', 'per_person', 'room_package', 'time_limited', 'spicy', 'vegetarian', 'caffeinated', 'non_caffeinated', 'manual_review']
            }
          },
          note: {
            type: 'string'
          },
          optionGroups: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'type', 'selectionType', 'options'],
              properties: {
                label: {
                  type: 'string'
                },
                type: {
                  type: 'string',
                  enum: ['size', 'addon', 'custom']
                },
                selectionType: {
                  type: 'string',
                  enum: ['single', 'multiple']
                },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['label', 'priceDelta'],
                    properties: {
                      label: {
                        type: 'string'
                      },
                      priceDelta: {
                        type: 'integer'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    addonSection: {
      type: 'object',
      additionalProperties: false,
      required: ['detected', 'label', 'selectionType', 'options'],
      properties: {
        detected: {
          type: 'boolean'
        },
        label: {
          type: 'string'
        },
        selectionType: {
          type: 'string',
          enum: ['multiple']
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'priceDelta'],
            properties: {
              label: {
                type: 'string'
              },
              priceDelta: {
                type: 'integer'
              }
            }
          }
        }
      }
    },
    warnings: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};

function nowIso() {
  return new Date().toISOString();
}

function safeIso(value, fallback = nowIso()) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return new Date(parsed).toISOString();
}

function writeLog(level, message, meta = {}) {
  const payload = Object.assign({
    time: nowIso(),
    level,
    message
  }, meta);
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

function encodeBufferForStore(buffer) {
  return Buffer.isBuffer(buffer) ? buffer.toString('base64') : null;
}

function decodeBufferFromStore(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  try {
    return Buffer.from(value, 'base64');
  } catch (error) {
    return null;
  }
}

function normalizeBoundedText(value, maxLength = 280) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeProposalPayload(value, depth = 0) {
  if (depth > 4) {
    return '[max_depth_reached]';
  }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    if (typeof value === 'string') {
      return normalizeBoundedText(value, 1000);
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((entry) => sanitizeProposalPayload(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value).slice(0, 40)) {
      const cleanKey = normalizeBoundedText(key, 48).replace(/[^a-zA-Z0-9_.-]/g, '_');
      if (!cleanKey) {
        continue;
      }
      result[cleanKey] = sanitizeProposalPayload(entry, depth + 1);
    }
    return result;
  }
  return null;
}

function buildAgentProposalContract() {
  return {
    contractVersion: agentProposalContractVersion,
    toolName: 'create_action_proposal',
    targetRole: 'host',
    allowedEffect: 'draft_only',
    defaultStatus: 'pending_host_confirmation',
    allowedProposalTypes: Array.from(agentProposalTypes),
    forbiddenEffects: [
      'payment',
      'credit_card_collection',
      'final_submit',
      'direct_order',
      'booking_commit',
      'settlement_commit',
      'claim_assignment_commit',
      'formula_override',
      'task_router_override',
      'external_system_write',
      'google_sheets_write'
    ],
    hostReviewRequired: true,
    approveEffect: 'host_accepts_and_applies_reviewed_structured_draft_when_present',
    rejectEffect: 'marks_proposal_as_rejected_only'
  };
}

function normalizeAgentProposalInput(input = {}) {
  const requestedType = normalizeBoundedText(input.proposalType, 64);
  const proposalType = agentProposalTypes.has(requestedType) ? requestedType : 'generic_next_step';
  const requestedRisk = normalizeBoundedText(input.riskLevel, 64);
  const riskLevel = agentProposalRiskLevels.has(requestedRisk) ? requestedRisk : 'needs_human_review';
  const summary = normalizeBoundedText(input.summary, 360) || 'Agent prepared a draft for host review.';
  const rationale = normalizeBoundedText(input.rationale, 700);
  const payload = sanitizeProposalPayload(input.payload && typeof input.payload === 'object' ? input.payload : {});

  return {
    proposalType,
    summary,
    rationale,
    payload,
    riskLevel
  };
}

function isLlmVisualReviewBackedSemanticProposal(proposal = {}) {
  const payload = proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {};
  const sourceMode = String(payload.sourceMode || '');
  const llmVisualReview = payload.llmVisualReview && typeof payload.llmVisualReview === 'object'
    ? payload.llmVisualReview
    : {};
  const provider = normalizeBoundedText(
    llmVisualReview.provider || payload.visualReviewProvider || payload.localVision?.provider || '',
    80
  );
  const model = normalizeBoundedText(
    llmVisualReview.model || payload.visualReviewModel || payload.localVision?.model || payload.localVisionModel || '',
    120
  );
  const hasCompletedReview = sourceMode === 'local_ocr_plus_local_vision'
    ? payload.localVisionConfigured === true
    : llmVisualReview.completed === true && provider && model;
  return proposal.proposalType === 'semantic_repair_draft'
    && llmVisualReviewSourceModes.has(sourceMode)
    && hasCompletedReview
    && Array.isArray(payload.structuredItems)
    && payload.structuredItems.length > 0;
}

function isLocalVisionBackedSemanticProposal(proposal = {}) {
  return isLlmVisualReviewBackedSemanticProposal(proposal);
}

function shouldApplyStructuredDraftProposal(proposal = {}) {
  const payload = proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {};
  return isLlmVisualReviewBackedSemanticProposal(proposal)
    && (
      payload.sourceMode === 'local_ocr_plus_llm_visual_review'
      || payload.applyStructuredDraft === true
    );
}

function validateExternalAgentProposalInput(normalized) {
  const payload = normalized.payload && typeof normalized.payload === 'object' ? normalized.payload : {};
  if (
    ['semantic_repair_draft', 'evidence_review'].includes(normalized.proposalType)
    && payload.sourceMode === 'local_ocr_only_bridge_draft'
  ) {
    return {
      ok: false,
      statusCode: 422,
      error: 'OCR-only bridge output is local evidence only. Run OCR plus LLM visual review before creating a cloud review draft.'
    };
  }
  if (normalized.proposalType === 'semantic_repair_draft' && !isLlmVisualReviewBackedSemanticProposal(normalized)) {
    return {
      ok: false,
      statusCode: 422,
      error: 'Semantic repair drafts require OCR plus an LLM visual review with structured items before cloud proposal creation.'
    };
  }
  return { ok: true };
}

function serializeAgentProposal(proposal) {
  return {
    id: proposal.id,
    roomId: proposal.roomId,
    createdBy: proposal.createdBy || 'webmcp_agent',
    targetRole: 'host',
    status: agentProposalStatuses.has(proposal.status) ? proposal.status : 'pending_host_confirmation',
    proposalType: agentProposalTypes.has(proposal.proposalType) ? proposal.proposalType : 'generic_next_step',
    summary: normalizeBoundedText(proposal.summary, 360),
    rationale: normalizeBoundedText(proposal.rationale, 700),
    payload: sanitizeProposalPayload(proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {}),
    riskLevel: agentProposalRiskLevels.has(proposal.riskLevel) ? proposal.riskLevel : 'needs_human_review',
    allowedEffect: 'draft_only',
    forbiddenEffects: buildAgentProposalContract().forbiddenEffects,
    createdAt: safeIso(proposal.createdAt),
    reviewedAt: proposal.reviewedAt ? safeIso(proposal.reviewedAt) : null,
    reviewedBy: proposal.reviewedBy || null
  };
}

function createAgentProposal(room, input = {}) {
  const normalized = normalizeAgentProposalInput(input);
  const proposals = Array.isArray(room.agentProposals) ? room.agentProposals : [];
  const proposal = serializeAgentProposal({
    id: `proposal_${randomUUID().slice(0, 8)}`,
    roomId: room.id,
    createdBy: 'webmcp_agent',
    targetRole: 'host',
    status: 'pending_host_confirmation',
    createdAt: nowIso(),
    reviewedAt: null,
    reviewedBy: null,
    ...normalized
  });

  const dedupedProposals = proposals.filter((candidate) => {
    const serialized = serializeAgentProposal(candidate);
    return serialized.status !== 'pending_host_confirmation'
      || serialized.proposalType !== proposal.proposalType;
  });
  room.agentProposals = [proposal, ...dedupedProposals].slice(0, 24);
  touchRoom(room, 'agent_proposal_created');
  return proposal;
}

function serializeRoomForStore(room) {
  return {
    id: room.id,
    menuLoaded: Boolean(room.menuLoaded),
    itemsOpenForMembers: Boolean(room.itemsOpenForMembers),
    items: Array.isArray(room.items) ? room.items : [],
    evidenceAssets: Array.isArray(room.evidenceAssets) ? room.evidenceAssets : [],
    ocrObservations: Array.isArray(room.ocrObservations) ? room.ocrObservations : [],
    parserCandidates: Array.isArray(room.parserCandidates) ? room.parserCandidates : [],
    calculationRules: Array.isArray(room.calculationRules) ? room.calculationRules : [],
    reviewDecisions: Array.isArray(room.reviewDecisions) ? room.reviewDecisions : [],
    settlementSnapshots: Array.isArray(room.settlementSnapshots) ? room.settlementSnapshots : [],
    menuType: room.menuType || 'general',
    menuMode: room.menuMode || 'auto',
    taskRouter: room.taskRouter || { ...defaultTaskRouter },
    participants: Array.from(room.participants.values()).map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      order: participant.order && typeof participant.order === 'object' ? participant.order : {},
      confirmed: Boolean(participant.confirmed),
      confirmedAt: participant.confirmedAt || null,
      updatedAt: participant.updatedAt || room.updatedAt || room.createdAt
    })),
    ownerParticipantId: room.ownerParticipantId || null,
    settled: Boolean(room.settled),
    settledAt: room.settledAt || null,
    settledBy: room.settledBy || null,
    agentProposals: Array.isArray(room.agentProposals)
      ? room.agentProposals.map((proposal) => serializeAgentProposal(proposal))
      : [],
    warnings: Array.isArray(room.warnings) ? room.warnings : [],
    parseQuality: room.parseQuality || null,
    evidenceReviewSource: room.evidenceReviewSource || null,
    evidenceReviewModel: room.evidenceReviewModel || null,
    localOcr: room.localOcr || {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0,
      ruleLineCount: 0,
      ruleHints: []
    },
    menuImages: Array.isArray(room.menuImages)
      ? room.menuImages.map((image, index) => ({
        index,
        bufferBase64: encodeBufferForStore(image.buffer),
        mimeType: image.mimeType || image.mimetype || 'image/jpeg',
        width: image.width || null,
        height: image.height || null,
        originalBytes: image.originalBytes || null,
        processedBytes: image.processedBytes || null
      }))
      : [],
    menuImageBufferBase64: encodeBufferForStore(room.menuImageBuffer),
    menuImageMimeType: room.menuImageMimeType || null,
    menuImageWidth: room.menuImageWidth || null,
    menuImageHeight: room.menuImageHeight || null,
    createdAt: safeIso(room.createdAt),
    updatedAt: safeIso(room.updatedAt, safeIso(room.createdAt)),
    parsedAt: room.parsedAt ? safeIso(room.parsedAt) : null
  };
}

function hydrateRoomFromStore(record) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) {
    return null;
  }

  const participants = new Map();
  const participantRecords = Array.isArray(record.participants) ? record.participants : [];
  for (const participant of participantRecords) {
    if (!participant || typeof participant.id !== 'string' || !participant.id) {
      continue;
    }
    participants.set(participant.id, {
      id: participant.id,
      displayName: normalizeDisplayName(participant.displayName),
      order: participant.order && typeof participant.order === 'object' ? participant.order : {},
      confirmed: Boolean(participant.confirmed),
      confirmedAt: participant.confirmedAt || null,
      connectedCount: 0,
      updatedAt: safeIso(participant.updatedAt, safeIso(record.updatedAt, safeIso(record.createdAt)))
    });
  }

  const menuImages = Array.isArray(record.menuImages)
    ? record.menuImages.map((image, index) => ({
      index,
      buffer: decodeBufferFromStore(image?.bufferBase64),
      mimeType: image?.mimeType || 'image/jpeg',
      width: image?.width || null,
      height: image?.height || null,
      originalBytes: image?.originalBytes || null,
      processedBytes: image?.processedBytes || null
    })).filter((image) => Buffer.isBuffer(image.buffer))
    : [];
  const menuImageBuffer = decodeBufferFromStore(record.menuImageBufferBase64) || menuImages[0]?.buffer || null;

  return {
    id: record.id,
    menuLoaded: Boolean(record.menuLoaded),
    itemsOpenForMembers: Boolean(record.itemsOpenForMembers),
    items: Array.isArray(record.items) ? record.items : [],
    evidenceAssets: Array.isArray(record.evidenceAssets) ? record.evidenceAssets : [],
    ocrObservations: Array.isArray(record.ocrObservations) ? record.ocrObservations : [],
    parserCandidates: Array.isArray(record.parserCandidates) ? record.parserCandidates : [],
    calculationRules: Array.isArray(record.calculationRules) ? record.calculationRules : [],
    reviewDecisions: Array.isArray(record.reviewDecisions) ? record.reviewDecisions : [],
    settlementSnapshots: Array.isArray(record.settlementSnapshots) ? record.settlementSnapshots : [],
    menuType: menuTypes.has(record.menuType) ? record.menuType : 'general',
    menuMode: menuModes.has(record.menuMode) ? record.menuMode : 'auto',
    taskRouter: record.taskRouter && typeof record.taskRouter === 'object'
      ? record.taskRouter
      : { ...defaultTaskRouter },
    participants,
    ownerParticipantId: typeof record.ownerParticipantId === 'string' ? record.ownerParticipantId : null,
    settled: Boolean(record.settled),
    settledAt: record.settledAt || null,
    settledBy: record.settledBy || null,
    agentProposals: Array.isArray(record.agentProposals)
      ? record.agentProposals
        .map((proposal) => serializeAgentProposal({
          ...proposal,
          roomId: record.id
        }))
        .filter((proposal) => proposal.id)
      : [],
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    parseQuality: record.parseQuality || null,
    evidenceReviewSource: typeof record.evidenceReviewSource === 'string' ? record.evidenceReviewSource : null,
    evidenceReviewModel: typeof record.evidenceReviewModel === 'string' ? record.evidenceReviewModel : null,
    localOcr: record.localOcr || {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0,
      ruleLineCount: 0,
      ruleHints: []
    },
    menuImages,
    menuImageBuffer,
    menuImageMimeType: record.menuImageMimeType || menuImages[0]?.mimeType || null,
    menuImageWidth: record.menuImageWidth || menuImages[0]?.width || null,
    menuImageHeight: record.menuImageHeight || menuImages[0]?.height || null,
    itemImageCache: new Map(),
    createdAt: safeIso(record.createdAt),
    updatedAt: safeIso(record.updatedAt, safeIso(record.createdAt)),
    parsedAt: record.parsedAt ? safeIso(record.parsedAt) : null
  };
}

function buildRoomStorePayload() {
  return {
    storeVersion: roomStoreVersion,
    savedAt: nowIso(),
    roomTtlHours: roomTtlMs / 60 / 60 / 1000,
    rooms: Array.from(rooms.values()).map((room) => serializeRoomForStore(room))
  };
}

function writeRoomsToDisk(reason = 'room_state_changed') {
  if (!roomPersistenceEnabled) {
    return;
  }

  const payload = buildRoomStorePayload();
  const tempPath = `${roomStorePath}.tmp`;

  try {
    fs.mkdirSync(path.dirname(roomStorePath), { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(payload)}\n`, 'utf8');
    fs.renameSync(tempPath, roomStorePath);
    writeLog('info', 'rooms_persisted', {
      reason,
      roomCount: payload.rooms.length,
      roomStorePath
    });
  } catch (error) {
    writeLog('error', 'rooms_persist_failed', {
      reason,
      roomStorePath,
      error: error.message
    });
  }
}

function flushRoomPersistQueue(reasonOverride = '') {
  if (roomPersistTimer) {
    clearTimeout(roomPersistTimer);
    roomPersistTimer = null;
  }
  const reason = reasonOverride || roomPersistPendingReason || 'room_state_changed';
  roomPersistPendingReason = '';
  writeRoomsToDisk(reason);
}

function persistRooms(reason = 'room_state_changed') {
  if (!roomPersistenceEnabled) {
    return;
  }

  const nextReason = roomPersistPendingReason ? `${roomPersistPendingReason},${reason}` : reason;
  roomPersistPendingReason = nextReason.length > 240 ? `${nextReason.slice(0, 220)},more_changes` : nextReason;

  if (roomPersistTimer) {
    return;
  }

  const jitterMs = roomPersistJitterMs > 0 ? Math.floor(Math.random() * roomPersistJitterMs) : 0;
  roomPersistTimer = setTimeout(() => {
    flushRoomPersistQueue();
  }, roomPersistDebounceMs + jitterMs);
}

function readGuardrailMemoryPayload() {
  try {
    if (!fs.existsSync(guardrailMemoryPath)) {
      return {
        version: guardrailMemoryVersion,
        events: []
      };
    }
    const payload = JSON.parse(fs.readFileSync(guardrailMemoryPath, 'utf8'));
    return {
      version: payload.version || guardrailMemoryVersion,
      events: Array.isArray(payload.events) ? payload.events : []
    };
  } catch (error) {
    writeLog('error', 'guardrail_memory_read_failed', {
      guardrailMemoryPath,
      error: error.message
    });
    return {
      version: guardrailMemoryVersion,
      events: []
    };
  }
}

function appendGuardrailMemoryEvent(event) {
  if (!roomPersistenceEnabled) {
    return;
  }
  const nextEvent = buildGuardrailMemoryPatternEvent(event);
  if (!nextEvent) {
    return;
  }
  const payload = readGuardrailMemoryPayload();
  const nextPayload = {
    version: guardrailMemoryVersion,
    updatedAt: nowIso(),
    events: [nextEvent, ...payload.events].slice(0, 200)
  };
  const tempPath = `${guardrailMemoryPath}.tmp`;
  try {
    fs.mkdirSync(path.dirname(guardrailMemoryPath), { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, guardrailMemoryPath);
    writeLog('info', 'guardrail_memory_pattern_recorded', {
      eventId: nextEvent.id,
      roomId: nextEvent.roomId || null,
      eventType: nextEvent.eventType || 'unknown',
      patternType: nextEvent.patternType || 'unknown'
    });
  } catch (error) {
    writeLog('error', 'guardrail_memory_write_failed', {
      guardrailMemoryPath,
      error: error.message
    });
  }
}

function maskNumbersForGuardrailMemory(value) {
  return normalizeShortText(String(value || '').replace(/[0-9][0-9,./:\-()\s]{0,24}/g, '{NUMBER}'), 180);
}

function inferGuardrailPatternType(event) {
  const issueTypes = Array.isArray(event?.issueTypes) ? event.issueTypes.map(String) : [];
  const flags = [
    ...(Array.isArray(event?.previousItem?.reviewFlags) ? event.previousItem.reviewFlags : []),
    ...(Array.isArray(event?.nextItem?.reviewFlags) ? event.nextItem.reviewFlags : [])
  ].map(String);
  const rawText = event?.nextItem?.rawTextEvidence || event?.previousItem?.rawTextEvidence || event?.rawTextEvidence || '';
  const detectedTypeHint = detectOcrObservationType(rawText);
  if (issueTypes.includes('forbidden_context_number') || ['phone_number', 'date_time'].includes(detectedTypeHint)) {
    return 'context_identifier_must_not_be_price';
  }
  if (issueTypes.some((type) => /deposit|prepayment|tax|fee|discount|threshold|formula/i.test(type))
    || flags.some((flag) => /deposit|prepayment|tax|fee|discount/i.test(flag))
    || ['deposit_or_security', 'prepayment', 'tax_or_fee_rate', 'tax_or_fee_amount', 'discount_or_threshold_rule'].includes(detectedTypeHint)) {
    return 'complex_rule_must_route_to_review';
  }
  if (event?.eventType === 'parsed_item_removed') {
    return 'removed_candidate_should_not_reappear';
  }
  if (event?.eventType === 'parsed_item_updated') {
    return 'human_edit_requires_future_review_hint';
  }
  if (Array.isArray(event?.blockingReasons) && event.blockingReasons.length > 0) {
    return 'blocked_open_gate_should_remain_blocking';
  }
  return 'review_loop_negative_pattern';
}

function buildGuardrailMemoryPatternEvent(event = {}) {
  const rawText = event?.nextItem?.rawTextEvidence
    || event?.previousItem?.rawTextEvidence
    || event?.removedItem?.rawTextEvidence
    || event?.rawTextEvidence
    || '';
  const previousItem = event?.previousItem && typeof event.previousItem === 'object' ? event.previousItem : {};
  const nextItem = event?.nextItem && typeof event.nextItem === 'object' ? event.nextItem : {};
  const patternType = inferGuardrailPatternType(event);
  const nextEvent = {
    id: `guardrail_${randomUUID().slice(0, 8)}`,
    createdAt: nowIso(),
    status: 'candidate',
    source: 'human_review_loop',
    storageClass: 'negative_pattern_registry',
    eventType: normalizeShortText(event.eventType || 'review_event', 64),
    roomId: event.roomId || null,
    taskType: event.taskType || null,
    scenarioContract: event.scenarioContract || null,
    contractId: event.contractId || event.scenarioContract || null,
    language: event.language || null,
    evidenceType: event.evidenceType || 'price_evidence',
    patternScope: event.scenarioContract ? 'CONTRACT_LOCAL' : 'ARCHETYPE_GLOBAL',
    matcherStrength: patternType === 'context_identifier_must_not_be_price' || patternType === 'complex_rule_must_route_to_review'
      ? 'HARD_BLOCK'
      : 'SOFT_WARNING',
    actionOnMatch: 'ROUTE_TO_REVIEW_GATE',
    patternType,
    matcher: {
      textPattern: maskNumbersForGuardrailMemory(rawText),
      detectedTypeHint: detectOcrObservationType(rawText),
      previousPriceRole: previousItem.priceRole || null,
      nextPriceRole: nextItem.priceRole || null,
      previousSourceNumberClass: previousItem.sourceNumberClass || null,
      nextSourceNumberClass: nextItem.sourceNumberClass || null,
      issueTypes: Array.isArray(event.issueTypes) ? event.issueTypes.map((issue) => normalizeShortText(issue, 64)).filter(Boolean).slice(0, 12) : [],
      blockingReasons: Array.isArray(event.blockingReasons) ? event.blockingReasons.map((reason) => normalizeShortText(reason, 80)).filter(Boolean).slice(0, 12) : []
    },
    instruction: patternType === 'complex_rule_must_route_to_review'
      ? 'Route matching rule/formula numbers to ReviewGate; never store the corrected amount as reusable truth.'
      : 'Treat matching observations as negative patterns requiring review; do not memorize corrected answers.',
    forbiddenStorage: [
      'corrected_answer',
      'final_item_price',
      'full_source_text',
      'raw_personal_identifier'
    ]
  };
  return nextEvent;
}

function loadPersistedRooms() {
  if (!roomPersistenceEnabled) {
    writeLog('info', 'room_persistence_disabled', {
      mode: 'memory'
    });
    return;
  }
  if (!fs.existsSync(roomStorePath)) {
    writeLog('info', 'room_store_not_found', {
      roomStorePath
    });
    return;
  }

  try {
    const raw = fs.readFileSync(roomStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    const now = Date.now();
    let loadedCount = 0;
    let expiredCount = 0;

    for (const record of records) {
      const room = hydrateRoomFromStore(record);
      if (!room) {
        continue;
      }
      if (now - Date.parse(room.updatedAt) > roomTtlMs) {
        expiredCount += 1;
        continue;
      }
      rooms.set(room.id, room);
      loadedCount += 1;
    }

    writeLog('info', 'rooms_loaded', {
      roomStorePath,
      loadedCount,
      expiredCount
    });

    if (expiredCount > 0) {
      persistRooms('startup_expired_room_prune');
    }
  } catch (error) {
    writeLog('error', 'rooms_load_failed', {
      roomStorePath,
      error: error.message
    });
  }
}

function getRequestClientKey(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const clientIp = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
  return clientIp.replace(/^::ffff:/, '');
}

function pruneRateLimitBuckets(now = Date.now()) {
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function createRateLimitMiddleware(scope, limit, windowMs = rateLimitWindowMs) {
  return (req, res, next) => {
    const now = Date.now();
    pruneRateLimitBuckets(now);

    const clientKey = getRequestClientKey(req);
    const bucketKey = `${scope}:${clientKey}`;
    const current = rateLimitBuckets.get(bucketKey);
    const bucket = current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + windowMs
        };

    bucket.count += 1;
    rateLimitBuckets.set(bucketKey, bucket);

    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('X-RateLimit-Scope', scope);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (bucket.count > limit) {
      writeLog('error', 'rate_limit_exceeded', {
        scope,
        clientKey,
        path: req.path,
        method: req.method,
        limit,
        resetInSeconds: resetSeconds
      });
      res.status(429).json({
        error: '請求太頻繁，請稍後再試。',
        scope,
        retryAfterSeconds: resetSeconds
      });
      return;
    }

    next();
  };
}

function normalizeAiProviderOrder(value) {
  const providers = String(value || '')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider) => aiProviderTypes.has(provider));
  const ordered = [];
  for (const provider of providers) {
    if (!ordered.includes(provider)) {
      ordered.push(provider);
    }
  }
  if (ordered.length === 0) {
    return ['local_vision', 'gemini', 'openai'];
  }
  return ordered;
}

function getGeminiApiKeyConfig() {
  for (const keyName of geminiApiKeyNames) {
    const value = process.env[keyName];
    if (typeof value === 'string' && value.trim()) {
      return {
        apiKey: value.trim(),
        keyName
      };
    }
  }

  return {
    apiKey: '',
    keyName: null
  };
}

function getOpenAiApiKeyConfig() {
  for (const keyName of openAiApiKeyNames) {
    const value = process.env[keyName];
    if (typeof value === 'string' && value.trim()) {
      return {
        apiKey: value.trim(),
        keyName
      };
    }
  }

  return {
    apiKey: '',
    keyName: null
  };
}

function getGeminiModelCandidates() {
  return Array.from(new Set([geminiModel].concat(geminiFallbackModels).filter(Boolean)));
}

function getOpenAiModelCandidates() {
  return Array.from(new Set([openAiModel].concat(openAiFallbackModels).filter(Boolean)));
}

function getConfiguredProviderCandidates() {
  const { apiKey: geminiApiKey } = getGeminiApiKeyConfig();
  const { apiKey: openAiApiKey } = getOpenAiApiKeyConfig();
  return aiProviderOrder.filter((provider) => {
    if (provider === 'local_vision') {
      return Boolean(localVisionBaseUrl && localVisionModel);
    }
    if (provider === 'gemini') {
      return Boolean(geminiApiKey);
    }
    if (provider === 'openai') {
      return Boolean(openAiApiKey);
    }
    return false;
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.statusCode = 504;
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function prepareMenuImage(file) {
  const startedAt = Date.now();
  try {
    const image = sharp(file.buffer, {
      failOn: 'none',
      limitInputPixels: 36_000_000
    });
    const metadata = await image.metadata();
    const prepared = await image
      .rotate()
      .resize({
        width: imageOcrTargetDimension,
        height: imageOcrTargetDimension,
        fit: 'inside',
        withoutEnlargement: false
      })
      .flatten({
        background: '#ffffff'
      })
      .jpeg({
        quality: imageJpegQuality,
        mozjpeg: true
      })
      .toBuffer({
        resolveWithObject: true
      });

    return {
      buffer: prepared.data,
      mimetype: 'image/jpeg',
      originalMimeType: file.mimetype,
      originalBytes: file.buffer.length,
      processedBytes: prepared.data.length,
      originalWidth: metadata.width || null,
      originalHeight: metadata.height || null,
      processedWidth: prepared.info.width || null,
      processedHeight: prepared.info.height || null,
      processedInMs: Date.now() - startedAt
    };
  } catch (error) {
    writeLog('error', 'image_prepare_failed', {
      mimeType: file.mimetype,
      bytes: file.buffer.length,
      error: error.message
    });
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalMimeType: file.mimetype,
      originalBytes: file.buffer.length,
      processedBytes: file.buffer.length,
      originalWidth: null,
      originalHeight: null,
      processedWidth: null,
      processedHeight: null,
      processedInMs: Date.now() - startedAt
    };
  }
}

function extractGeminiErrorInfo(error) {
  const info = {
    code: Number(error?.status || error?.statusCode || error?.code || 0),
    status: String(error?.statusText || error?.status || ''),
    message: String(error?.message || 'Gemini API 請求失敗')
  };

  const jsonStart = info.message.indexOf('{');
  const jsonEnd = info.message.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(info.message.slice(jsonStart, jsonEnd + 1));
      if (parsed?.error) {
        info.code = Number(parsed.error.code || info.code);
        info.status = String(parsed.error.status || info.status);
        info.message = String(parsed.error.message || info.message);
      }
    } catch (parseError) {
      return info;
    }
  }

  return info;
}

function isRetryableGeminiError(error) {
  const info = extractGeminiErrorInfo(error);
  return [429, 500, 502, 503, 504].includes(info.code)
    || ['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED'].includes(info.status);
}

async function generateMenuContent(ai, request) {
  const modelCandidates = getGeminiModelCandidates();
  let lastError = null;

  for (const model of modelCandidates) {
    for (let attempt = 1; attempt <= geminiRetryAttempts; attempt += 1) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: request.contents,
            config: request.config
          }),
          geminiTimeoutMs,
          `圖片讀取超過 ${Math.round(geminiTimeoutMs / 1000)} 秒，請改用較清晰或較小的價格圖片再試一次。`
        );
        return {
          response,
          model
        };
      } catch (error) {
        lastError = error;
        const info = extractGeminiErrorInfo(error);
        writeLog('error', 'gemini_parse_attempt_failed', {
          model,
          attempt,
          code: info.code,
          status: info.status,
          message: info.message
        });

        if (!isRetryableGeminiError(error)) {
          throw error;
        }

        if (attempt < geminiRetryAttempts) {
          await wait(700 * attempt);
        }
      }
    }
  }

  const info = extractGeminiErrorInfo(lastError);
  const error = new Error(`圖片讀取服務暫時忙碌，請稍後再按「確定上傳」，或先貼上圖片中的文字。`);
  error.statusCode = info.code === 429 ? 429 : 503;
  throw error;
}

function extractOpenAiErrorInfo(error) {
  return {
    code: Number(error?.status || error?.statusCode || error?.code || 0),
    status: String(error?.statusText || error?.status || ''),
    message: String(error?.message || 'OpenAI API 請求失敗')
  };
}

function isRetryableOpenAiError(error) {
  const info = extractOpenAiErrorInfo(error);
  return [408, 409, 429, 500, 502, 503, 504].includes(info.code)
    || /rate limit|timeout|temporarily|unavailable/i.test(info.message);
}

function shouldFallbackToNextProvider(error) {
  const statusCode = Number(error?.statusCode || error?.status || error?.code || 0);
  return statusCode === 0 || [408, 409, 429, 500, 502, 503, 504].includes(statusCode);
}

function extractOpenAiOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  for (const outputItem of Array.isArray(response?.output) ? response.output : []) {
    for (const contentItem of Array.isArray(outputItem?.content) ? outputItem.content : []) {
      if (typeof contentItem?.text === 'string' && ['output_text', 'text'].includes(contentItem.type)) {
        chunks.push(contentItem.text);
      }
      if (typeof contentItem?.refusal === 'string' && contentItem.refusal.trim()) {
        const error = new Error(`OpenAI 拒絕解析此圖片：${contentItem.refusal.trim()}`);
        error.statusCode = 422;
        throw error;
      }
    }
  }

  return chunks.join('\n').trim();
}

async function generateOpenAiMenuContent(apiKey, request) {
  const modelCandidates = getOpenAiModelCandidates();
  let lastError = null;

  for (const model of modelCandidates) {
    const body = {
      model,
      input: request.input,
      text: {
        format: {
          type: 'json_schema',
          name: 'menu_parse_result',
          strict: true,
          schema: openAiMenuSchema
        }
      },
      max_output_tokens: openAiMaxOutputTokens,
      store: false
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, openAiTimeoutMs);

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      }).finally(() => {
        clearTimeout(timeoutId);
      });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const message = responseBody?.error?.message || response.statusText || 'OpenAI API 請求失敗';
        const error = new Error(message);
        error.statusCode = response.status;
        error.status = responseBody?.error?.code || responseBody?.error?.type || response.statusText;
        throw error;
      }

      return {
        response: responseBody,
        model
      };
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? Object.assign(new Error(`OpenAI 解析超過 ${Math.round(openAiTimeoutMs / 1000)} 秒，已停止等待。`), { statusCode: 504 })
        : error;
      const info = extractOpenAiErrorInfo(lastError);
      writeLog('error', 'openai_parse_attempt_failed', {
        model,
        code: info.code,
        status: info.status,
        message: info.message
      });

      if (!isRetryableOpenAiError(lastError)) {
        throw lastError;
      }
    }
  }

  const info = extractOpenAiErrorInfo(lastError);
  const error = new Error(`OpenAI 備援解析失敗。最後錯誤：${info.message}`);
  error.statusCode = info.code || 503;
  throw error;
}

function createRoom() {
  const id = randomUUID().slice(0, 8);
  const room = {
    id,
    menuLoaded: false,
    itemsOpenForMembers: false,
    items: [],
    evidenceAssets: [],
    ocrObservations: [],
    parserCandidates: [],
    calculationRules: [],
    reviewDecisions: [],
    settlementSnapshots: [],
    menuType: 'general',
    menuMode: 'auto',
    taskRouter: { ...defaultTaskRouter },
    participants: new Map(),
    ownerParticipantId: null,
    settled: false,
    settledAt: null,
    settledBy: null,
    agentProposals: [],
    warnings: [],
    parseQuality: null,
    evidenceReviewSource: null,
    evidenceReviewModel: null,
    localOcr: {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0,
      ruleLineCount: 0,
      ruleHints: []
    },
    menuImages: [],
    menuImageBuffer: null,
    menuImageMimeType: null,
    menuImageWidth: null,
    menuImageHeight: null,
    itemImageCache: new Map(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    parsedAt: null
  };
  rooms.set(id, room);
  persistRooms('room_created');
  return room;
}

const sampleRoomOcrLines = Object.freeze([
  'Restaurant lunch meal sample menu',
  'Chicken rice bowl 18',
  'Vegetarian noodle bowl 16',
  'Seasonal fruit cup 12',
  'Shared snack platter 24',
  'Extra dessert cup 7',
  'Shared table fee 6'
]);

const demoSampleScenarios = Object.freeze([
  {
    id: 'zh-ticket-age-itinerary',
    language: 'zh',
    contractId: 'ticket_activity_matrix',
    taskType: 'ticket_activity',
    title: '非凡旅遊 一日遊票價表',
    menuType: 'general',
    textLines: [
      '非凡旅遊 一日遊票價表',
      '行程 1：太平雲梯一日遊',
      '會員費用 假日（六或日）四排椅 NT$ 830 / 人',
      '非會員費用 假日（六或日）四排椅 NT$ 1830 / 人',
      '嬰兒 0 歲～未滿 1 歲 NT$ 200 / 人（含保險，不佔餐、車位）',
      '幼兒 1 歲～未滿 2 歲 NT$ 1300 / 人（含保險、門票、車位，不佔餐）',
      '小童 2 歲～6 歲（含）NT$ 1800 / 人（含保險、門票、車位、餐費）',
      '行程 2：雲彰文化一日遊',
      '會員費用 假日（六或日）四排椅 NT$ 470 / 人',
      '非會員費用 假日（六或日）四排椅 NT$ 1470 / 人',
      '嬰兒 0 歲～未滿 1 歲 NT$ 150 / 人（含保險，不佔餐、車位）',
      '幼兒 1 歲～未滿 2 歲 NT$ 655 / 人（含保險、門票、車位，不佔餐）',
      '小童 2 歲～6 歲（含）NT$ 1170 / 人（含保險、門票、車位、餐費）'
    ],
    summary: '中文旅遊票券示範已載入。請檢查行程、年齡區間與金額欄位，確認無誤後再開放成員選擇。',
    rationale: '這份 sample 用來展示頁面/情境辨識：中文頁面與票券用途必須載入中文票價證據，不可載入英文餐點資料。'
  },
  {
    id: 'en-restaurant-shared-fee',
    language: 'en',
    contractId: 'menu_size_option_matrix',
    taskType: 'restaurant_split',
    title: 'Restaurant lunch meal sample menu',
    menuType: 'mixed',
    textLines: sampleRoomOcrLines,
    summary: 'Sample room is ready. Review the shared items, then ask members to claim their own costs.',
    rationale: 'This draft shows the safe loop: the assistant prepares a review note, while the host keeps the final approval button.'
  }
]);

function normalizeSampleLanguage(value) {
  const language = String(value || '').trim().toLowerCase();
  if (language === 'zh' || language === 'zh-tw' || language === 'zh-hant') {
    return 'zh';
  }
  return 'en';
}

function selectDemoSampleScenario(input = {}) {
  const language = normalizeSampleLanguage(input.language);
  const taskType = normalizeRoomTaskType(input.taskType);
  return demoSampleScenarios.find((scenario) => scenario.language === language && scenario.taskType === taskType)
    || demoSampleScenarios.find((scenario) => scenario.language === language)
    || demoSampleScenarios.find((scenario) => scenario.language === 'en');
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderDemoSampleImage(scenario) {
  const isZh = scenario.language === 'zh';
  const width = isZh ? 1500 : 1200;
  const lineHeight = isZh ? 52 : 46;
  const fontSize = isZh ? 31 : 30;
  const titleSize = isZh ? 42 : 38;
  const rows = scenario.textLines.slice(1, 20).map((line, index) => {
    const y = 150 + (index * lineHeight);
    return `<text x="72" y="${y}" class="row">${escapeSvgText(line)}</text>`;
  }).join('\n');
  const height = Math.max(720, 210 + (scenario.textLines.length * lineHeight));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${isZh ? '#fffaf2' : '#fbfaf7'}"/>
  <rect x="34" y="34" width="${width - 68}" height="${height - 68}" rx="18" fill="none" stroke="${isZh ? '#8d6b42' : '#2f3a35'}" stroke-width="5"/>
  <text x="72" y="95" class="title">${escapeSvgText(scenario.title)}</text>
  <text x="72" y="126" class="meta">${escapeSvgText(scenario.contractId)} · ${escapeSvgText(scenario.taskType)}</text>
  ${rows}
  <style>
    .title { font: 700 ${titleSize}px -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Noto Sans", Arial, sans-serif; fill: #1d1d1f; }
    .meta { font: 500 20px -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Noto Sans", Arial, sans-serif; fill: #6e6a61; }
    .row { font: 500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Noto Sans", Arial, sans-serif; fill: #27231d; }
  </style>
</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const metadata = await sharp(buffer).metadata();
  return {
    buffer,
    mimetype: 'image/png',
    width: metadata.width || width,
    height: metadata.height || height
  };
}

function buildSampleRoomItems() {
  return normalizeParsedItems([
    {
      name: 'Chicken rice bowl',
      price: 18,
      category: 'main',
      sectionName: 'Lunch',
      tags: ['single_serving'],
      sourceImageIndex: 1
    },
    {
      name: 'Vegetarian noodle bowl',
      price: 16,
      category: 'main',
      sectionName: 'Lunch',
      dietaryFlags: ['vegetarian'],
      tags: ['single_serving'],
      sourceImageIndex: 1
    },
    {
      name: 'Seasonal fruit cup',
      price: 12,
      category: 'dessert',
      sectionName: 'Lunch',
      tags: ['single_serving'],
      sourceImageIndex: 1
    },
    {
      name: 'Shared snack platter',
      price: 24,
      category: 'snack',
      sectionName: 'Shared items',
      tags: ['shareable'],
      sourceImageIndex: 1
    },
    {
      name: 'Extra dessert cup',
      price: 7,
      category: 'dessert',
      sectionName: 'Personal add-ons',
      tags: ['single_serving'],
      sourceImageIndex: 1
    },
    {
      name: 'Shared table fee',
      price: 6,
      category: 'service',
      sectionName: 'Shared review',
      tags: ['shareable', 'manual_review'],
      note: 'Host should confirm whether this shared fee should stay in the room.',
      sourceImageIndex: 1
    }
  ], 1, null);
}

async function loadSampleRoom(room, input = {}) {
  const participant = ensureParticipant(room, input.participantId, input.displayName || 'Demo Host');
  if (!room.ownerParticipantId) {
    room.ownerParticipantId = participant.id;
  }

  const scenario = selectDemoSampleScenario(input);
  const sampleText = scenario.textLines.join('\n');
  const parsed = scenario.id === 'en-restaurant-shared-fee'
    ? {
      items: buildSampleRoomItems(),
      menuType: scenario.menuType,
      metrics: {
        enabled: true,
        lineCount: scenario.textLines.length,
        candidateCount: sampleRoomOcrLines.length - 1,
        itemCount: sampleRoomOcrLines.length - 1,
        ruleLineCount: 0,
        ruleHints: []
      }
    }
    : parseLocalOcrMenuCandidates(sampleText, 1, {
      taskType: scenario.taskType
    });
  const image = await renderDemoSampleImage(scenario);
  const parsedItems = parsed.items;
  room.menuType = normalizeMenuType(parsed.menuType || scenario.menuType, parsedItems);
  room.menuMode = 'auto';
  room.taskRouter = buildRoomTaskRouter({
    taskType: scenario.taskType,
    localOcrText: sampleText,
    items: parsedItems
  });
  room.warnings = [
    scenario.language === 'zh'
      ? '已依目前頁面語系與房間用途載入中文示範證據。請先檢查欄位，再開放給成員。'
      : 'Sample room loaded for quick review. The assistant may draft suggestions, but the host keeps final approval.'
  ];
  room.evidenceReviewSource = 'sample_room_oracle';
  room.evidenceReviewModel = 'deterministic-sample-fixture';
  room.parseQuality = evaluateMenuParseQuality({
    items: parsedItems,
    menuType: room.menuType,
    taskRouter: room.taskRouter
  });
  room.localOcr = {
    enabled: true,
    lineCount: scenario.textLines.length,
    candidateCount: parsedItems.length,
    itemCount: parsedItems.length,
    ruleLineCount: parsed.metrics?.ruleLineCount || 0,
    ruleHints: parsed.metrics?.ruleHints || [],
    sampleId: scenario.id,
    language: scenario.language,
    contractId: scenario.contractId
  };
  room.menuImages = [{
    index: 0,
    buffer: image.buffer,
    mimeType: image.mimetype,
    width: image.width,
    height: image.height,
    originalBytes: image.buffer.length,
    processedBytes: image.buffer.length
  }];
  room.menuImageBuffer = image.buffer;
  room.menuImageMimeType = image.mimetype;
  room.menuImageWidth = image.width;
  room.menuImageHeight = image.height;
  room.itemImageCache = new Map();
  applyEvidenceReviewLayers(room, parsedItems, {
    images: room.menuImages,
    localOcrText: sampleText,
    taskType: scenario.taskType,
    scenarioContractId: scenario.contractId,
    evidenceKind: 'generated_demo_image',
    sourceLabel: scenario.title,
    ocrSource: 'generated_demo_text'
  });
  room.menuLoaded = true;
  room.itemsOpenForMembers = false;
  room.settled = false;
  room.settledAt = null;
  room.settledBy = null;
  room.parsedAt = nowIso();

  const proposal = createAgentProposal(room, {
    proposalType: 'evidence_review',
    summary: scenario.summary,
    rationale: scenario.rationale,
    riskLevel: 'needs_human_review',
    payload: {
      demo: true,
      source: 'load_sample_room',
      sampleId: scenario.id,
      language: scenario.language,
      taskType: scenario.taskType,
      contractId: scenario.contractId,
      nextHumanAction: scenario.language === 'zh'
        ? '發起者檢查 sample 圖片與欄位是否一致，確認或拒絕草稿。'
        : 'Host reviews the sample items and confirms or rejects this draft.',
      safeBoundary: 'No payment, booking, external form submission, formula change, or final settlement is performed by the assistant.'
    }
  });
  return {
    participant,
    proposal
  };
}

function getRoom(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return null;
  }
  return rooms.get(roomId) || null;
}

function touchRoom(room, reason = 'room_touched', shouldPersist = true) {
  room.updatedAt = nowIso();
  if (shouldPersist) {
    persistRooms(reason);
  }
}

function hasUsableDisplayName(displayName) {
  const name = normalizeDisplayName(displayName);
  return name !== '未命名';
}

function normalizeDisplayName(displayName) {
  const cleaned = String(displayName || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '未命名';
  }
  return cleaned.slice(0, 24);
}

function normalizeQty(qty) {
  const value = Number(qty);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(99, Math.floor(value)));
}

function normalizeDrinkOption(value, options, fallback) {
  const cleaned = String(value || '').replace(/\s+/g, '').trim();
  const match = options.find((option) => option.replace(/\s+/g, '') === cleaned);
  return match || fallback;
}

function groupUsesMultipleSelection(group) {
  return group?.selectionType === 'multiple' || group?.type === 'addon';
}

function normalizeSelectedOptions(item, options = {}) {
  const selected = {};
  const groups = Array.isArray(item?.optionGroups) ? item.optionGroups : [];
  const rawOptions = options && typeof options === 'object' ? options : {};

  for (const group of groups) {
    const validOptions = Array.isArray(group.options) ? group.options : [];
    if (!group.id || validOptions.length === 0) {
      continue;
    }

    if (groupUsesMultipleSelection(group)) {
      const rawValue = rawOptions[group.id];
      const requestedIds = Array.isArray(rawValue)
        ? rawValue.map((value) => String(value || ''))
        : String(rawValue || '').split(',').map((value) => value.trim()).filter(Boolean);
      const validIds = new Set(validOptions.map((option) => option.id));
      selected[group.id] = requestedIds.filter((optionId, index, list) => {
        return validIds.has(optionId) && list.indexOf(optionId) === index;
      });
      continue;
    }

    const requested = String(rawOptions[group.id] || '');
    const match = validOptions.find((option) => option.id === requested) || validOptions[0];
    if (match?.id) {
      selected[group.id] = match.id;
    }
  }

  return selected;
}

function normalizeOrderEntry(entry, item = null) {
  if (typeof entry === 'number') {
    return {
      qty: normalizeQty(entry),
      sweetness: defaultDrinkOptions.sweetness,
      ice: defaultDrinkOptions.ice,
      options: normalizeSelectedOptions(item)
    };
  }

  if (!entry || typeof entry !== 'object') {
    return {
      qty: 0,
      sweetness: defaultDrinkOptions.sweetness,
      ice: defaultDrinkOptions.ice,
      options: normalizeSelectedOptions(item)
    };
  }

  return {
    qty: normalizeQty(entry.qty),
    sweetness: normalizeDrinkOption(entry.sweetness, sweetnessOptions, defaultDrinkOptions.sweetness),
    ice: normalizeDrinkOption(entry.ice, iceOptions, defaultDrinkOptions.ice),
    options: normalizeSelectedOptions(item, entry.options)
  };
}

function getSelectedItemOptions(item, entry) {
  const selected = [];
  const groups = Array.isArray(item?.optionGroups) ? item.optionGroups : [];
  const normalizedEntry = normalizeOrderEntry(entry, item);

  for (const group of groups) {
    if (!Array.isArray(group.options)) {
      continue;
    }

    if (groupUsesMultipleSelection(group)) {
      const optionIds = Array.isArray(normalizedEntry.options[group.id])
        ? normalizedEntry.options[group.id]
        : [];
      for (const optionId of optionIds) {
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (option) {
          selected.push({
            group,
            option
          });
        }
      }
      continue;
    }

    const optionId = normalizedEntry.options[group.id];
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (option) {
      selected.push({
        group,
        option
      });
    }
  }

  return selected;
}

function getItemUnitPrice(item, entry) {
  const basePrice = Number(item?.price) || 0;
  const optionDelta = getSelectedItemOptions(item, entry)
    .reduce((sum, selected) => sum + (Number(selected.option.priceDelta) || 0), 0);
  return Math.max(0, basePrice + optionDelta);
}

function isSharedCostItem(item) {
  const category = String(item?.category || '').toLowerCase();
  const tags = Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag || '').toLowerCase()) : [];
  if (tags.some((tag) => ['shareable', 'room_package', 'per_person'].includes(tag))) {
    return true;
  }
  return ['venue', 'service', 'set'].includes(category);
}

function getOrderOptionSignature(entry) {
  const options = entry && typeof entry.options === 'object' && entry.options !== null ? entry.options : {};
  const parts = Object.entries(options)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupId, value]) => {
      const normalizedValue = Array.isArray(value)
        ? value.map((item) => String(item)).sort().join(',')
        : String(value || '');
      return `${groupId}=${normalizedValue}`;
    })
    .filter((part) => !part.endsWith('='));
  return parts.length > 0 ? parts.join('&') : 'base';
}

function buildClaimId(participantId, itemId, entry) {
  return [
    'claim',
    encodeURIComponent(String(participantId || 'unknown')),
    encodeURIComponent(String(itemId || 'unknown')),
    encodeURIComponent(getOrderOptionSignature(entry))
  ].join(':');
}

function inferDrinkItem(name) {
  const rawText = String(name || '').toLowerCase().replace(/[_｜|/（）()]+/g, ' ');
  const text = rawText.replace(/\s+/g, '');
  if (!text) {
    return false;
  }

  if (/茶葉蛋|茶碗蒸|茶油|油茶|茶餐|飯|麵|粥|湯|排骨|雞腿|便當|水餃|鍋貼|炒|燴|咖哩|小菜|滷味|沙拉|吐司|漢堡|蛋餅|鬆餅/.test(text)) {
    return false;
  }

  const chineseDrink = /紅茶|綠茶|青茶|烏龍|奶茶|鮮奶|拿鐵|咖啡|可可|豆漿|果汁|檸檬|多多|冰沙|奶蓋|手搖|飲品|飲料|冷飲|熱飲|氣泡|珍珠|波霸|椰果|仙草|布丁|芋圓|黑糖|乳酸/.test(text);
  const englishDrink = /\b(?:tea|milk tea|latte|coffee|americano|espresso|cappuccino|mocha|macchiato|cocoa|juice|lemonade|smoothie|boba|pearl|tapioca|foam|cheese foam|brown sugar|oolong|jasmine|matcha|yogurt|soda|cola)\b/i.test(rawText);
  return chineseDrink || englishDrink;
}

function shouldDropNonMenuPriceName(name) {
  const text = String(name || '').replace(/\s+/g, '').trim();
  return !text
    || nonMenuPriceFieldPattern.test(text)
    || addonOnlyItemPattern.test(text);
}

function isNonMenuMetadataLabel(value) {
  const text = String(value || '').replace(/\s+/g, '').trim();
  return !text || nonMenuPriceFieldPattern.test(text);
}

function inferMenuCategory(name, supportsDrinkOptions) {
  const rawText = String(name || '').replace(/[_｜|/（）()]+/g, ' ');
  const text = rawText.replace(/\s+/g, '');
  if (!text) {
    return 'other';
  }
  if (/包廂|包場|場地|場租|球場|羽球|籃球|網球|桌球|保齡球|泳池|泳道|會議室|教室|工作室|KTV|唱歌/i.test(text)
    || /\b(?:room|court|venue)\b/i.test(rawText)) {
    return 'venue';
  }
  if (/服務費|清潔費|低消|開瓶費|人頭費|計時費|鐘點|每人|低消|接駁|停車|外送|運費|保留費|免運|訂金|押金|造型|妝髮|美甲|美髮|改期費/.test(text)
    || /\b(?:service|minimum|per person|perperson|shuttle|parking|delivery|shipping|reservation|reserve|fee|gap|deposit|styling|makeup|nail|hair|salon|change fee|late change|referee)\b/i.test(rawText)) {
    return 'service';
  }
  if (/票券|門票|入場|報名|課程|體驗|活動|展覽|演唱會|成人票|優惠票|團體票|餐券|票|券/.test(text)
    || /\b(?:ticket|pass|admission|voucher|workshop|class|activity)\b/i.test(rawText)) {
    return 'ticket';
  }
  if (/租借|器材|球拍|鞋|裝備|麥克風|押金|置物櫃|保溫瓶|收納包|音響|記分板/.test(text)
    || /\b(?:rental|rent|equipment|locker|storage|scoreboard|speaker|gear|bibs?|balls?)\b/i.test(rawText)) {
    return 'rental';
  }
  if (supportsDrinkOptions || inferDrinkItem(text)) {
    return 'drink';
  }
  if (/套餐|組合|雙人|多人|分享餐|家庭餐|全餐/.test(text)
    || /\b(?:combo|set)\b/i.test(rawText)) {
    return 'set';
  }
  if (/湯|羹|鍋/.test(text) || /\b(?:soup|stew|hot pot|broth)\b/i.test(rawText)) {
    return 'soup';
  }
  if (/\b(?:steak|chicken|beef|pork|tofu|rice|noodle|ramen|pasta|burger|sandwich|pizza|curry|salad|fries|meal|dish)\b/i.test(rawText)) {
    return 'main';
  }
  if (/湯|羹|鍋/.test(text)) {
    return 'soup';
  }
  if (/甜點|蛋糕|布丁|豆花|冰品|鬆餅|可頌|塔|派/.test(text)) {
    return 'dessert';
  }
  if (/小菜|滷味|泡菜|青菜|沙拉|薯條|雞塊|炸物|點心|配菜|堅果|果乾|餅乾|零食|能量棒|水|飲用水/.test(text)
    || /\b(?:nuts?|dried fruit|energy bar|snack|cookie|cookies|cracker|crackers|water pack|water)\b/i.test(rawText)) {
    return 'snack';
  }
  if (/飯|麵|粥|粉|河粉|烏龍|義大利麵|便當|排骨|雞腿|牛肉|豬排|漢堡|三明治|吐司|蛋餅|披薩|咖哩|燴飯/.test(text)) {
    return 'main';
  }
  return 'other';
}

function normalizeMenuCategory(value, name, supportsDrinkOptions) {
  const category = String(value || '').toLowerCase().trim();
  if (menuCategories.has(category)) {
    return category;
  }
  return inferMenuCategory(name, supportsDrinkOptions);
}

function normalizeShortText(value, maxLength = 40) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeTemperature(value, name, supportsDrinkOptions) {
  const raw = normalizeShortText(value, 12);
  if (temperatureOptions.includes(raw)) {
    return raw;
  }
  const text = String(name || '').replace(/\s+/g, '');
  if (/冰|冷/.test(text)) {
    return '冷';
  }
  if (/熱|溫/.test(text)) {
    return '熱';
  }
  return supportsDrinkOptions ? '冷熱皆可' : '未標示';
}

function normalizeSpiceLevel(value, name) {
  const raw = String(value || '').toLowerCase().trim();
  if (spiceLevels.includes(raw)) {
    return raw;
  }
  const text = String(name || '').replace(/\s+/g, '');
  if (/大辣|重辣|特辣|爆辣|extra/.test(text)) {
    return 'extra_hot';
  }
  if (/中辣|辣味|麻辣|香辣|hot/.test(text)) {
    return 'hot';
  }
  if (/小辣|微辣|mild/.test(text)) {
    return 'mild';
  }
  if (/不辣|原味/.test(text)) {
    return 'none';
  }
  return 'unknown';
}

function normalizeFlagList(values, allowed, maxCount = 8) {
  const source = Array.isArray(values) ? values : [];
  const normalized = [];
  for (const value of source) {
    const key = String(value || '').toLowerCase().trim();
    if (!allowed.has(key) || normalized.includes(key)) {
      continue;
    }
    normalized.push(key);
    if (normalized.length >= maxCount) {
      break;
    }
  }
  return normalized;
}

function normalizeLocalOcrText(value) {
  if (localOcrMaxChars <= 0) {
    return '';
  }
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[｜|]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .slice(0, localOcrMaxChars)
    .trim();
}

function splitLocalOcrLines(text) {
  return normalizeLocalOcrText(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function detectOcrObservationType(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) {
    return 'empty';
  }
  if (/(?:電話|电话|手機|手机|客服|聯絡|联系|聯繫|tel|phone|cell|mobile|fax)\s*[:：]?\s*(?:\+?[0-9][0-9\-()\s]{6,}|[0-9]{2,4}[-\s][0-9]{3,4}[-\s]?[0-9]{3,4})/i.test(value)
    || /(?:\+?886[-\s]?)?0[0-9]{1,2}[-\s]?[0-9]{3,4}[-\s]?[0-9]{3,4}/.test(value)) {
    return 'phone_number';
  }
  if (/(?:統一編號|统一编号|統編|稅號|税号|營業人統編|tax\s*id|vat|business\s*(?:no|number|id))\s*[:：#]?\s*[A-Z0-9\- ]{6,}/i.test(value)) {
    return 'tax_identifier';
  }
  if (/(?:地址|住址|門牌|门牌|address|addr)\s*[:：]?\s*[A-Z0-9\u4e00-\u9fff ,.\-]{2,}/i.test(value) && /[0-9]/.test(value)) {
    return 'address_number';
  }
  if (/(?:縣|县|市|區|区|鄉|乡|鎮|镇)[\u4e00-\u9fff0-9\s]*(?:路|街|巷|弄|號|号|樓|楼)[\u4e00-\u9fff0-9\s]*/.test(value)
    && /[0-9]/.test(value)) {
    return 'address_number';
  }
  if (/(?:section|sec\.?|street|st\.|road|rd\.|lane|alley)\s+[A-Z0-9 ,.\-]{2,}/i.test(value)
    && /(?:address|addr|city|district|floor|suite|no\.|#)/i.test(value)
    && /[0-9]/.test(value)) {
    return 'address_number';
  }
  if (/(?:營業時間|营业时间|服務時間|開放時間|开放时间|時段|时段|場次|出發|返回|business\s*hours|opening\s*hours|open\s*time|service\s*hours|hours?)\s*[:：]?\s*(?:[0-9]{1,2}\s*[:：]?\s*[0-9]{0,2}\s*(?:-|~|至|到)\s*[0-9]{1,2}\s*[:：]?\s*[0-9]{0,2}|[0-9]{1,2}\s*(?:am|pm))/i.test(value)) {
    return 'time_range';
  }
  if (/(?:日期|時間|營業時間|場次|出發|返回|date|time)\s*[:：]?/i.test(value)
    || /(?:20[0-9]{2}|19[0-9]{2})[\/.-][0-9]{1,2}[\/.-][0-9]{1,2}/.test(value)
    || /[0-9]{1,2}\s*[:：]\s*[0-9]{2}/.test(value)) {
    return 'date_time';
  }
  if (/(?:發票|发票|收據|收据|單號|单号|訂單|订单|預約編號|预约编号|booking\s*id|reservation\s*(?:no|number|id)|invoice|receipt|order\s*(?:no|number|id)|no\.|#)\s*[:：#]?\s*[A-Z0-9\-]{4,}/i.test(value)) {
    return 'booking_or_invoice_identifier';
  }
  if (/(?:押金|保證金|deposit|security deposit)/i.test(value)) {
    return 'deposit_or_security';
  }
  if (/(?:訂金|預付|預收|prepay|prepaid|down payment)/i.test(value)) {
    return 'prepayment';
  }
  if (/(?:服務費|服務料|稅|營業稅|tax|service charge|service fee|surcharge)/i.test(value)) {
    return /%|％/.test(value) ? 'tax_or_fee_rate' : 'tax_or_fee_amount';
  }
  if (/(?:歲|年齡|幼兒|兒童|成人|child|adult|years? old)/i.test(value)) {
    return 'age_range';
  }
  if (/(?:^|[^未])滿\s*(?:NT\$?|\$|[0-9])|達\s*(?:NT\$?|\$|[0-9])|[0-9]\s*(?:件|人|位|份|組|杯|個)\s*以上|免運|折扣|[0-9]\s*折|優惠|門檻|threshold|minimum|discount|free shipping/i.test(value)) {
    return 'discount_or_threshold_rule';
  }
  if (/(?:人|位|名|pax|people|persons?|capacity)/i.test(value) && !/(?:NT\$?|\$|元|圓|塊|TWD|USD)/i.test(value)) {
    return 'capacity_or_quantity';
  }
  if (/(?:公里|里程|km|mile|分鐘|小時|hours?|mins?|minutes?)/i.test(value) && !/(?:NT\$?|\$|元|圓|塊|TWD|USD)/i.test(value)) {
    return 'distance_or_duration';
  }
  if (/(?:NT\$?|\$|元|圓|塊|TWD|USD)\s*[0-9]|[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:元|圓|塊|TWD|USD)/i.test(value)) {
    return 'currency_amount';
  }
  if (/[0-9]+(?:\.[0-9]+)?\s*(?:%|％)/.test(value)) {
    return 'percentage_rate';
  }
  if (/[0-9]/.test(value)) {
    return 'numeric_context';
  }
  return 'text_context';
}

function inferObservationBoundingZone(lineIndex, totalLines, detectedTypeHint) {
  const index = Number(lineIndex);
  const total = Number(totalLines);
  if (['phone_number', 'date_time', 'time_range', 'address_number', 'tax_identifier', 'booking_or_invoice_identifier'].includes(detectedTypeHint) && index <= 2) {
    return 'header_top';
  }
  if (['phone_number', 'date_time', 'time_range', 'address_number', 'tax_identifier', 'booking_or_invoice_identifier'].includes(detectedTypeHint) && Number.isFinite(total) && index >= Math.max(0, total - 3)) {
    return 'footer_bottom';
  }
  if (['deposit_or_security', 'prepayment', 'tax_or_fee_rate', 'tax_or_fee_amount', 'discount_or_threshold_rule'].includes(detectedTypeHint)) {
    return 'rules_or_notes';
  }
  if (['age_range', 'capacity_or_quantity', 'distance_or_duration', 'numeric_context'].includes(detectedTypeHint)) {
    return 'context_column';
  }
  return 'body_table';
}

function buildAuditAnchor(observation, index = 0) {
  return {
    id: `anchor_${observation.id}_${index + 1}`,
    anchorType: 'ocr_line',
    sourceAssetId: observation.assetId || null,
    sourceObservationId: observation.id,
    boundingZone: observation.boundingZone || 'unknown',
    bbox: observation.bbox || null,
    detectedTypeHint: observation.detectedTypeHint || 'unknown',
    auditAnchor: normalizeShortText(observation.normalizedText || observation.rawText || '', 160)
  };
}

function normalizeAuditAnchors(anchors, fallbackObservation = null) {
  const source = Array.isArray(anchors) ? anchors : [];
  const normalized = source.map((anchor, index) => ({
    id: normalizeShortText(anchor?.id || `anchor_${index + 1}`, 64),
    anchorType: normalizeShortText(anchor?.anchorType || 'ocr_line', 32),
    sourceAssetId: anchor?.sourceAssetId || fallbackObservation?.assetId || null,
    sourceObservationId: anchor?.sourceObservationId || fallbackObservation?.id || null,
    boundingZone: normalizeShortText(anchor?.boundingZone || fallbackObservation?.boundingZone || 'unknown', 40),
    bbox: anchor?.bbox && typeof anchor.bbox === 'object' ? anchor.bbox : null,
    detectedTypeHint: normalizeShortText(anchor?.detectedTypeHint || fallbackObservation?.detectedTypeHint || 'unknown', 48),
    auditAnchor: normalizeShortText(anchor?.auditAnchor || fallbackObservation?.normalizedText || fallbackObservation?.rawText || '', 160)
  })).filter((anchor) => anchor.auditAnchor || anchor.sourceObservationId || anchor.sourceAssetId);

  if (normalized.length === 0 && fallbackObservation) {
    normalized.push(buildAuditAnchor(fallbackObservation));
  }
  return normalized.slice(0, 6);
}

function makeReviewGate(id, reason, severity = 'warn', fields = [], resolvedByHost = false) {
  return {
    id,
    severity: reviewGateSeverities.has(severity) ? severity : 'warn',
    reason: normalizeShortText(reason, 180),
    fields: Array.isArray(fields) ? fields.map((field) => normalizeShortText(field, 48)).filter(Boolean).slice(0, 8) : [],
    resolvedByHost: Boolean(resolvedByHost)
  };
}

function normalizeReviewGates(gates) {
  return (Array.isArray(gates) ? gates : [])
    .map((gate) => makeReviewGate(
      gate?.id || 'review_gate',
      gate?.reason || gate?.detail || 'Needs host review before release.',
      gate?.severity || 'warn',
      gate?.fields || [],
      gate?.resolvedByHost
    ))
    .filter((gate) => gate.reason)
    .slice(0, 8);
}

function buildObservationReviewGates(detectedTypeHint, text) {
  const gates = [];
  const value = String(text || '');
  if (['phone_number', 'date_time', 'time_range', 'address_number', 'tax_identifier'].includes(detectedTypeHint)) {
    gates.push(makeReviewGate(
      'forbidden_context_number',
      'Identifier, address, date, time, tax, or contact-like numbers must not become member prices.',
      'block',
      ['price', 'sourceNumberClass']
    ));
  }
  if (detectedTypeHint === 'booking_or_invoice_identifier') {
    gates.push(makeReviewGate(
      'identifier_number_review',
      'Booking, invoice, receipt, or order identifiers are context metadata and should not become member prices.',
      'warn',
      ['price', 'sourceNumberClass']
    ));
  }
  if (['deposit_or_security', 'prepayment', 'tax_or_fee_rate', 'tax_or_fee_amount', 'discount_or_threshold_rule'].includes(detectedTypeHint)) {
    const thresholdAdvisoryOnly = detectedTypeHint === 'discount_or_threshold_rule'
      && /(?:成團門檻|門檻|免運|最低|minimum|threshold|free\s*shipping)/i.test(value)
      && !/(?:押金|保證金|訂金|預付|稅|服務費|另計|另收|外加|加收|deposit|prepay|tax|service\s*(?:fee|charge)|surcharge|split|allocate)/i.test(value);
    if (thresholdAdvisoryOnly) {
      gates.push(makeReviewGate(
        'threshold_advisory_review',
        'Threshold conditions are advisory context. AI flags them for host review but does not decide whether the group is committed.',
        'warn',
        ['displaySurface']
      ));
      return gates;
    }
    const formulaGateId = /(?:未含|另計|另收|外加|加收|依人數|每人|每位|per\s*person|per\s*pax|split|allocate)/i.test(value)
      ? 'unresolved_formula_requires_edit'
      : 'complex_formula_or_rule_review';
    gates.push(makeReviewGate(
      formulaGateId,
      'Deposits, prepayments, taxes, fees, discounts, and thresholds must route to host review before member release.',
      'block',
      ['priceRole', 'displaySurface']
    ));
  }
  if (['age_range', 'capacity_or_quantity', 'distance_or_duration', 'percentage_rate', 'numeric_context'].includes(detectedTypeHint)
    && !/(?:NT\$?|\$|元|圓|塊|TWD|USD)/i.test(value)) {
    gates.push(makeReviewGate(
      'non_price_number_review',
      'The number looks like age, capacity, duration, distance, percentage, or context metadata instead of a selectable price.',
      'warn',
      ['sourceNumberClass']
    ));
  }
  return gates;
}

function cleanLocalOcrName(value) {
  return String(value || '')
    .replace(/[.:：。]+$/g, '')
    .replace(/^[\-–—*•·\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function isLikelyLocalOcrSection(line) {
  const compact = String(line || '').replace(/\s+/g, '').trim();
  return compact.length > 0 && compact.length <= 16 && localOcrSectionPattern.test(compact);
}

function isLikelyLocalOcrDynamicSection(line, nextLine = '') {
  const compact = String(line || '').replace(/\s+/g, '').trim();
  if (compact.length < 2 || compact.length > 16) {
    return false;
  }
  if (extractLocalOcrPriceMatches(line).length > 0 || extractLocalOcrPriceMatches(nextLine).length === 0) {
    return false;
  }
  if (localOcrSkipLinePattern.test(line) || classifyLocalOcrRuleLine(line)) {
    return false;
  }
  if (/票價|費用|價格|菜單|menu|price|table/i.test(compact)) {
    return false;
  }
  return /[\u4e00-\u9fff]/.test(compact) || /^[A-Z][A-Za-z0-9 '&-]{1,31}$/.test(String(line || '').trim());
}

function extractLocalOcrPriceMatches(line) {
  const matches = [];
  localOcrPricePattern.lastIndex = 0;
  let match;
  while ((match = localOcrPricePattern.exec(line)) !== null) {
    const price = Number(String(match[1] || '').replace(/,/g, ''));
    if (!Number.isInteger(price) || price <= 0 || price > 5000) {
      continue;
    }
    matches.push({
      price,
      index: match.index,
      raw: match[0]
    });
  }
  return matches;
}

function selectLocalOcrPriceMatch(line, priceMatches) {
  if (priceMatches.length <= 1) {
    return priceMatches[0] || null;
  }

  const explicitCurrencyMatch = priceMatches.find((match) => /(?:NT\$|元|圓|塊)/i.test(String(match.raw || '')));
  if (explicitCurrencyMatch) {
    return explicitCurrencyMatch;
  }

  const normalizedLine = String(line || '').toLowerCase();
  const nonPriceNumericContext = /(?:cups?|qty|quantity|count|pcs?|pieces?|orders?|sets?|boxes?|packs?|items?|hour|hours|hr|hrs|pax|person|people|player|players|attendee|attendees|ticket|tickets|weekday|weekend|day|days|age|years?\s*old|yo|小時|鐘|人|位|堂|次|分鐘|分|杯|瓶|份|件|個|張|名|組|盒|包|套|桶|歲|未滿|以上|以下|含)/i;
  for (let index = 0; index < priceMatches.length - 1; index += 1) {
    const current = priceMatches[index];
    const next = priceMatches[index + 1];
    const between = normalizedLine.slice(current.index + String(current.raw || '').length, next.index);
    if (current.price <= 24 && nonPriceNumericContext.test(between)) {
      return priceMatches[priceMatches.length - 1];
    }
  }

  return priceMatches[0];
}

function isLikelyLocalOcrQuantityMatch(line, match, nextMatch = null) {
  const text = String(line || '');
  const rawLength = String(match?.raw || '').length;
  const afterEnd = nextMatch ? nextMatch.index : Math.min(text.length, match.index + rawLength + 24);
  const after = text.slice(match.index + rawLength, afterEnd);
  const before = text.slice(Math.max(0, match.index - 24), match.index);
  if (localOcrAgeContextPattern.test(after)) {
    return true;
  }
  return (Number(match?.price) <= 300 && localOcrQuantityContextPattern.test(after))
    || localOcrQuantityPrefixPattern.test(before);
}

function getLocalOcrPriceCandidates(line, priceMatches) {
  const explicitCurrencyMatches = priceMatches.filter((match) => /(?:NT\$|\$|元|圓|塊|TWD|USD)/i.test(String(match.raw || '')));
  if (explicitCurrencyMatches.length > 0) {
    return explicitCurrencyMatches;
  }
  const candidates = priceMatches.filter((match, index) => !isLikelyLocalOcrQuantityMatch(line, match, priceMatches[index + 1] || null));
  return candidates.length > 0 ? candidates : priceMatches;
}

function extractLocalOcrTableColumnLabels(line) {
  const text = String(line || '').replace(/\s+/g, ' ').trim();
  if (!text || extractLocalOcrPriceMatches(text).length > 0) {
    return [];
  }

  const labels = [];
  const routePattern = /(?:行程|方案|路線|Route|Trip|Tour|Plan)\s*[A-Z0-9一二三四五六七八九十]*\s*[^|｜]*?(?=\s*[|｜]|\s+備註|\s+Note|\s*$)/gi;
  let routeMatch;
  while ((routeMatch = routePattern.exec(text)) !== null) {
    const label = cleanLocalOcrName(routeMatch[0]
      .replace(/^(?:類別|條件|方案|備註|Category|Condition|Note)\s*/i, ''));
    if (label && label.length >= 2 && !labels.includes(label)) {
      labels.push(label);
    }
  }

  if (labels.length >= 2) {
    return labels.slice(0, 6);
  }

  const splitLabels = text
    .split(/[|｜]/)
    .map((part) => cleanLocalOcrName(part
      .replace(/^(?:類別|條件|方案|備註|Category|Condition|Plan|Note)\s*/i, '')
      .replace(/\s*(?:備註|Note)\s*$/i, '')))
    .filter((part) => part.length >= 2 && !isNonMenuMetadataLabel(part));
  return splitLabels.length >= 2 ? splitLabels.slice(0, 6) : [];
}

function shouldTreatLocalOcrLineAsMultiColumnPriceRow(taskType, name, priceCandidates) {
  if (!Array.isArray(priceCandidates) || priceCandidates.length < 2) {
    return false;
  }
  if (inferDrinkItem(name)) {
    return false;
  }
  return ['ticket_activity', 'venue_booking', 'rental_share', 'service_booking', 'parse_transport_share'].includes(normalizeRoomTaskType(taskType));
}

function stripLocalOcrPriceText(line) {
  return String(line || '')
    .replace(localOcrPricePattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocalOcrMultiColumnItems(line, priceCandidates, tableColumnLabels, currentSection, selectedTaskType, imageCount) {
  const rowLabel = cleanLocalOcrName(stripLocalOcrPriceText(line)
    .replace(/^(?:類別|條件|方案|Category|Condition|Plan)\s*/i, '')
    .replace(/[|｜]/g, ' '));
  if (!rowLabel || shouldDropNonMenuPriceName(rowLabel)) {
    return [];
  }

  return priceCandidates.slice(0, Math.max(2, tableColumnLabels.length || 2)).map((priceMatch, index) => {
    const columnLabel = tableColumnLabels[index] || `${currentSection || '方案'} ${index + 1}`;
    const name = cleanLocalOcrName(`${columnLabel} ${rowLabel}`);
    return {
      name,
      price: priceMatch.price,
      priceRole: normalizePriceRole('', { name, sectionName: currentSection }, selectedTaskType),
      sourceNumberClass: normalizeSourceNumberClass('', { name, sectionName: currentSection, rawTextEvidence: line }),
      currency: 'TWD',
      quantity: 1,
      unit: inferUnitFromText(line),
      rawTextEvidence: normalizeShortText(line, 220),
      confidence: 0.82,
      supportsDrinkOptions: false,
      sourceImageIndex: Math.min(1, imageCount),
      category: selectedTaskType === 'ticket_activity'
        ? 'ticket'
        : normalizeMenuCategory('', `${currentSection} ${columnLabel} ${rowLabel}`, false),
      sectionName: currentSection || cleanLocalOcrName(columnLabel),
      sizeLabel: cleanLocalOcrName(rowLabel),
      temperature: '未標示',
      spiceLevel: normalizeSpiceLevel('', name),
      dietaryFlags: [],
      tags: ['manual_review'],
      conditions: normalizeConditions([], line),
      reviewFlags: ['multiple_price_candidates'],
      note: 'This photo row appears to contain several prices. Please check each draft item against the photo.',
      optionGroups: []
    };
  }).filter((item) => item.name && Number.isInteger(item.price));
}

function extractLocalOcrRuleAmount(line) {
  localOcrRuleAmountPattern.lastIndex = 0;
  let match;
  while ((match = localOcrRuleAmountPattern.exec(String(line || ''))) !== null) {
    const amount = Number(String(match[1] || '').replace(/,/g, ''));
    if (Number.isInteger(amount) && amount > 0 && amount <= 1000000) {
      return amount;
    }
  }
  return null;
}

function extractLocalOcrAmountNearPattern(line, markerPattern) {
  const text = String(line || '');
  const markerMatch = markerPattern.exec(text);
  markerPattern.lastIndex = 0;
  if (!markerMatch) {
    return null;
  }
  const sliceStart = markerMatch.index + markerMatch[0].length;
  const sliceEnd = Math.min(text.length, markerMatch.index + markerMatch[0].length + 28);
  return extractLocalOcrRuleAmount(text.slice(sliceStart, sliceEnd));
}

function buildLocalOcrRuleHint(type, line, amount = null) {
  return {
    type,
    amount: Number.isInteger(amount) && amount > 0 ? amount : null,
    text: normalizeShortText(line, 80)
  };
}

function classifyLocalOcrRuleLine(line) {
  const text = String(line || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  if (localOcrSoldOutLinePattern.test(text)) {
    return buildLocalOcrRuleHint('unavailable_item', text);
  }

  const amount = extractLocalOcrRuleAmount(text);
  if (localOcrFreeShippingRulePattern.test(text) && amount) {
    return buildLocalOcrRuleHint('free_shipping_threshold', text, amount);
  }
  if (localOcrMinimumRulePattern.test(text)) {
    const thresholdAmount = extractLocalOcrAmountNearPattern(text, /(?:成團門檻|門檻|滿額|起送|低消|最低消費|minimum\s*(?:order|spend|charge|consume)|min\.?\s*(?:order|spend|charge)|threshold)\s*[:：]?\s*(?:滿|達)?\s*/gi)
      || amount;
    if (thresholdAmount) {
      return buildLocalOcrRuleHint('minimum_threshold', text, thresholdAmount);
    }
  }
  if (localOcrDiscountRulePattern.test(text)) {
    return buildLocalOcrRuleHint('discount_rule', text);
  }

  return null;
}

function hashBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    ? createHash('sha256').update(buffer).digest('hex')
    : '';
}

function normalizeDisplaySurface(value) {
  const surface = String(value || '').trim();
  return displaySurfaces.has(surface) ? surface : 'member_selectable';
}

function normalizeParserCandidateStatus(value) {
  const status = String(value || '').trim();
  return parserCandidateStatuses.has(status) ? status : 'pending';
}

function inferDisplaySurface(item = {}, taskType = '') {
  const role = normalizePriceRole(item.priceRole, item, taskType);
  const sourceClass = normalizeSourceNumberClass(item.sourceNumberClass, item);
  const text = `${item.name || ''} ${item.sectionName || ''} ${item.note || ''} ${item.rawTextEvidence || ''}`.toLowerCase();
  const tenderedPaymentText = /^(?:現金|刷卡|信用卡|找零)|(?:cash|change|credit\s*card)\b/i.test(text)
    && !/現金價|cash\s*price/i.test(text);

  if (taskType === 'parse_transport_share' && /起步價|每公里|夜間加成|過路費|停車費|base\s*fare|per\s*km|toll|parking|surcharge/i.test(text)) {
    return 'host_rule_panel';
  }
  if (['aggregate_subtotal', 'aggregate_grand_total', 'subtotal_observation', 'grand_total_observation'].includes(role)
    || ['receipt_total', 'payment_amount'].includes(sourceClass)
    || /小計|總計|合計|實付|subtotal|grand\s*total/i.test(text)
    || tenderedPaymentText) {
    return 'audit_anchor';
  }
  if (['discount', 'discount_rate', 'discount_amount', 'tax_and_fee', 'tax_rate', 'tax_fixed_fee', 'service_rate', 'service_fixed_fee', 'shared_fixed_fee', 'deposit', 'prepayment_down', 'threshold_amount', 'points_value'].includes(role)) {
    return 'host_rule_panel';
  }
  if (['percentage_rate', 'distance', 'duration', 'quantity', 'capacity', 'identifier', 'points'].includes(sourceClass)
    && role !== 'line_item') {
    return 'metadata_only';
  }
  if (role === 'non_price_context') {
    return 'metadata_only';
  }
  return 'member_selectable';
}

function buildEvidenceAssetsFromImages(room, images = [], options = {}) {
  return images.map((image, index) => {
    const buffer = image?.buffer || null;
    return {
      id: `asset_${index + 1}`,
      roomId: room.id,
      kind: options.kind || 'uploaded_image',
      mimeType: image?.mimeType || image?.mimetype || 'image/jpeg',
      sha256: hashBuffer(buffer),
      width: image?.width || image?.processedWidth || null,
      height: image?.height || image?.processedHeight || null,
      byteSize: Buffer.isBuffer(buffer) ? buffer.length : Number(image?.processedBytes || image?.originalBytes || 0),
      sourceLabel: normalizeShortText(options.sourceLabel || `evidence image ${index + 1}`, 80),
      storagePolicy: 'processed_room_evidence',
      createdAt: nowIso()
    };
  });
}

function buildOcrObservationsFromText(room, localOcrText = '', evidenceAssets = [], source = 'user_pasted_text') {
  const assetId = evidenceAssets[0]?.id || null;
  const lines = splitLocalOcrLines(localOcrText);
  return lines.map((line, index) => {
    const normalizedText = normalizeShortText(line.replace(/\s+/g, ' ').trim(), 260);
    const detectedTypeHint = detectOcrObservationType(normalizedText);
    const observation = {
      id: `ocr_${index + 1}`,
      roomId: room.id,
      assetId,
      lineIndex: index,
      rawText: normalizeShortText(line, 260),
      normalizedText,
      bbox: null,
      boundingZone: inferObservationBoundingZone(index, lines.length, detectedTypeHint),
      detectedTypeHint,
      confidence: source === 'user_pasted_text' ? 0.72 : 0.86,
      source,
      auditAnchor: normalizedText,
      auditAnchors: [],
      reviewGates: buildObservationReviewGates(detectedTypeHint, normalizedText),
      manualEdited: source === 'manual_edit',
      createdAt: nowIso()
    };
    observation.auditAnchors = normalizeAuditAnchors([], observation);
    return observation;
  });
}

function findObservationsByIds(observationIds = [], observations = []) {
  const idSet = new Set(Array.isArray(observationIds) ? observationIds : []);
  return observations.filter((observation) => idSet.has(observation.id));
}

function mergeReviewGates(...gateGroups) {
  const merged = [];
  const seen = new Set();
  for (const gate of gateGroups.flatMap((group) => Array.isArray(group) ? group : [])) {
    const normalized = normalizeReviewGates([gate])[0];
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    merged.push(normalized);
  }
  return merged.slice(0, 8);
}

function buildCandidateAuditAnchors(observationIds = [], observations = []) {
  return findObservationsByIds(observationIds, observations)
    .flatMap((observation) => normalizeAuditAnchors(observation.auditAnchors, observation))
    .slice(0, 6);
}

function buildCandidateReviewGates(candidate, observations = []) {
  if (candidate?.priceRole === 'threshold_amount' && candidate?.displaySurface === 'host_rule_panel') {
    return mergeReviewGates(
      candidate.reviewGates,
      makeReviewGate(
        'threshold_advisory_review',
        'Threshold conditions are advisory context. AI flags them for host review but does not decide whether the group is committed.',
        'warn',
        ['displaySurface']
      )
    );
  }
  const matchedObservations = findObservationsByIds(candidate?.sourceObservationIds, observations);
  const gates = matchedObservations.flatMap((observation) => normalizeReviewGates(observation.reviewGates));
  const fallbackEvidenceText = [
    candidate?.rawTextEvidence,
    candidate?.auditAnchor,
    candidate?.label,
    candidate?.name
  ].filter(Boolean).join(' ');
  if (fallbackEvidenceText) {
    const fallbackDetectedType = detectOcrObservationType(fallbackEvidenceText);
    gates.push(...buildObservationReviewGates(fallbackDetectedType, fallbackEvidenceText));
  }
  const priceRole = String(candidate?.priceRole || 'line_item');
  const sourceNumberClass = String(candidate?.sourceNumberClass || 'unknown');
  const displaySurface = String(candidate?.displaySurface || 'member_selectable');
  const reviewFlags = Array.isArray(candidate?.reviewFlags) ? candidate.reviewFlags : [];
  if (displaySurface !== 'member_selectable') {
    gates.push(makeReviewGate(
      'non_member_surface_requires_host_review',
      'This candidate is a host rule, audit value, metadata, or review-only field and must not be released as a member option before host review.',
      'block',
      ['displaySurface', 'priceRole']
    ));
  }
  if (priceRole !== 'line_item') {
    gates.push(makeReviewGate(
      'non_line_item_price_role_requires_review',
      'The extracted number is not a normal line-item price and needs host confirmation.',
      'block',
      ['priceRole']
    ));
  }
  if (sourceNumberClass !== 'currency_amount' && displaySurface === 'member_selectable') {
    gates.push(makeReviewGate(
      'member_item_non_currency_number_review',
      'A member-visible item must be backed by a currency amount, not age, quantity, date, duration, distance, or identifier text.',
      'block',
      ['sourceNumberClass']
    ));
  }
  if (reviewFlags.length > 0 || Number(candidate?.confidence || 1) < 0.82) {
    gates.push(makeReviewGate(
      'low_confidence_or_flagged_candidate_review',
      'The parser marked this field as uncertain or low-confidence; host review is required before release.',
      'warn',
      ['confidence', 'reviewFlags']
    ));
  }
  return mergeReviewGates(gates);
}

function resolveReviewGatesAfterHostDecision(gates, action = 'accept') {
  if (!['accept', 'modify'].includes(action)) {
    return normalizeReviewGates(gates);
  }
  return normalizeReviewGates(gates).map((gate) => {
    if (action === 'accept' && structuralReviewGateIds.has(gate.id)) {
      return gate;
    }
    if (gate.severity !== 'block') {
      return gate;
    }
    return {
      ...gate,
      severity: 'warn',
      resolvedByHost: true,
      reason: normalizeShortText(`${gate.reason} Host reviewed this gate before member release.`, 180)
    };
  });
}

function getUnresolvedStructuralReviewGates(candidate) {
  return normalizeReviewGates(candidate?.reviewGates)
    .filter((gate) => gate.severity === 'block' && structuralReviewGateIds.has(gate.id) && !gate.resolvedByHost);
}

function findObservationIdsForEvidence(rawTextEvidence, observations = [], label = '') {
  const evidence = String(rawTextEvidence || '').replace(/\s+/g, ' ').trim();
  const normalizedLabel = String(label || '').replace(/\s+/g, ' ').trim();
  if (!evidence && !normalizedLabel) {
    return [];
  }
  const exact = observations.find((observation) => observation.normalizedText === evidence || observation.rawText === evidence);
  if (exact) {
    return [exact.id];
  }
  const partial = observations.find((observation) => {
    const text = String(observation.normalizedText || observation.rawText || '');
    return text.includes(evidence) || evidence.includes(text);
  });
  if (partial) {
    return [partial.id];
  }
  const labelMatch = normalizedLabel
    ? observations.find((observation) => String(observation.normalizedText || observation.rawText || '').includes(normalizedLabel))
    : null;
  return labelMatch ? [labelMatch.id] : [];
}

function extractFirstNumberFromText(text) {
  const match = String(text || '').match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    return null;
  }
  const value = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function inferRuleCandidateFromObservation(room, observation, options = {}) {
  const text = String(observation?.normalizedText || observation?.rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  const amount = extractLocalOcrRuleAmount(text) ?? extractFirstNumberFromText(text);
  const currencyAmounts = Array.from(text.matchAll(/(?:NT\$?\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*(?:元|圓|塊)?/gi))
    .map((match) => Number(String(match[1] || '').replace(/,/g, '')))
    .filter((value) => Number.isFinite(value));
  const base = {
    roomId: room.id,
    scenarioContractId: options.scenarioContractId || room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
    taskType: options.taskType || room.taskRouter?.taskType || room.menuType,
    sourceAssetId: observation.assetId || null,
    sourceObservationIds: [observation.id],
    proposedItemId: null,
    label: normalizeShortText(text.replace(/(?:NT\$?\s*)?[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:%|折|元|圓|塊)?/g, '').trim() || text, 80),
    amount: Number.isFinite(amount) ? amount : 0,
    currency: 'TWD',
    quantity: 1,
    unit: inferUnitFromText(text),
    conditions: normalizeConditions([], text),
    category: 'service',
    optionGroups: [],
    confidence: 0.82,
    reviewFlags: ['review_required'],
    boundingZone: observation.boundingZone || 'unknown',
    detectedTypeHint: observation.detectedTypeHint || detectOcrObservationType(text),
    auditAnchor: observation.auditAnchor || normalizeShortText(text, 160),
    auditAnchors: normalizeAuditAnchors(observation.auditAnchors, observation),
    reviewGates: normalizeReviewGates(observation.reviewGates),
    rawTextEvidence: normalizeShortText(text, 260),
    createdAt: nowIso(),
    status: 'pending',
    reviewedAt: null,
    reviewedBy: null
  };

  const ruleHint = classifyLocalOcrRuleLine(text);
  if (ruleHint?.type === 'free_shipping_threshold' || ruleHint?.type === 'minimum_threshold') {
    return {
      ...base,
      label: normalizeShortText(ruleHint.text, 80),
      amount: Number(ruleHint.amount || amount || 0),
      priceRole: 'threshold_amount',
      sourceNumberClass: 'currency_amount',
      displaySurface: 'host_rule_panel',
      reviewFlags: ['threshold_advisory'],
      reviewGates: [
        makeReviewGate(
          'threshold_advisory_review',
          'Threshold conditions are advisory context. AI flags them for host review but does not decide whether the group is committed.',
          'warn',
          ['displaySurface']
        )
      ],
      status: 'accepted',
      reviewedAt: nowIso(),
      reviewedBy: 'system_threshold_advisory'
    };
  }
  if (ruleHint?.type === 'discount_rule') {
    const discountAmount = currencyAmounts.length > 1
      ? currencyAmounts[currencyAmounts.length - 1]
      : Number(ruleHint.amount || amount || 0);
    const isQuantityDiscount = /買\s*[0-9]+\s*送\s*[0-9]+|[0-9]+\s*for\s*[0-9]+/i.test(text);
    return {
      ...base,
      label: normalizeShortText(ruleHint.text, 80),
      amount: discountAmount,
      priceRole: isQuantityDiscount ? 'discount' : /折/.test(text) && !/NT\$?|元|圓|塊/.test(text) ? 'discount_rate' : 'discount_amount',
      sourceNumberClass: isQuantityDiscount ? 'quantity' : /%|折/.test(text) ? 'percentage_rate' : 'currency_amount',
      displaySurface: 'host_rule_panel'
    };
  }
  if (/服務費率|服務費\s*[0-9.]+\s*%|[0-9.]+\s*%\s*(?:服務費|服務料|加收)|service\s*(?:rate|charge)[^0-9]*[0-9.]+\s*%|[0-9.]+\s*%\s*service\s*(?:rate|charge|fee)/i.test(text)) {
    return {
      ...base,
      priceRole: 'service_rate',
      sourceNumberClass: 'percentage_rate',
      displaySurface: 'host_rule_panel'
    };
  }
  if (/營業稅|含稅|稅率|稅\s*[0-9.]+\s*%|[0-9.]+\s*%\s*(?:稅|營業稅)|tax[^0-9]*[0-9.]+\s*%|[0-9.]+\s*%\s*tax/i.test(text)) {
    return {
      ...base,
      priceRole: 'tax_rate',
      sourceNumberClass: 'percentage_rate',
      displaySurface: /已含|included/i.test(text) ? 'audit_anchor' : 'host_rule_panel'
    };
  }
  if (/押金|保證金|deposit|security\s*deposit/i.test(text)) {
    return {
      ...base,
      priceRole: 'deposit',
      sourceNumberClass: 'currency_amount',
      displaySurface: 'host_rule_panel'
    };
  }
  if (/訂金|預付|prepay|down\s*payment/i.test(text)) {
    return {
      ...base,
      priceRole: 'prepayment_down',
      sourceNumberClass: 'currency_amount',
      displaySurface: 'host_rule_panel'
    };
  }
  if (/小計|subtotal/i.test(text)) {
    return {
      ...base,
      priceRole: 'subtotal_observation',
      sourceNumberClass: 'receipt_total',
      displaySurface: 'audit_anchor'
    };
  }
  if (/總計|合計|實付|應付|grand\s*total|total/i.test(text)) {
    return {
      ...base,
      priceRole: 'grand_total_observation',
      sourceNumberClass: 'receipt_total',
      displaySurface: 'audit_anchor'
    };
  }
  if (/^(?:現金|刷卡|信用卡|找零)|(?:cash|change|credit\s*card)\b/i.test(text) && !/現金價|cash\s*price/i.test(text)) {
    return {
      ...base,
      priceRole: 'non_price_context',
      sourceNumberClass: 'payment_amount',
      displaySurface: 'audit_anchor'
    };
  }
  if (/行程約|距離|公里|km|mile/i.test(text) && !/(?:NT\$?|元|圓|塊)/i.test(text)) {
    return {
      ...base,
      priceRole: 'non_price_context',
      sourceNumberClass: 'distance',
      displaySurface: 'metadata_only',
      status: 'accepted',
      reviewedAt: nowIso(),
      reviewedBy: 'system_metadata_router'
    };
  }
  if (/每梯次|限\s*[0-9]+\s*人|[0-9]+\s*人(?:以上|以下)?|capacity|pax/i.test(text) && !/(?:NT\$?|元|圓|塊)/i.test(text)) {
    return {
      ...base,
      priceRole: 'non_price_context',
      sourceNumberClass: 'capacity',
      displaySurface: 'metadata_only',
      status: 'accepted',
      reviewedAt: nowIso(),
      reviewedBy: 'system_metadata_router'
    };
  }
  if (/點數|點|points?/i.test(text) && !/(?:NT\$?|元|圓|塊|cash\s*price)/i.test(text)) {
    return {
      ...base,
      priceRole: 'points_value',
      sourceNumberClass: 'points_value',
      displaySurface: 'host_rule_panel'
    };
  }

  return null;
}

function buildRuleCandidatesFromObservations(room, observations = [], existingCandidates = [], options = {}) {
  const seen = new Set(existingCandidates.map((candidate) => `${candidate.priceRole}|${candidate.rawTextEvidence}`));
  const candidates = [];
  for (const observation of observations) {
    const candidate = inferRuleCandidateFromObservation(room, observation, options);
    if (!candidate) {
      continue;
    }
    const key = `${candidate.priceRole}|${candidate.rawTextEvidence}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const nextCandidate = {
      ...candidate,
      id: `candidate_${existingCandidates.length + candidates.length + 1}`
    };
    nextCandidate.reviewGates = mergeReviewGates(
      nextCandidate.reviewGates,
      buildCandidateReviewGates(nextCandidate, observations)
    );
    candidates.push(nextCandidate);
  }
  return candidates;
}

function buildParserCandidatesFromItems(room, items = [], observations = [], options = {}) {
  const taskType = options.taskType || room.taskRouter?.taskType || room.menuType;
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const priceRole = normalizePriceRole(item.priceRole, item, taskType);
    const sourceNumberClass = normalizeSourceNumberClass(item.sourceNumberClass, item);
    const displaySurface = inferDisplaySurface({
      ...item,
      priceRole,
      sourceNumberClass
    }, taskType);
    const sourceObservationIds = findObservationIdsForEvidence(item.rawTextEvidence, observations, item.name);
    const matchedObservations = findObservationsByIds(sourceObservationIds, observations);
    const primaryObservation = matchedObservations[0] || null;
    const auditAnchors = normalizeAuditAnchors(
      Array.isArray(item.auditAnchors) ? item.auditAnchors : buildCandidateAuditAnchors(sourceObservationIds, observations),
      primaryObservation
    );
    const candidateDraft = {
      priceRole,
      sourceNumberClass,
      displaySurface,
      sourceObservationIds,
      reviewFlags: normalizeFlagList(item.reviewFlags, reviewFlagTypes, 12),
      confidence: normalizeConfidence(item.confidence)
    };
    const reviewGates = mergeReviewGates(
      item.reviewGates,
      buildCandidateReviewGates(candidateDraft, observations)
    );
    return {
      id: `candidate_${index + 1}`,
      roomId: room.id,
      scenarioContractId: options.scenarioContractId || room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
      taskType,
      sourceAssetId: observations.find((observation) => sourceObservationIds.includes(observation.id))?.assetId || null,
      sourceObservationIds,
      proposedItemId: item.id || null,
      label: normalizeShortText(item.name, 80),
      amount: Number(item.price || 0),
      currency: normalizeShortText(item.currency || 'TWD', 12).toUpperCase() || 'TWD',
      quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1,
      unit: normalizeShortText(item.unit || '', 24),
      priceRole,
      sourceNumberClass,
      displaySurface,
      conditions: Array.isArray(item.conditions) ? item.conditions : [],
      category: item.category || 'other',
      optionGroups: Array.isArray(item.optionGroups) ? item.optionGroups : [],
      confidence: candidateDraft.confidence,
      reviewFlags: candidateDraft.reviewFlags,
      boundingZone: primaryObservation?.boundingZone || normalizeShortText(item.boundingZone || 'unknown', 40),
      detectedTypeHint: primaryObservation?.detectedTypeHint || detectOcrObservationType(item.rawTextEvidence || item.name),
      auditAnchor: primaryObservation?.auditAnchor || normalizeShortText(item.rawTextEvidence || item.name, 160),
      auditAnchors,
      reviewGates,
      status: displaySurface === 'member_selectable' ? 'accepted' : 'pending',
      rawTextEvidence: normalizeShortText(item.rawTextEvidence, 260),
      createdAt: nowIso(),
      reviewedAt: displaySurface === 'member_selectable' ? nowIso() : null,
      reviewedBy: displaySurface === 'member_selectable' ? 'system_candidate_router' : null
    };
  });
}

function buildCalculationRulesFromCandidates(candidates = []) {
  return candidates
    .filter((candidate) => ['host_rule_panel', 'audit_anchor'].includes(candidate.displaySurface))
    .map((candidate, index) => ({
      id: `rule_${index + 1}`,
      candidateId: candidate.id,
      roomId: candidate.roomId,
      ruleType: candidate.priceRole,
      displaySurface: candidate.displaySurface,
      targetScope: candidate.displaySurface === 'audit_anchor' ? 'audit_only' : 'room_total',
      amount: candidate.amount,
      currency: candidate.currency,
      sourceNumberClass: candidate.sourceNumberClass,
      sourceObservationIds: candidate.sourceObservationIds,
      auditAnchors: normalizeAuditAnchors(candidate.auditAnchors),
      reviewGates: normalizeReviewGates(candidate.reviewGates),
      status: candidate.status,
      reviewRequired: candidate.status !== 'accepted',
      createdAt: candidate.createdAt
    }));
}

function buildSelectableItemsFromCandidates(items = [], candidates = []) {
  const selectableIds = new Set(candidates
    .filter((candidate) => candidate.displaySurface === 'member_selectable' && ['accepted', 'modified'].includes(candidate.status))
    .map((candidate) => candidate.proposedItemId)
    .filter(Boolean));
  return (Array.isArray(items) ? items : [])
    .filter((item) => selectableIds.has(item.id))
    .map((item) => {
      const candidate = candidates.find((entry) => entry.proposedItemId === item.id);
      return {
        ...item,
        parserCandidateId: candidate?.id || null,
        displaySurface: 'member_selectable',
        sourceAssetId: candidate?.sourceAssetId || null,
        sourceObservationIds: candidate?.sourceObservationIds || [],
        boundingZone: candidate?.boundingZone || item.boundingZone || 'unknown',
        detectedTypeHint: candidate?.detectedTypeHint || item.detectedTypeHint || 'unknown',
        auditAnchor: candidate?.auditAnchor || item.auditAnchor || item.rawTextEvidence || '',
        auditAnchors: normalizeAuditAnchors(candidate?.auditAnchors || item.auditAnchors),
        reviewGates: normalizeReviewGates(candidate?.reviewGates || item.reviewGates)
      };
    });
}

function applyEvidenceReviewLayers(room, parsedItems = [], options = {}) {
  const evidenceAssets = buildEvidenceAssetsFromImages(room, options.images || room.menuImages || [], {
    kind: options.evidenceKind || 'uploaded_image',
    sourceLabel: options.sourceLabel || 'price evidence'
  });
  const ocrObservations = buildOcrObservationsFromText(room, options.localOcrText || '', evidenceAssets, options.ocrSource || 'user_pasted_text');
  const itemCandidates = buildParserCandidatesFromItems(room, parsedItems, ocrObservations, {
    taskType: options.taskType,
    scenarioContractId: options.scenarioContractId
  });
  const ruleCandidates = buildRuleCandidatesFromObservations(room, ocrObservations, itemCandidates, {
    taskType: options.taskType,
    scenarioContractId: options.scenarioContractId
  });
  const parserCandidates = itemCandidates.concat(ruleCandidates);
  const calculationRules = buildCalculationRulesFromCandidates(parserCandidates);
  const selectableItems = buildSelectableItemsFromCandidates(parsedItems, itemCandidates);

  room.evidenceAssets = evidenceAssets;
  room.ocrObservations = ocrObservations;
  room.parserCandidates = parserCandidates;
  room.calculationRules = calculationRules;
  room.reviewDecisions = Array.isArray(room.reviewDecisions) ? room.reviewDecisions : [];
  room.settlementSnapshots = Array.isArray(room.settlementSnapshots) ? room.settlementSnapshots : [];
  room.items = selectableItems;
  return {
    evidenceAssets,
    ocrObservations,
    parserCandidates,
    calculationRules,
    selectableItems
  };
}

function getAntiPollutionBlocks(room) {
  const blocks = [];
  const candidates = Array.isArray(room?.parserCandidates) ? room.parserCandidates : [];
  const rules = Array.isArray(room?.calculationRules) ? room.calculationRules : [];
  const selectableItems = Array.isArray(room?.items) ? room.items : [];
  const pendingCandidates = candidates.filter((candidate) => !['accepted', 'modified', 'rejected'].includes(normalizeParserCandidateStatus(candidate.status)));
  if (pendingCandidates.length > 0) {
    const itemNoun = pendingCandidates.length === 1 ? 'photo row needs' : 'photo rows need';
    blocks.push({
      id: 'pending_candidates_block_member_open',
      severity: 'block',
      detail: `${pendingCandidates.length} ${itemNoun} host review before members can use the list.`
    });
  }
  const pollutedItems = selectableItems.filter((item) => inferDisplaySurface(item, room?.taskRouter?.taskType) !== 'member_selectable');
  if (pollutedItems.length > 0) {
    const itemNoun = pollutedItems.length === 1 ? 'fee or rule row is' : 'fee or rule rows are';
    blocks.push({
      id: 'rule_roles_not_member_selectable',
      severity: 'block',
      detail: `${pollutedItems.length} ${itemNoun} still showing as member choices.`
    });
  }
  const missingEvidenceItems = selectableItems.filter((item) => !item.sourceAssetId && (!Array.isArray(item.sourceObservationIds) || item.sourceObservationIds.length === 0));
  if (missingEvidenceItems.length > 0) {
    const itemNoun = missingEvidenceItems.length === 1 ? 'member choice still needs' : 'member choices still need';
    blocks.push({
      id: 'member_items_require_evidence_pointer',
      severity: 'block',
      detail: `${missingEvidenceItems.length} ${itemNoun} a visible evidence clue.`
    });
  }
  const blockingRuleRoles = new Set([
    'discount',
    'discount_rate',
    'discount_amount',
    'tax_and_fee',
    'tax_rate',
    'tax_fixed_fee',
    'service_rate',
    'service_fixed_fee',
    'shared_fixed_fee',
    'deposit',
    'prepayment_down',
    'aggregate_subtotal',
    'aggregate_grand_total'
  ]);
  const unreviewedRules = rules.filter((rule) => {
    const status = normalizeParserCandidateStatus(rule.status);
    return (rule.reviewRequired || status === 'pending') && blockingRuleRoles.has(normalizePriceRole(rule.priceRole || rule.ruleType, rule, room?.taskRouter?.taskType));
  });
  if (unreviewedRules.length > 0) {
    const noteNoun = unreviewedRules.length === 1 ? 'fee, total, discount, or threshold note needs' : 'fee, total, discount, or threshold notes need';
    blocks.push({
      id: 'unreviewed_rules_block_member_open',
      severity: 'block',
      detail: `${unreviewedRules.length} ${noteNoun} host review.`
    });
  }
  const blockedReviewGateItems = selectableItems.filter((item) => {
    return normalizeReviewGates(item.reviewGates).some((gate) => gate.severity === 'block');
  });
  if (blockedReviewGateItems.length > 0) {
    const itemNoun = blockedReviewGateItems.length === 1 ? 'member item needs' : 'member items need';
    blocks.push({
      id: 'review_gate_blocks_member_open',
      severity: 'block',
      detail: `${blockedReviewGateItems.length} ${itemNoun} edit or removal before opening.`
    });
  }
  return blocks.concat(getStructuralReviewBlocks(room));
}

function recordReviewDecision(room, input = {}) {
  const decisions = Array.isArray(room.reviewDecisions) ? room.reviewDecisions : [];
  const decision = {
    id: `decision_${randomUUID().slice(0, 8)}`,
    roomId: room.id,
    candidateId: input.candidateId || null,
    action: input.action || 'accept',
    previousPayload: input.previousPayload || null,
    nextPayload: input.nextPayload || null,
    reviewerId: input.reviewerId || null,
    reason: normalizeShortText(input.reason || '', 160),
    createdAt: nowIso()
  };
  room.reviewDecisions = [decision, ...decisions].slice(0, 200);
  return decision;
}

function acceptPendingParserCandidates(room, reviewerId, reason = 'host accepted evidence review draft') {
  const now = nowIso();
  let acceptedCount = 0;
  room.parserCandidates = (Array.isArray(room.parserCandidates) ? room.parserCandidates : []).map((candidate) => {
    if (normalizeParserCandidateStatus(candidate.status) !== 'pending') {
      return candidate;
    }
    acceptedCount += 1;
    const nextCandidate = {
      ...candidate,
      reviewGates: resolveReviewGatesAfterHostDecision(candidate.reviewGates, 'accept'),
      status: 'accepted',
      reviewedAt: now,
      reviewedBy: reviewerId
    };
    recordReviewDecision(room, {
      candidateId: candidate.id,
      action: 'accept',
      previousPayload: candidate,
      nextPayload: nextCandidate,
      reviewerId,
      reason
    });
    return nextCandidate;
  });
  room.calculationRules = buildCalculationRulesFromCandidates(room.parserCandidates);
  room.items = buildSelectableItemsFromCandidates(room.items, room.parserCandidates);
  return acceptedCount;
}

function getProposalVisualReviewModel(payload = {}) {
  const llmVisualReview = payload.llmVisualReview && typeof payload.llmVisualReview === 'object'
    ? payload.llmVisualReview
    : {};
  return normalizeBoundedText(
    llmVisualReview.model || payload.visualReviewModel || payload.localVision?.model || payload.localVisionModel || '',
    120
  );
}

function applyAcceptedVisualReviewProposal(room, proposal, reviewerId) {
  if (!shouldApplyStructuredDraftProposal(proposal)) {
    return 0;
  }

  const payload = proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {};
  const imageCount = Math.max(1, Array.isArray(room.menuImages) ? room.menuImages.length : 0);
  const structuredItems = normalizeParsedItems(payload.structuredItems, imageCount, payload.addonSection || null);
  if (structuredItems.length === 0) {
    return 0;
  }

  const localOcrText = normalizeLocalOcrText(payload.rawOcrPreview || '');
  const taskType = normalizeRoomTaskType(payload.taskType || room.taskRouter?.taskType || room.menuType || 'auto');
  const menuType = normalizeMenuType(payload.menuType || room.menuType, structuredItems);
  const previousPayload = {
    itemCount: Array.isArray(room.items) ? room.items.length : 0,
    parserCandidateCount: Array.isArray(room.parserCandidates) ? room.parserCandidates.length : 0,
    evidenceReviewSource: room.evidenceReviewSource || null,
    evidenceReviewModel: room.evidenceReviewModel || null,
    parseQualityStatus: room.parseQuality?.status || null
  };

  room.menuType = menuType;
  room.menuMode = 'auto';
  room.taskRouter = buildRoomTaskRouter({
    taskType,
    localOcrText,
    items: structuredItems
  });
  applyEvidenceReviewLayers(room, structuredItems, {
    images: room.menuImages,
    localOcrText,
    taskType,
    scenarioContractId: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
    evidenceKind: 'uploaded_image',
    sourceLabel: 'reviewed photo evidence',
    ocrSource: 'local_ocr'
  });
  room.parseQuality = evaluateMenuParseQuality({
    items: room.items,
    menuType: room.menuType,
    taskRouter: room.taskRouter,
    localOcr: room.localOcr,
    localOcrText
  });
  room.evidenceReviewSource = normalizeBoundedText(payload.sourceMode || 'local_ocr_plus_llm_visual_review', 80);
  room.evidenceReviewModel = getProposalVisualReviewModel(payload) || 'llm_visual_review';
  room.warnings = Array.from(new Set([
    ...(Array.isArray(payload.warnings) ? payload.warnings.map(String).filter(Boolean) : []),
    ...(Array.isArray(room.warnings) ? room.warnings.map(String).filter((warning) => {
      const localOcrWarningPattern = new RegExp(`Only local OCR ${'parser'}|Photo text was read, but the host should compare`, 'i');
      return !localOcrWarningPattern.test(warning);
    }) : [])
  ])).slice(0, 12);

  recordReviewDecision(room, {
    candidateId: proposal.id,
    action: 'accept',
    previousPayload,
    nextPayload: {
      appliedStructuredItemCount: structuredItems.length,
      evidenceReviewSource: room.evidenceReviewSource,
      evidenceReviewModel: room.evidenceReviewModel,
      parseQualityStatus: room.parseQuality?.status || null
    },
    reviewerId,
    reason: 'host accepted OCR plus LLM visual review draft'
  });

  return structuredItems.length;
}

function getStructuralReviewBlocks(room) {
  const candidates = Array.isArray(room?.parserCandidates) ? room.parserCandidates : [];
  return candidates
    .filter((candidate) => candidate.displaySurface === 'member_selectable' || candidate.proposedItemId)
    .map((candidate) => ({
      candidate,
      gates: getUnresolvedStructuralReviewGates(candidate)
    }))
    .filter((entry) => entry.gates.length > 0)
    .map((entry) => ({
      id: 'structural_review_gate_requires_edit_or_remove',
      severity: 'block',
      candidateId: entry.candidate.id || null,
      label: entry.candidate.label || entry.candidate.name || '',
      gateIds: entry.gates.map((gate) => gate.id),
      detail: `${entry.candidate.label || entry.candidate.name || 'Item'} needs host edit or removal before approval.`
    }));
}

function inferLocalOcrMenuType(items) {
  if (!items.length) {
    return 'general';
  }
  const drinkCount = items.filter((item) => item.supportsDrinkOptions || item.category === 'drink').length;
  const foodCount = items.length - drinkCount;
  if (drinkCount > 0 && foodCount > 0) {
    return 'mixed';
  }
  if (drinkCount >= Math.max(2, Math.ceil(items.length * 0.6))) {
    return 'drink';
  }
  return 'general';
}

function normalizeRoomTaskType(value) {
  const taskType = String(value || '').toLowerCase().trim();
  return roomTaskTypes.has(taskType) ? taskType : 'auto';
}

function inferTaskTypeFromSignals(text, items = []) {
  const normalizedRaw = String(text || '').toLowerCase().replace(/[_｜|/（）()]+/g, ' ');
  const itemText = items.map((item) => `${item.name || ''} ${item.category || ''} ${item.sectionName || ''} ${(item.tags || []).join(' ')}`).join(' ').toLowerCase();
  const combinedRaw = `${normalizedRaw} ${itemText}`;
  const combined = combinedRaw.replace(/\s+/g, '');

  if (/免運|滿額|滿[0-9]|團購|合購|批發/.test(combined)
    || /\b(?:volume|free shipping|group buy|bulk discount)\b/i.test(combinedRaw)) {
    return 'group_buy';
  }
  if (/ktv|唱歌|包廂|歡唱|低消|開瓶費/.test(combined)
    || /\broom\b/i.test(combinedRaw)) {
    return 'ktv_room';
  }
  if (/球場|場租|羽球|籃球|網球|桌球|保齡球|泳道|健身|運動|裁判|會議室|教室|工作室/.test(combined)
    || /\b(?:court|venue|sports|pitch|soccer|football|futsal|referee)\b/i.test(combinedRaw)) {
    return 'sports_venue';
  }
  if (/票券|門票|報名|活動|課程|展覽|體驗|演唱會|成人票|優惠票|團體票|餐券|票|券/.test(combined)
    || /\b(?:ticket|admission|workshop|class|activity)\b/i.test(combinedRaw)) {
    return 'ticket_activity';
  }
  if (/發票|收據|統一編號|統編|小計|總計|找零|刷卡|現金/.test(combined)
    || /\b(?:receipt|invoice|subtotal|grand total|change|paid)\b/i.test(combinedRaw)) {
    return 'parse_ocr_bill';
  }
  if (/服務費|營業稅|稅金|一成|外加/.test(combined)
    || /\b(?:service charge|tax|gratuity)\b/i.test(combinedRaw)) {
    return 'extract_fee_structure';
  }
  if (/折扣|折抵|優惠券|折價券|買一送一|滿千折百/.test(combined)
    || /\b(?:coupon|voucher|discount|promo)\b/i.test(combinedRaw)) {
    return 'parse_discount_policy';
  }
  if (/住宿|房型|入住|退房|加床|加人費|民宿|飯店/.test(combined)
    || /\b(?:lodging|hotel|check in|check-in|checkout|check out|extra person)\b/i.test(combinedRaw)) {
    return 'parse_lodging_rate';
  }
  if (/課程|體驗|手作|材料費|訂金|團報/.test(combined)
    || /\b(?:workshop|course|material fee|deposit)\b/i.test(combinedRaw)) {
    return 'parse_course_fee';
  }
  if (/拼車|交通|里程|夜間|過路費|停車費|包車/.test(combined)
    || /\b(?:rideshare|transport|mileage|toll|parking)\b/i.test(combinedRaw)) {
    return 'parse_transport_share';
  }
  if (/儲值|點數|會員卡|送點|扣點/.test(combined)
    || /\b(?:stored value|points|membership|bonus)\b/i.test(combinedRaw)) {
    return 'parse_membership_value';
  }
  const drinkCount = items.filter((item) => item.supportsDrinkOptions || item.category === 'drink').length;
  if (drinkCount >= Math.max(2, Math.ceil(items.length * 0.6)) || /飲料|飲品|手搖|咖啡|茶飲/.test(normalizedRaw.replace(/\s+/g, '')) || /\bdrink\b/i.test(normalizedRaw)) {
    return 'drink_order';
  }
  if (/租借|器材|球拍|鞋|裝備|麥克風|押金/.test(combined)
    || /\b(?:rental|equipment)\b/i.test(combinedRaw)) {
    return 'rental_share';
  }
  if (/餐廳|菜單|便當|飯|麵|火鍋|主餐|小菜/.test(combined)
    || /\b(?:restaurant|menu|meal|steak|chicken|beef|pork|rice|noodle|soup|stew)\b/i.test(combinedRaw)) {
    return 'restaurant_split';
  }
  return 'generic_split';
}

function buildRoomTaskRouter(input = {}) {
  const localOcrText = normalizeLocalOcrText(input.localOcrText);
  const items = Array.isArray(input.items) ? input.items : [];
  const selectedTaskType = normalizeRoomTaskType(input.taskType);
  const inferredTaskType = inferTaskTypeFromSignals(localOcrText, items);
  const taskType = selectedTaskType === 'auto' ? inferredTaskType : selectedTaskType;
  const hasTaskConflict = selectedTaskType !== 'auto'
    && inferredTaskType !== 'generic_split'
    && inferredTaskType !== selectedTaskType;
  let confidenceScore = selectedTaskType === 'auto' ? 0.5 : 0.76;
  if (items.length >= 3) confidenceScore += 0.1;
  if (localOcrText.length >= 20) confidenceScore += 0.06;
  if (hasTaskConflict) {
    confidenceScore -= 0.24;
  }
  confidenceScore = Math.max(0.28, Math.min(0.94, Number(confidenceScore.toFixed(2))));
  const lowConfidence = confidenceScore < 0.58 || hasTaskConflict;

  const config = {
    group_buy: {
      thresholdKind: 'free_shipping_or_volume_discount',
      splitMode: 'individual_items_plus_shared_shipping',
      evidenceStrength: 'medium'
    },
    drink_order: {
      thresholdKind: 'minimum_order',
      splitMode: 'individual_items',
      evidenceStrength: 'medium'
    },
    restaurant_split: {
      thresholdKind: 'minimum_consume_or_service_fee',
      splitMode: 'individual_items_or_average_split',
      evidenceStrength: 'medium'
    },
    ktv_room: {
      thresholdKind: 'venue_minimum_or_hourly_rate',
      splitMode: 'shared_room_fee_plus_individual_items',
      evidenceStrength: 'high'
    },
    sports_venue: {
      thresholdKind: 'venue_minimum_or_hourly_rate',
      splitMode: 'shared_venue_fee_plus_rentals',
      evidenceStrength: 'high'
    },
    ticket_activity: {
      thresholdKind: 'minimum_participants_or_per_person_fee',
      splitMode: 'per_person_items',
      evidenceStrength: 'high'
    },
    rental_share: {
      thresholdKind: 'deposit_or_time_rate',
      splitMode: 'shared_rental_or_per_person_items',
      evidenceStrength: 'high'
    },
    extract_fee_structure: {
      thresholdKind: 'service_tax_or_surcharge',
      splitMode: 'shared_fee_or_order_adjustment',
      evidenceStrength: 'high'
    },
    parse_discount_policy: {
      thresholdKind: 'promotion_or_discount_threshold',
      splitMode: 'order_level_adjustment',
      evidenceStrength: 'high'
    },
    parse_ocr_bill: {
      thresholdKind: 'receipt_subtotal_or_total',
      splitMode: 'receipt_line_items_plus_shared_adjustments',
      evidenceStrength: 'high'
    },
    parse_lodging_rate: {
      thresholdKind: 'room_rate_or_extra_person_fee',
      splitMode: 'shared_lodging_fee_plus_personal_addons',
      evidenceStrength: 'high'
    },
    parse_course_fee: {
      thresholdKind: 'course_fee_or_deposit',
      splitMode: 'per_person_items_plus_shared_materials',
      evidenceStrength: 'high'
    },
    parse_transport_share: {
      thresholdKind: 'fare_distance_or_surcharge',
      splitMode: 'shared_transport_fee_plus_tolls',
      evidenceStrength: 'medium'
    },
    parse_membership_value: {
      thresholdKind: 'stored_value_or_points_policy',
      splitMode: 'cash_items_with_points_review',
      evidenceStrength: 'medium'
    },
    generic_split: {
      thresholdKind: 'custom',
      splitMode: 'individual_items_or_average_split',
      evidenceStrength: 'medium'
    }
  }[taskType] || {
    thresholdKind: 'custom',
    splitMode: 'individual_items_or_average_split',
    evidenceStrength: 'medium'
  };

  return {
    taskType,
    confidenceScore,
    confidenceReason: selectedTaskType === 'auto'
      ? `依 OCR 與品項訊號判別為 ${taskType}。`
      : hasTaskConflict
        ? `使用者選擇 ${selectedTaskType}，但 OCR 訊號接近 ${inferredTaskType}，需人工確認。`
        : `依使用者選擇鎖定為 ${taskType}。`,
    inferredTaskType,
    selectedTaskType,
    hasTaskConflict,
    conflictTaskType: hasTaskConflict ? inferredTaskType : null,
    riskPolicy: lowConfidence || ['ktv_room', 'sports_venue', 'ticket_activity', 'rental_share'].includes(taskType) ? 'conservative' : 'normal',
    reviewStatus: lowConfidence ? 'needs_human_review' : 'dry_run_generated',
    fixedTaxonomyVersion: 'acmcp-task-router.v1',
    ...config
  };
}

function buildTaskRouterContract(room) {
  const taskRouter = room?.taskRouter && typeof room.taskRouter === 'object'
    ? room.taskRouter
    : { ...defaultTaskRouter };
  return {
    contractVersion: taskRouterContractVersion,
    fixedTaxonomyVersion: taskRouter.fixedTaxonomyVersion || defaultTaskRouter.fixedTaxonomyVersion,
    supportedTaskTypes: Array.from(roomTaskTypes),
    selectedTaskType: taskRouter.selectedTaskType || taskRouter.taskType || defaultTaskRouter.taskType,
    inferredTaskType: taskRouter.inferredTaskType || taskRouter.taskType || defaultTaskRouter.taskType,
    taskType: taskRouter.taskType || defaultTaskRouter.taskType,
    confidenceScore: Number(taskRouter.confidenceScore || 0),
    confidenceReason: taskRouter.confidenceReason || '',
    reviewStatus: taskRouter.reviewStatus || defaultTaskRouter.reviewStatus,
    riskPolicy: taskRouter.riskPolicy || defaultTaskRouter.riskPolicy,
    thresholdKind: taskRouter.thresholdKind || defaultTaskRouter.thresholdKind,
    splitMode: taskRouter.splitMode || defaultTaskRouter.splitMode,
    evidenceStrength: taskRouter.evidenceStrength || defaultTaskRouter.evidenceStrength,
    hasTaskConflict: Boolean(taskRouter.hasTaskConflict),
    conflictTaskType: taskRouter.conflictTaskType || null,
    lockedByUser: Boolean(taskRouter.selectedTaskType && taskRouter.selectedTaskType !== 'auto'),
    aiRepairAllowed: taskRouter.reviewStatus === 'needs_human_review' || Boolean(taskRouter.hasTaskConflict),
    aiRepairScope: 'ocr_schema_repair_only',
    forbiddenAiActions: [
      'change_task_module',
      'calculate_money',
      'assign_claimant',
      'finalize_settlement',
      'arbitrate_dispute'
    ]
  };
}

function buildEvidenceContract(room) {
  const parseQuality = room?.parseQuality && typeof room.parseQuality === 'object' ? room.parseQuality : null;
  const localOcr = room?.localOcr && typeof room.localOcr === 'object'
    ? room.localOcr
    : {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0
    };
  return {
    contractVersion: evidenceContractVersion,
    evidenceLine: 'price_evidence_ocr',
    localFirst: localOcrFirst,
    localOcr: {
      enabled: Boolean(localOcr.enabled),
      maxChars: localOcrMaxChars,
      minItems: localOcrMinItems,
      lineCount: Number(localOcr.lineCount || 0),
      candidateCount: Number(localOcr.candidateCount || 0),
      itemCount: Number(localOcr.itemCount || 0),
      ruleLineCount: Number(localOcr.ruleLineCount || 0),
      ruleTypes: Array.isArray(localOcr.ruleHints)
        ? Array.from(new Set(localOcr.ruleHints.map((hint) => hint?.type).filter(Boolean))).slice(0, 8)
        : []
    },
    imageInput: {
      requiredForUpload: true,
      maxImageMb,
      maxImageBytes,
      maxImagesPerUpload: 1,
      processedMaxDimension: imageMaxDimension,
      ocrTargetDimension: imageOcrTargetDimension,
      processedJpegQuality: imageJpegQuality,
      storedAsProcessedEvidenceImage: true
    },
    adaptivePipeline: {
      featureParser: true,
      promptBuilder: true,
      ...buildAdaptivePipelineMetadata()
    },
    acceptedEvidenceSources: [
      'user_uploaded_price_photo',
      'user_uploaded_receipt_photo',
      'user_uploaded_checkout_screenshot',
      'public_price_board_screenshot',
      'public_activity_post_screenshot',
      'user_provided_local_ocr_text'
    ],
    forbiddenEvidenceSources: [
      'fake_account_scraping',
      'vendor_api_reverse_engineering',
      'cookies_or_authenticated_vendor_session',
      'payment_account_data',
      'raw_device_fingerprint',
      'social_account_identifier'
    ],
    deterministicParser: {
      parserVersion: 'local-ocr-price-parser.v2',
      pricePattern: 'local OCR text-block and table-aware NTD integer candidates',
      sectionPattern: 'known menu/activity/venue/rental section labels',
      maxCandidateItems: 120,
      outputFields: [
        'name',
        'price',
        'priceRole',
        'sourceNumberClass',
        'currency',
        'quantity',
        'unit',
        'conditions',
        'reviewFlags',
        'rawTextEvidence',
        'confidence',
        'category',
        'sectionName',
        'sizeLabel',
        'supportsDrinkOptions',
        'optionGroups',
        'tags',
        'note'
      ]
    },
    qualityGate: {
      status: parseQuality?.status || 'not_evaluated',
      issueCount: Number(parseQuality?.issueCount || 0),
      highIssueCount: Number(parseQuality?.highIssueCount || 0),
      mediumIssueCount: Number(parseQuality?.mediumIssueCount || 0),
      taskConflict: Boolean(parseQuality?.taskConflict),
      issueTypes: Array.isArray(parseQuality?.issues)
        ? parseQuality.issues.map((issue) => issue.type).filter(Boolean)
        : [],
      highIssueTypes: Array.isArray(parseQuality?.issues)
        ? parseQuality.issues.filter((issue) => issue.severity === 'high').map((issue) => issue.type).filter(Boolean)
        : []
    },
    reviewProvenance: {
      source: room?.evidenceReviewSource || null,
      model: room?.evidenceReviewModel || null,
      memberReleaseBlocked: Boolean(getEvidenceReviewReleaseBlock(room)),
      blockingReason: getEvidenceReviewReleaseBlock(room)?.id || null
    },
    aiRepairGate: {
      allowedOnlyWhenLocalInsufficient: true,
      allowedReasons: [
        'too_few_items',
        'high_risk_quality_issue',
        'task_conflict',
        'ambiguous_multi_column_table',
        'ocr_schema_misalignment'
      ],
      repairScope: 'ocr_schema_repair_only',
      forbiddenAiActions: [
        'change_task_module',
        'calculate_money',
        'assign_claimant',
        'finalize_settlement',
        'claim_evidence_is_true'
      ]
    },
    privacyBoundary: {
      sendToGoogleSheets: false,
      storeRawOcrInSheets: false,
      storePaymentData: false,
      useFakeAccount: false,
      retainOriginalUpload: false
    }
  };
}

function parseLocalOcrMenuCandidates(localOcrText, imageCount = 1, options = {}) {
  const lines = splitLocalOcrLines(localOcrText);
  const rawItems = [];
  const ruleHints = [];
  let currentSection = '';
  let tableColumnLabels = [];
  const selectedTaskType = normalizeRoomTaskType(options.taskType);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const nextLine = lines[lineIndex + 1] || '';
    if (localOcrSkipLinePattern.test(line) || localOcrPaymentLinePattern.test(line)) {
      continue;
    }
    const ruleHint = classifyLocalOcrRuleLine(line);
    if (ruleHint) {
      ruleHints.push(ruleHint);
      continue;
    }
    if (localOcrItineraryHeadingPattern.test(line)) {
      currentSection = cleanLocalOcrName(line).slice(0, 24);
      continue;
    }
    const detectedTableColumnLabels = extractLocalOcrTableColumnLabels(line);
    if (detectedTableColumnLabels.length >= 2) {
      tableColumnLabels = detectedTableColumnLabels;
      currentSection = cleanLocalOcrName(detectedTableColumnLabels.join(' / ')).slice(0, 24);
      continue;
    }
    if (isLikelyLocalOcrSection(line) || isLikelyLocalOcrDynamicSection(line, nextLine)) {
      currentSection = line.replace(/\s+/g, '').slice(0, 24);
      continue;
    }

    const priceMatches = extractLocalOcrPriceMatches(line);
    if (priceMatches.length === 0) {
      continue;
    }

    const priceCandidates = getLocalOcrPriceCandidates(line, priceMatches);
    const selectedPrice = selectLocalOcrPriceMatch(line, priceCandidates);
    const firstPrice = priceCandidates[0];
    const nameBoundary = selectedPrice && selectedPrice.index > firstPrice.index ? selectedPrice.index : firstPrice.index;
    let name = cleanLocalOcrName(line.slice(0, nameBoundary)
      .replace(/\b[0-9]{1,3}\s*(?:cups?|qty|quantity|count|pcs?|pieces?|orders?|sets?|boxes?|packs?|items?|hour|hours|hr|hrs|pax|person|people|players?|attendees?|tickets?|day|days)\b/gi, '')
      .replace(/[0-9]{1,3}\s*(?:小時|鐘|人|位|堂|次|分鐘|分|杯|瓶|份|件|個|張|名|組|盒|包|套|桶)/g, ''));
    if (!name || name.length < 2 || shouldDropNonMenuPriceName(name) || addonOnlyItemPattern.test(name)) {
      continue;
    }

    const supportsDrinkOptions = inferDrinkItem(name);
    const category = selectedTaskType === 'ticket_activity'
      ? 'ticket'
      : normalizeMenuCategory('', `${currentSection} ${name}`, supportsDrinkOptions);
    const optionGroups = [];
    if (shouldTreatLocalOcrLineAsMultiColumnPriceRow(selectedTaskType, name, priceCandidates)) {
      rawItems.push(...buildLocalOcrMultiColumnItems(line, priceCandidates, tableColumnLabels, currentSection, selectedTaskType, imageCount));
      continue;
    }
    if (priceCandidates.length >= 2 && supportsDrinkOptions) {
      name = stripDrinkSizeFromName(name);
      const basePrice = firstPrice.price;
      const labels = ['小杯', '中杯', '大杯', '瓶裝'];
      optionGroups.push({
        label: '大小',
        type: 'size',
        selectionType: 'single',
        options: priceCandidates.slice(0, 4).map((priceMatch, index) => ({
          label: labels[index] || `規格 ${index + 1}`,
          priceDelta: Math.max(0, priceMatch.price - basePrice)
        }))
      });
    }

    rawItems.push({
      name,
      price: selectedPrice.price,
      priceRole: normalizePriceRole('', { name, sectionName: currentSection }, selectedTaskType),
      sourceNumberClass: normalizeSourceNumberClass('', { name, sectionName: currentSection }),
      currency: 'TWD',
      quantity: 1,
      unit: inferUnitFromText(line),
      rawTextEvidence: normalizeShortText(line, 220),
      confidence: priceCandidates.length >= 2 ? 0.78 : 0.9,
      supportsDrinkOptions,
      sourceImageIndex: Math.min(1, imageCount),
      category,
      sectionName: currentSection,
      sizeLabel: '',
      temperature: normalizeTemperature('', `${currentSection} ${name}`, supportsDrinkOptions),
      spiceLevel: normalizeSpiceLevel('', name),
      dietaryFlags: [],
      tags: priceCandidates.length >= 2 ? ['manual_review'] : [],
      conditions: normalizeConditions([], line),
      reviewFlags: priceCandidates.length >= 2 ? ['multiple_price_candidates'] : [],
      note: priceCandidates.length >= 2 ? 'This row has several prices. Please check the size or option.' : '',
      optionGroups
    });
  }

  const items = normalizeParsedItems(rawItems, imageCount, null);
  return {
    items,
    menuType: inferLocalOcrMenuType(items),
    metrics: {
      enabled: Boolean(normalizeLocalOcrText(localOcrText)),
      lineCount: lines.length,
      candidateCount: rawItems.length,
      itemCount: items.length,
      ruleLineCount: ruleHints.length,
      ruleHints: ruleHints.slice(0, 12)
    }
  };
}

function normalizeNameForQuality(name) {
  let text = String(name || '').toLowerCase();
  text = text.replace(/[（(].*?[）)]/g, '');
  text = text
    .replace(/特大杯|小杯|中杯|大杯|分享瓶|瓶裝|加大|小瓶|中瓶|大瓶|熱|冰/gi, '')
    .replace(/\b(extra\s*large|x-large|xl|large|medium|med|regular|reg|small|short|s|m|l)\b/gi, '');
  return text.replace(/\s+/g, '').trim();
}

function shouldApplyDrinkSizeQualityGate(menuType, taskType, group) {
  if (menuType === 'drink' || taskType === 'drink_order') {
    return true;
  }
  return group.some((item) => item.supportsDrinkOptions || String(item.category || '') === 'drink');
}

function hasBlockingQualityObject(parseQuality) {
  return Boolean(parseQuality && (parseQuality.status === 'review_required' || Number(parseQuality.highIssueCount || 0) > 0));
}

function hasBlockingParseQuality(room) {
  const parseQuality = room?.parseQuality && typeof room.parseQuality === 'object' ? room.parseQuality : null;
  return hasBlockingQualityObject(parseQuality);
}

function stripLocalOcrOnlyReviewBlock(parseQuality) {
  const quality = parseQuality && typeof parseQuality === 'object' ? parseQuality : {};
  const issues = (Array.isArray(quality.issues) ? quality.issues : [])
    .filter((issue) => issue?.type !== localOcrOnlyReviewIssueId);
  const blockingReasons = (Array.isArray(quality.blockingReasons) ? quality.blockingReasons : [])
    .filter((reason) => reason !== localOcrOnlyReviewIssueId);
  const highIssueCount = issues.filter((issue) => issue?.severity === 'high').length;
  const mediumIssueCount = issues.filter((issue) => issue?.severity === 'medium').length;
  return {
    ...quality,
    issues,
    blockingReasons,
    issueCount: issues.length,
    highIssueCount,
    mediumIssueCount,
    requiresHostReview: highIssueCount > 0 || mediumIssueCount > 0 || blockingReasons.length > 0,
    status: highIssueCount > 0 || blockingReasons.length > 0
      ? 'review_required'
      : mediumIssueCount > 0
        ? 'warning'
        : 'ok'
  };
}

function hasOnlyLocalOcrOnlyReviewBlock(room) {
  const parseQuality = room?.parseQuality && typeof room.parseQuality === 'object' ? room.parseQuality : null;
  if (room?.evidenceReviewSource === 'local_ocr_fallback') {
    return !hasBlockingQualityObject(stripLocalOcrOnlyReviewBlock(parseQuality));
  }
  if (!hasBlockingQualityObject(parseQuality)) {
    return false;
  }
  return !hasBlockingQualityObject(stripLocalOcrOnlyReviewBlock(parseQuality));
}

function getEvidenceReviewReleaseBlock(room) {
  const parseQuality = room?.parseQuality && typeof room.parseQuality === 'object' ? room.parseQuality : null;
  const issues = Array.isArray(parseQuality?.issues) ? parseQuality.issues : [];
  const blockingReasons = Array.isArray(parseQuality?.blockingReasons) ? parseQuality.blockingReasons : [];
  if (
    room?.evidenceReviewSource === 'local_ocr_fallback'
    || issues.some((issue) => issue?.type === localOcrOnlyReviewIssueId)
    || blockingReasons.includes(localOcrOnlyReviewIssueId)
  ) {
    return {
      id: localOcrOnlyReviewIssueId,
      severity: 'high',
      message: 'This photo was read as text only and still needs visual review before members can use it.'
    };
  }
  return null;
}

function evaluateMenuParseQuality(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const menuType = normalizeMenuType(input?.menuType, items);
  const taskRouter = input?.taskRouter && typeof input.taskRouter === 'object' ? input.taskRouter : null;
  const taskType = String(taskRouter?.taskType || '');
  const featureProfile = buildExtractionFeatureProfile({
    localOcrText: input?.localOcrText || '',
    taskType,
    taskRouter
  });
  const issues = [];
  const exactNames = new Map();
  const baseNames = new Map();
  const categoryCounts = {};
  let manualReviewCount = 0;
  let optionGroupCount = 0;
  let drinkCount = 0;

  if (taskRouter?.hasTaskConflict) {
    issues.push({
      type: 'task_conflict',
      severity: 'high',
      detail: `The selected room type is ${taskRouter.selectedTaskType || taskRouter.taskType || 'unknown'}, but the evidence looks closer to ${taskRouter.conflictTaskType || taskRouter.inferredTaskType || 'unknown'}. Please check before settling.`
    });
  }

  if (items.length < 3) {
    issues.push({
      type: 'too_few_items',
      severity: 'high',
      detail: `只解析到 ${items.length} 個品項，可能需要重新拍照或補 OCR 文字。`
    });
  }
  if (items.length > 120) {
    issues.push({
      type: 'too_many_items',
      severity: 'medium',
      detail: `解析到 ${items.length} 個品項，可能把說明文字或營養資訊也當成品項。`
    });
  }

  for (const item of items) {
    const name = String(item.name || '').trim();
    const price = Number(item.price);
    const category = String(item.category || 'other');
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (item.supportsDrinkOptions || category === 'drink') {
      drinkCount += 1;
    }
    if (Array.isArray(item.tags) && item.tags.includes('manual_review')) {
      manualReviewCount += 1;
    }
    optionGroupCount += Array.isArray(item.optionGroups) ? item.optionGroups.length : 0;

    const exact = exactNames.get(name) || new Set();
    exact.add(price);
    exactNames.set(name, exact);

    const base = normalizeNameForQuality(name);
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
        detail: '疑似把營養資訊、說明或非費用文字當成項目。'
      });
    }
    if (suspiciousAddon.test(name)) {
      issues.push({
        type: 'addon_as_item',
        severity: 'medium',
        item: name,
        detail: '疑似把加料或升級選項當成獨立品項。'
      });
    }
    if ((menuType === 'drink' || item.supportsDrinkOptions) && price > 220) {
      issues.push({
        type: 'drink_price_outlier',
        severity: 'medium',
        item: name,
        detail: '飲料單價偏高，可能讀到熱量、容量或其他欄位。'
      });
    }

    for (const group of Array.isArray(item.optionGroups) ? item.optionGroups : []) {
      if (group?.type === 'addon' && group.selectionType !== 'multiple') {
        issues.push({
          type: 'addon_not_multiple',
          severity: 'high',
          item: name,
          detail: '加料群組必須允許多選，否則無法同時點多種配料。'
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
        detail: 'The same item name has several prices. Please split it by size or option before approving.'
      });
    }
  }

  for (const [base, group] of baseNames.entries()) {
    const prices = Array.from(new Set(group.map((item) => Number(item.price)))).sort((a, b) => a - b);
    const names = Array.from(new Set(group.map((item) => String(item.name || '').trim())));
    if (shouldApplyDrinkSizeQualityGate(menuType, taskType, group) && group.length > 1 && prices.length > 1 && names.some((name) => !hasDrinkSizeMarker(name))) {
      issues.push({
        type: 'size_variant_missing_marker',
        severity: 'high',
        item: base,
        detail: '疑似大小杯或規格價差，但部分名稱沒有標明規格。'
      });
    }
  }

  const otherCount = categoryCounts.other || 0;
  if (items.length >= 5 && taskType !== 'group_buy' && otherCount / items.length > 0.7) {
    issues.push({
      type: 'category_too_unknown',
      severity: 'medium',
      detail: '多數品項仍是其他類別，分類欄位需要人工檢查。'
    });
  }
  if ((menuType === 'drink' || drinkCount >= 3) && optionGroupCount === 0) {
    issues.push({
      type: 'drink_without_size_or_addon_options',
      severity: 'medium',
      detail: '飲料品項沒有任何尺寸或加料選項，可能漏掉右側欄位或全域加料區。'
    });
  }

  const arithmeticCheck = runArithmeticInvariantCheck(items, input?.localOcrText || '');
  if (arithmeticCheck.reviewFlags.includes('arithmetic_mismatch')) {
    issues.push({
      type: 'arithmetic_mismatch',
      severity: 'high',
      detail: arithmeticCheck.logs.find((line) => line.includes('不符')) || '細項合計與單據總額不符。'
    });
  }
  if (arithmeticCheck.reviewFlags.includes('deposit_detected')) {
    issues.push({
      type: 'deposit_detected',
      severity: 'medium',
      detail: '偵測到押金或保證金，請確認是否應排除一般分攤。'
    });
  }

  const highIssues = issues.filter((issue) => issue.severity === 'high').length;
  const mediumIssues = issues.filter((issue) => issue.severity === 'medium').length;
  const status = highIssues > 0 ? 'review_required' : mediumIssues > 0 ? 'warn' : 'pass';
  const adaptiveConfidence = scoreAdaptiveParseQuality({
    items,
    issues,
    menuType,
    taskType,
    taskRouter,
    localOcr: input?.localOcr || null,
    localOcrText: input?.localOcrText || '',
    featureProfile
  });

  return {
    status,
    issueCount: issues.length,
    highIssueCount: highIssues,
    mediumIssueCount: mediumIssues,
    manualReviewCount,
    optionGroupCount,
    drinkCount,
    categoryCounts,
    taskConflict: Boolean(taskRouter?.hasTaskConflict),
    arithmeticCheck,
    adaptiveConfidence,
    blockingReasons: adaptiveConfidence.blockingReasons,
    issues: issues.slice(0, 20)
  };
}

function hasDrinkSizeMarker(name) {
  const text = String(name || '');
  return Boolean(detectDrinkSize(text)) || drinkSizePattern.test(text) || standaloneBottlePattern.test(text);
}

function hasLargeDrinkSizeMarker(name) {
  const text = String(name || '');
  const size = detectDrinkSize(text);
  if (size) {
    return size.rank >= 3;
  }
  return largeDrinkSizePattern.test(text) || standaloneBottlePattern.test(text);
}

function normalizeDrinkBaseName(name) {
  return String(name || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/特大杯|小杯|中杯|大杯|分享瓶|瓶裝|加大|小瓶|中瓶|大瓶/gi, '')
    .replace(standaloneBottlePattern, ' ')
    .replace(/\b(extra\s*large|x-large|xl|large|medium|med|regular|reg|small|short|s|m|l)\b/gi, '')
    .replace(/\s+/g, '')
    .trim();
}

function detectDrinkSize(name) {
  const text = String(name || '');
  if (/特大杯|\b(?:extra\s*large|x-large|xl)\b/i.test(text)) {
    return { id: 'xlarge', label: '特大杯', rank: 4 };
  }
  if (/分享瓶/.test(text)) {
    return { id: 'share_bottle', label: '分享瓶', rank: 5 };
  }
  if (/瓶裝|大瓶/.test(text)) {
    return { id: 'bottle', label: '瓶裝', rank: 5 };
  }
  if (/大杯|加大|\b(?:large|l)\b/i.test(text)) {
    return { id: 'large', label: '大杯', rank: 3 };
  }
  if (/中杯|中瓶|\b(?:medium|med|regular|reg|m)\b/i.test(text)) {
    return { id: 'medium', label: '中杯', rank: 2 };
  }
  if (/小杯|小瓶|\b(?:small|short|s)\b/i.test(text)) {
    return { id: 'small', label: '小杯', rank: 1 };
  }
  if (standaloneBottlePattern.test(text)) {
    return { id: 'bottle', label: '瓶', rank: 5 };
  }
  return null;
}

function stripDrinkSizeFromName(name) {
  const stripped = String(name || '')
    .replace(/[（(]\s*(?:特大杯|小杯|中杯|大杯|分享瓶|瓶裝|加大|小瓶|中瓶|大瓶|extra\s*large|x-large|xl|large|medium|med|regular|reg|small|short|s|m|l)\s*[）)]/gi, '')
    .replace(/特大杯|小杯|中杯|大杯|分享瓶|瓶裝|加大|小瓶|中瓶|大瓶/gi, '')
    .replace(standaloneBottlePattern, ' ')
    .replace(/\b(extra\s*large|x-large|xl|large|medium|med|regular|reg|small|short|s|m|l)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-_/｜|]+\s*$/g, '')
    .trim();
  return stripped || String(name || '').replace(/\s+/g, ' ').trim();
}

function isSizeOptionGroup(group) {
  const type = String(group?.type || '').toLowerCase().trim();
  const label = String(group?.label || '').replace(/\s+/g, '').trim();
  return type === 'size' || /^(大小|尺寸|杯型|容量|Size|size)$/i.test(label);
}

function normalizeOptionId(label, fallback) {
  const ascii = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || fallback;
}

function normalizeOptionSelectionType(value, type) {
  const raw = String(value || '').toLowerCase().trim();
  if (optionSelectionTypes.has(raw)) {
    return raw;
  }
  return type === 'addon' ? 'multiple' : 'single';
}

function normalizeItemOptionGroups(rawGroups) {
  const normalizedGroups = [];
  const groups = Array.isArray(rawGroups) ? rawGroups : [];

  for (const rawGroup of groups.slice(0, 4)) {
    const label = String(rawGroup?.label || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!label || isNonMenuMetadataLabel(label)) {
      continue;
    }

    const rawType = String(rawGroup?.type || '').toLowerCase().trim();
    const type = optionGroupTypes.has(rawType) ? rawType : 'custom';
    const selectionType = normalizeOptionSelectionType(rawGroup?.selectionType, type);
    const options = [];
    const seenLabels = new Set();

    for (const rawOption of Array.isArray(rawGroup?.options) ? rawGroup.options.slice(0, 10) : []) {
      const optionLabel = String(rawOption?.label || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      const priceDelta = Number(rawOption?.priceDelta ?? rawOption?.additional_price ?? rawOption?.price);
      if (!optionLabel || isNonMenuMetadataLabel(optionLabel) || !Number.isInteger(priceDelta) || priceDelta < 0 || priceDelta > 5000) {
        continue;
      }
      if (selectionType === 'multiple' && noAddonOptionPattern.test(optionLabel)) {
        continue;
      }
      const labelKey = optionLabel.replace(/\s+/g, '');
      if (seenLabels.has(labelKey)) {
        continue;
      }
      seenLabels.add(labelKey);
      options.push({
        id: normalizeOptionId(optionLabel, `option_${options.length + 1}`),
        label: optionLabel,
        priceDelta
      });
    }

    if (type === 'addon' && selectionType === 'single' && !options.some((option) => option.priceDelta === 0)) {
      options.unshift({
        id: 'none',
        label: '不加',
        priceDelta: 0
      });
    }

    if (selectionType === 'multiple' ? options.length < 1 : options.length < 2) {
      continue;
    }

    normalizedGroups.push({
      id: normalizeOptionId(label, `group_${normalizedGroups.length + 1}`),
      label,
      type,
      selectionType,
      options
    });
  }

  return normalizedGroups;
}

function normalizeMenuType(menuType, items) {
  const rawType = String(menuType || '').toLowerCase().trim();
  if (menuTypes.has(rawType)) {
    return rawType;
  }

  const drinkCount = items.filter((item) => item.supportsDrinkOptions).length;
  if (drinkCount === 0) {
    return 'general';
  }
  if (drinkCount === items.length) {
    return 'drink';
  }
  return 'mixed';
}

function normalizeMenuMode(menuMode) {
  const mode = String(menuMode || '').toLowerCase().trim();
  return menuModes.has(mode) ? mode : 'auto';
}

function itemUsesDrinkOptions(room, item) {
  const mode = normalizeMenuMode(room.menuMode);
  if (mode === 'drink') {
    return true;
  }
  if (mode === 'general') {
    return false;
  }
  return Boolean(item.supportsDrinkOptions) || room.menuType === 'drink';
}

function normalizeImageBox(imageBox) {
  if (!imageBox || typeof imageBox !== 'object') {
    return null;
  }

  const x = Number(imageBox.x);
  const y = Number(imageBox.y);
  const width = Number(imageBox.width);
  const height = Number(imageBox.height);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  const normalized = {
    x: Math.max(0, Math.min(999, Math.round(x))),
    y: Math.max(0, Math.min(999, Math.round(y))),
    width: Math.max(1, Math.min(1000, Math.round(width))),
    height: Math.max(1, Math.min(1000, Math.round(height)))
  };

  if (normalized.width < 25 || normalized.height < 25) {
    return null;
  }

  if (normalized.x + normalized.width > 1000) {
    normalized.width = 1000 - normalized.x;
  }
  if (normalized.y + normalized.height > 1000) {
    normalized.height = 1000 - normalized.y;
  }

  if (normalized.width < 25 || normalized.height < 25) {
    return null;
  }

  return normalized;
}

function normalizeEdgeAngle(edgeAngle) {
  const angle = Number(edgeAngle);
  if (!Number.isFinite(angle)) {
    return 0;
  }
  return Math.max(-30, Math.min(30, Math.round(angle)));
}

function buildFallbackImageBox(index, total) {
  const count = Math.max(1, total);
  const topPadding = 18;
  const usableHeight = 964;
  const rowHeight = Math.max(42, Math.floor(usableHeight / count));
  const y = Math.max(0, Math.min(940, topPadding + index * rowHeight));
  return {
    x: 18,
    y,
    width: 964,
    height: Math.max(42, Math.min(1000 - y, rowHeight))
  };
}

function boxContainsCenter(container, target) {
  if (!container || !target) {
    return false;
  }
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;
  return centerX >= container.x
    && centerX <= container.x + container.width
    && centerY >= container.y
    && centerY <= container.y + container.height;
}

function deriveImageBoxFromAnchor(imageBox, anchorBox) {
  if (!imageBox || !anchorBox || !boxContainsCenter(imageBox, anchorBox)) {
    return imageBox;
  }

  const imageBottom = imageBox.y + imageBox.height;
  const anchorBottom = anchorBox.y + anchorBox.height;
  const candidateY = Math.max(imageBox.y, Math.min(anchorBottom, imageBottom - 42));
  const candidateHeight = imageBottom - candidateY;

  if (candidateHeight < 42) {
    return imageBox;
  }

  return normalizeImageBox({
    x: imageBox.x,
    y: candidateY,
    width: imageBox.width,
    height: candidateHeight
  }) || imageBox;
}

function tightenImageBoxShape(imageBox) {
  if (!imageBox) {
    return null;
  }

  const ratio = imageBox.width / imageBox.height;
  if (ratio >= 0.72 && ratio <= 1.55) {
    return imageBox;
  }

  const centerX = imageBox.x + imageBox.width / 2;
  const centerY = imageBox.y + imageBox.height / 2;
  const targetRatio = ratio > 1.55 ? 1.35 : 0.9;
  let width = imageBox.width;
  let height = imageBox.height;

  if (ratio > targetRatio) {
    width = Math.max(42, Math.round(height * targetRatio));
  } else {
    height = Math.max(42, Math.round(width / targetRatio));
  }

  return normalizeImageBox({
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height
  }) || imageBox;
}

function normalizedBoxToPixelBox(box, imageWidth, imageHeight) {
  const normalized = normalizeImageBox(box);
  if (!normalized || !imageWidth || !imageHeight) {
    return null;
  }

  const left = Math.max(0, Math.min(imageWidth - 1, Math.floor((normalized.x / 1000) * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.floor((normalized.y / 1000) * imageHeight)));
  const right = Math.max(left + 1, Math.min(imageWidth, Math.ceil(((normalized.x + normalized.width) / 1000) * imageWidth)));
  const bottom = Math.max(top + 1, Math.min(imageHeight, Math.ceil(((normalized.y + normalized.height) / 1000) * imageHeight)));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
}

async function buildItemThumbnail(room, item) {
  if (!room.menuImageBuffer || !room.menuImageWidth || !room.menuImageHeight || !item?.hasImage || !item?.imageBox) {
    return null;
  }

  if (!room.itemImageCache) {
    room.itemImageCache = new Map();
  }

  const cacheKey = `${item.id}:${room.parsedAt || ''}:${itemThumbSize}`;
  const cached = room.itemImageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const crop = normalizedBoxToPixelBox(item.imageBox, room.menuImageWidth, room.menuImageHeight);
  if (!crop) {
    return null;
  }

  const output = await sharp(room.menuImageBuffer, {
    failOn: 'none'
  })
    .extract(crop)
    .resize({
      width: itemThumbSize,
      height: itemThumbSize,
      fit: 'cover',
      position: 'centre'
    })
    .jpeg({
      quality: 68,
      mozjpeg: true
    })
    .toBuffer();

  const thumbnail = {
    buffer: output,
    mimeType: 'image/jpeg'
  };
  room.itemImageCache.set(cacheKey, thumbnail);
  return thumbnail;
}

function normalizeSourceImageIndex(value, imageCount) {
  const count = Math.max(1, Math.min(2, Number(imageCount) || 1));
  const index = Number(value);
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.max(0, Math.min(count - 1, Math.round(index) - 1));
}

function normalizeAddonSectionGroup(addonSection) {
  if (!addonSection || typeof addonSection !== 'object') {
    return null;
  }

  const detected = Boolean(addonSection.detected);
  const options = Array.isArray(addonSection.options) ? addonSection.options : [];
  if (!detected && options.length === 0) {
    return null;
  }

  const label = String(addonSection.label || '加料').replace(/\s+/g, ' ').trim().slice(0, 24) || '加料';
  const normalized = normalizeItemOptionGroups([{
    label,
    type: 'addon',
    selectionType: 'multiple',
    options
  }]);

  return normalized[0] || null;
}

function hasUsableAddonGroup(rawGroups) {
  return Array.isArray(rawGroups) && rawGroups.some((group) => {
    const type = String(group?.type || '').toLowerCase().trim();
    const options = Array.isArray(group?.options) ? group.options : [];
    return type === 'addon' && options.length > 0;
  });
}

function appendGlobalAddonGroup(rawGroups, globalAddonGroup) {
  if (!globalAddonGroup) {
    return Array.isArray(rawGroups) ? rawGroups : [];
  }
  const groups = Array.isArray(rawGroups) ? rawGroups.slice(0, 3) : [];
  if (hasUsableAddonGroup(groups)) {
    return groups;
  }
  return groups.concat({
    label: globalAddonGroup.label,
    type: globalAddonGroup.type,
    selectionType: globalAddonGroup.selectionType,
    options: globalAddonGroup.options
  });
}

function normalizePriceRole(value, item = {}, taskType = '') {
  const explicit = String(value || '').trim();
  if (priceRoles.has(explicit)) {
    return explicit;
  }
  const text = `${item?.name || ''} ${item?.sectionName || ''} ${item?.note || ''} ${item?.rawTextEvidence || ''}`.toLowerCase();
  if (taskType === 'parse_transport_share' && /起步價|每公里|過路費|停車費|base\s*fare|per\s*km|toll|parking/i.test(text)) {
    return 'shared_fixed_fee';
  }
  if (/押金|保證金|deposit|security\s*deposit/.test(text)) {
    return 'deposit';
  }
  if (/訂金|預付|prepay|down\s*payment/.test(text)) {
    return 'prepayment_down';
  }
  if (/折扣|折抵|優惠券|折價券|discount|coupon|voucher/.test(text)) {
    return 'discount';
  }
  if (/服務費|清潔費|手續費|稅|\btax\b|service\s*(?:charge|fee)|cleaning\s*fee|\bfee\b/.test(text)) {
    return 'tax_and_fee';
  }
  if (/小計|subtotal/.test(text)) {
    return 'aggregate_subtotal';
  }
  if (/總計|合計|實付|grand\s*total|total/.test(text)) {
    return 'aggregate_grand_total';
  }
  if (taskType === 'extract_fee_structure' && /費$|fee$/.test(text)) {
    return 'tax_and_fee';
  }
  return 'line_item';
}

function normalizeSourceNumberClass(value, item = {}) {
  const explicit = String(value || '').trim();
  if (sourceNumberClasses.has(explicit)) {
    return explicit;
  }
  const text = `${item?.name || ''} ${item?.sectionName || ''} ${item?.note || ''}`;
  if (/%|折|percent|percentage/.test(text)) {
    return 'percentage_rate';
  }
  if (/點數|點|points?/.test(text)) {
    return 'points_value';
  }
  if (/公里|km|mile/.test(text)) {
    return 'distance';
  }
  if (/小時|分鐘|天|hour|hr|day/.test(text)) {
    return 'duration';
  }
  return 'currency_amount';
}

function inferUnitFromText(text) {
  const source = String(text || '');
  const match = source.match(/\/\s*(人|位|小時|晚|天|件|組|盒|包|公里|km|hour|hr|day|person|pax|night)/i);
  if (match) {
    return normalizeShortText(match[1], 24);
  }
  if (/每公里|\/\s*公里|per\s*km/i.test(source)) return '公里';
  if (/\/\s*人|每人|per\s*person|pax/i.test(source)) return '人';
  if (/\/\s*小時|每小時|per\s*hour/i.test(source)) return '小時';
  if (/\/\s*晚|每晚|per\s*night/i.test(source)) return '晚';
  return '';
}

function inferConditionsFromText(text) {
  const source = String(text || '');
  const conditions = [];
  const ageMatches = source.match(/[0-9]+\s*歲(?:～|~|-|至)?\s*(?:未滿\s*)?[0-9]+\s*歲(?:（含）)?|未滿\s*[0-9]+\s*歲/g) || [];
  for (const match of ageMatches.slice(0, 4)) {
    conditions.push({ type: 'age', label: normalizeShortText(match, 40) });
  }
  if (/會員/.test(source)) conditions.push({ type: 'membership', label: /非會員/.test(source) ? '非會員' : '會員' });
  if (/假日|weekend/i.test(source)) conditions.push({ type: 'day_type', label: '假日' });
  if (/平日|weekday/i.test(source)) conditions.push({ type: 'day_type', label: '平日' });
  if (/押金|保證金|deposit/i.test(source)) conditions.push({ type: 'payment_role', label: '押金' });
  if (/訂金|預付|down\s*payment/i.test(source)) conditions.push({ type: 'payment_role', label: '訂金' });
  return conditions.slice(0, 8);
}

function normalizeConditions(value, evidenceText) {
  const explicit = Array.isArray(value)
    ? value
      .map((condition) => {
        if (condition && typeof condition === 'object') {
          const type = normalizeShortText(condition.type, 32) || 'condition';
          const label = normalizeShortText(condition.label || condition.value || '', 80);
          return label ? { type, label } : null;
        }
        const label = normalizeShortText(condition, 80);
        return label ? { type: 'condition', label } : null;
      })
      .filter(Boolean)
    : [];
  const inferred = inferConditionsFromText(evidenceText);
  const seen = new Set();
  return explicit.concat(inferred).filter((condition) => {
    const key = `${condition.type}|${condition.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function normalizeConfidence(value, fallback = 0.86) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

function extractAggregateAmount(localOcrText, kind) {
  const source = String(localOcrText || '');
  const labels = kind === 'subtotal'
    ? '(?:小計|subtotal)'
    : '(?:總計|合計|實付|應付|grand\\s*total|total)';
  const regexp = new RegExp(`${labels}[^0-9]{0,12}(?:NT\\$?\\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,6})`, 'i');
  const match = source.match(regexp);
  return match ? Number(String(match[1]).replace(/,/g, '')) : null;
}

function runArithmeticInvariantCheck(items, localOcrText = '') {
  const reviewFlags = new Set();
  const logs = [];
  const roleSums = {
    lineItem: 0,
    taxAndFee: 0,
    discount: 0,
    deposit: 0,
    prepaymentDown: 0
  };
  let aggregateSubtotal = null;
  let aggregateGrandTotal = null;

  for (const item of Array.isArray(items) ? items : []) {
    const price = Number(item?.price);
    if (!Number.isFinite(price)) continue;
    const role = normalizePriceRole(item?.priceRole, item);
    if (role === 'line_item') roleSums.lineItem += price;
    if (role === 'tax_and_fee') roleSums.taxAndFee += price;
    if (role === 'discount') roleSums.discount += Math.abs(price);
    if (role === 'deposit') {
      roleSums.deposit += price;
      reviewFlags.add('deposit_detected');
    }
    if (role === 'prepayment_down') roleSums.prepaymentDown += Math.abs(price);
    if (role === 'aggregate_subtotal') aggregateSubtotal = price;
    if (role === 'aggregate_grand_total') aggregateGrandTotal = price;
  }

  aggregateSubtotal = aggregateSubtotal ?? extractAggregateAmount(localOcrText, 'subtotal');
  aggregateGrandTotal = aggregateGrandTotal ?? extractAggregateAmount(localOcrText, 'grand_total');

  const computedTotal = roleSums.lineItem + roleSums.taxAndFee - roleSums.discount - roleSums.prepaymentDown;
  const expectedTotal = aggregateGrandTotal ?? aggregateSubtotal;
  const discrepancy = expectedTotal === null ? 0 : Math.abs(computedTotal - expectedTotal);
  if (expectedTotal !== null && discrepancy > 1) {
    reviewFlags.add('arithmetic_mismatch');
    logs.push(`細項計算 ${computedTotal} 與單據總額 ${expectedTotal} 不符，差額 ${discrepancy}。`);
  }
  if (roleSums.deposit > 0) {
    logs.push(`偵測到押金 ${roleSums.deposit}，需要人工確認是否排除一般分攤。`);
  }

  return {
    passed: !reviewFlags.has('arithmetic_mismatch'),
    computedTotal,
    expectedTotal,
    discrepancy,
    roleSums,
    reviewFlags: Array.from(reviewFlags),
    logs
  };
}

function normalizeParsedItems(items, imageCount = 1, addonSection = null) {
  const normalized = [];
  const seen = new Set();
  const globalAddonGroup = normalizeAddonSectionGroup(addonSection);

  for (const item of Array.isArray(items) ? items : []) {
    const name = String(item?.name || '').replace(/\s+/g, ' ').trim();
    const price = Number(item?.price);
    if (!name || shouldDropNonMenuPriceName(name) || !Number.isInteger(price) || price <= 0 || price > 100000) {
      continue;
    }

    const supportsDrinkOptions = typeof item?.supportsDrinkOptions === 'boolean'
      ? item.supportsDrinkOptions
      : inferDrinkItem(name);
    const sourceImageIndex = normalizeSourceImageIndex(item?.sourceImageIndex, imageCount);
    const category = normalizeMenuCategory(item?.category, name, supportsDrinkOptions);
    const sectionName = normalizeShortText(item?.sectionName, 32);
    const sizeLabel = normalizeShortText(item?.sizeLabel, 24);
    const temperature = normalizeTemperature(item?.temperature, name, supportsDrinkOptions);
    const spiceLevel = normalizeSpiceLevel(item?.spiceLevel, name);
    const dietaryFlags = normalizeFlagList(item?.dietaryFlags, allowedDietaryFlags, 8);
    const tags = normalizeFlagList(item?.tags, allowedItemTags, 8);
    const note = normalizeShortText(item?.note, 60);
    const evidenceText = normalizeShortText(item?.rawTextEvidence || `${sectionName} ${name}`, 220);
    const priceRole = normalizePriceRole(item?.priceRole, { ...item, name, sectionName, note });
    const sourceNumberClass = normalizeSourceNumberClass(item?.sourceNumberClass, { ...item, name, sectionName, note });
    const currency = normalizeShortText(item?.currency || 'TWD', 12).toUpperCase() || 'TWD';
    const quantity = Math.max(1, Math.min(10000, Number(item?.quantity || 1)));
    const unit = normalizeShortText(item?.unit || inferUnitFromText(evidenceText), 24);
    const conditions = normalizeConditions(item?.conditions, evidenceText);
    const reviewFlags = normalizeFlagList(item?.reviewFlags, reviewFlagTypes, 12);
    const confidence = normalizeConfidence(item?.confidence);
    const detectedTypeHint = detectOcrObservationType(evidenceText);
    const rawOptionGroups = supportsDrinkOptions
      ? appendGlobalAddonGroup(item?.optionGroups, globalAddonGroup)
      : item?.optionGroups;
    const optionGroups = normalizeItemOptionGroups(rawOptionGroups);

    const dedupeKey = `${sourceImageIndex}|${name}|${price}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const normalizedItem = {
      id: `item_${normalized.length + 1}`,
      name,
      price,
      priceRole,
      sourceNumberClass,
      currency,
      quantity,
      unit,
      conditions,
      reviewFlags,
      rawTextEvidence: evidenceText,
      confidence,
      boundingZone: normalizeShortText(item?.boundingZone || inferObservationBoundingZone(0, 1, detectedTypeHint), 40),
      detectedTypeHint: normalizeShortText(item?.detectedTypeHint || detectedTypeHint, 48),
      auditAnchor: normalizeShortText(item?.auditAnchor || evidenceText, 160),
      auditAnchors: normalizeAuditAnchors(item?.auditAnchors),
      reviewGates: normalizeReviewGates(item?.reviewGates),
      supportsDrinkOptions,
      category,
      sectionName,
      sizeLabel,
      temperature,
      spiceLevel,
      dietaryFlags,
      tags,
      note,
      optionGroups,
      sourceImageIndex,
      hasImage: false,
      cellBox: null,
      imageBox: null,
      anchorBox: null,
      edgeAngle: 0,
      imageBoxSource: 'none'
    };
    normalized.push(normalizedItem);
  }

  return disambiguateDuplicateNamesBySection(mergeDrinkSizeVariants(pruneDrinkNutritionItems(normalized))).map((item, index) => ({
    ...item,
    id: `item_${index + 1}`
  }));
}

function disambiguateDuplicateNamesBySection(items) {
  const groups = new Map();
  for (const item of items) {
    const name = String(item?.name || '').trim();
    if (!name) {
      continue;
    }
    const group = groups.get(name) || [];
    group.push(item);
    groups.set(name, group);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }
    const prices = new Set(group.map((item) => Number(item.price)).filter((price) => Number.isInteger(price)));
    const sections = new Set(group.map((item) => String(item.sectionName || '').trim()).filter(Boolean));
    if (prices.size <= 1 || sections.size <= 1) {
      continue;
    }
    for (const item of group) {
      const sectionName = normalizeShortText(item.sectionName, 24);
      const name = normalizeShortText(item.name, 48);
      if (!sectionName || !name || name.includes(sectionName)) {
        continue;
      }
      item.name = normalizeShortText(`${sectionName} ${name}`, 48);
      if (!Array.isArray(item.tags)) {
        item.tags = [];
      }
      if (!item.tags.includes('manual_review')) {
        item.tags.push('manual_review');
      }
      if (!item.note) {
        item.note = '同名不同區段，已自動加上區段名稱，請人工確認。';
      }
    }
  }

  return items;
}

function mergeDrinkSizeVariants(items) {
  const groups = new Map();

  for (const item of items) {
    if (!item.supportsDrinkOptions) {
      continue;
    }
    if (Array.isArray(item.optionGroups) && item.optionGroups.some((group) => isSizeOptionGroup(group) && group.options?.length > 1)) {
      continue;
    }
    const baseName = normalizeDrinkBaseName(item.name);
    if (!baseName) {
      continue;
    }
    const key = `${item.sourceImageIndex}|${baseName}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const replacementByFirstItem = new Map();
  const dropped = new Set();

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const variants = [];
    const seenSizeIds = new Set();
    for (const item of group) {
      const size = detectDrinkSize(item.name) || {
        id: 'regular',
        label: '一般',
        rank: 2
      };
      if (seenSizeIds.has(size.id)) {
        continue;
      }
      seenSizeIds.add(size.id);
      variants.push({
        item,
        size
      });
    }

    const hasExplicitSize = variants.some((variant) => detectDrinkSize(variant.item.name));
    const distinctPrices = new Set(variants.map((variant) => variant.item.price));
    if (!hasExplicitSize || variants.length < 2 || distinctPrices.size < 2) {
      continue;
    }

    variants.sort((a, b) => {
      if (a.size.rank !== b.size.rank) {
        return a.size.rank - b.size.rank;
      }
      return a.item.price - b.item.price;
    });

    const basePrice = Math.min(...variants.map((variant) => variant.item.price));
    const baseVariant = variants.find((variant) => variant.item.price === basePrice) || variants[0];
    const baseName = stripDrinkSizeFromName(baseVariant.item.name);
    const options = variants.map((variant) => ({
      id: variant.size.id,
      label: variant.size.label,
      priceDelta: Math.max(0, variant.item.price - basePrice)
    }));

    const optionGroups = [
      {
        id: 'size',
        label: '大小',
        type: 'size',
        selectionType: 'single',
        options
      },
      ...baseVariant.item.optionGroups.filter((group) => !isSizeOptionGroup(group))
    ];

    replacementByFirstItem.set(group[0], {
      ...baseVariant.item,
      name: baseName,
      price: basePrice,
      optionGroups
    });

    for (const item of group) {
      if (item !== group[0]) {
        dropped.add(item);
      }
    }
  }

  return items.reduce((merged, item) => {
    if (dropped.has(item)) {
      return merged;
    }
    merged.push(replacementByFirstItem.get(item) || item);
    return merged;
  }, []);
}

function pruneDrinkNutritionItems(items) {
  const exactNameSeen = new Set();
  const exactNamePruned = [];

  for (const item of items) {
    const exactKey = `${item.sourceImageIndex}|${item.name}`;
    if (item.supportsDrinkOptions && exactNameSeen.has(exactKey)) {
      continue;
    }
    exactNameSeen.add(exactKey);
    exactNamePruned.push(item);
  }

  const groups = new Map();
  for (const item of exactNamePruned) {
    if (!item.supportsDrinkOptions) {
      continue;
    }
    const baseName = normalizeDrinkBaseName(item.name);
    if (!baseName) {
      continue;
    }
    const group = groups.get(baseName) || [];
    group.push(item);
    groups.set(baseName, group);
  }

  const dropped = new Set();
  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const unmarkedPrices = group
      .filter((item) => !hasDrinkSizeMarker(item.name))
      .map((item) => item.price);
    const maxUnmarkedPrice = unmarkedPrices.length > 0 ? Math.max(...unmarkedPrices) : 0;

    for (const item of group) {
      if (hasLargeDrinkSizeMarker(item.name) && maxUnmarkedPrice > 0 && item.price < maxUnmarkedPrice) {
        dropped.add(item);
      }
    }

    const unmarkedItems = group.filter((item) => !hasDrinkSizeMarker(item.name));
    if (unmarkedItems.length > 1) {
      for (const item of unmarkedItems.slice(1)) {
        dropped.add(item);
      }
    }
  }

  return exactNamePruned.filter((item) => !dropped.has(item));
}

function ensureParticipant(room, participantId, displayName) {
  const id = typeof participantId === 'string' && participantId.length <= 80
    ? participantId
    : randomUUID();
  const name = normalizeDisplayName(displayName);
  let participant = room.participants.get(id);

  if (!participant) {
    participant = {
      id,
      displayName: name,
      order: {},
      confirmed: false,
      confirmedAt: null,
      connectedCount: 0,
      updatedAt: nowIso()
    };
    room.participants.set(id, participant);
  } else {
    participant.displayName = name;
    participant.confirmed = Boolean(participant.confirmed);
    participant.confirmedAt = participant.confirmedAt || null;
    participant.updatedAt = nowIso();
  }

  return participant;
}

function participantHasOrder(room, participant) {
  return room.items.some((item) => normalizeOrderEntry(participant.order[item.id], item).qty > 0);
}

function roomHasConfirmedParticipant(room) {
  return Array.from(room?.participants?.values?.() || [])
    .some((participant) => Boolean(participant.confirmed));
}

function getItemClaimQty(room, itemId) {
  return Array.from(room?.participants?.values?.() || [])
    .reduce((sum, participant) => {
      const item = room.items.find((candidate) => candidate.id === itemId);
      if (!item) {
        return sum;
      }
      return sum + normalizeOrderEntry(participant.order[itemId], item).qty;
    }, 0);
}

function removeInactiveParticipant(room, participantId) {
  const participant = participantId ? room.participants.get(participantId) : null;
  if (!participant) {
    return false;
  }
  const shouldKeep = participant.connectedCount > 0
    || participant.confirmed
    || participantHasOrder(room, participant);
  if (shouldKeep) {
    return false;
  }
  room.participants.delete(participant.id);
  return true;
}

function buildFormulaContract(room) {
  const taskRouter = room?.taskRouter && typeof room.taskRouter === 'object'
    ? room.taskRouter
    : { ...defaultTaskRouter };
  const activeModules = formulaModuleContracts
    .filter((module) => module.status === 'active')
    .map((module) => module.id);
  const pendingModules = formulaModuleContracts
    .filter((module) => module.status !== 'active')
    .map((module) => module.id);
  return {
    contractVersion: formulaContractVersion,
    formulaVersion: formulaResultVersion,
    taskType: taskRouter.taskType || defaultTaskRouter.taskType,
    splitMode: taskRouter.splitMode || defaultTaskRouter.splitMode,
    thresholdKind: taskRouter.thresholdKind || defaultTaskRouter.thresholdKind,
    deterministicOnly: true,
    externalCalculationAllowed: false,
    activeModules,
    pendingModules,
    modules: formulaModuleContracts,
    inputSources: [
      'room.items',
      'participant.order',
      'item.optionGroups',
      'taskRouter.splitMode',
      'manual formula controls P1'
    ],
    outputFields: [
      'totals.itemTotals',
      'totals.grandTotal',
      'totals.sharedCandidateTotal',
      'totals.personalClaimTotal',
      formulaField('participantSubtotal'),
      formulaField('sameItemMerge'),
      formulaField('averageSplit'),
      formulaField('extraPersonalClaim'),
      'formulaResults.claimLedger'
    ],
    aiAllowed: false,
    externalFormulaTargetsAllowed: [],
    forbiddenAiActions: [
      'calculate_money',
      'change_formula',
      'assign_cost_pool',
      'override_claim_mode',
      'finalize_settlement'
    ],
    forbiddenExternalCalculationTargets: [
      'google_sheets',
      'notion',
      'external_ai',
      'browser_scraping'
    ]
  };
}

function buildServiceBlueprintContract() {
  return {
    contractVersion: serviceBlueprintContractVersion,
    externalName: 'ServiceBlueprint',
    internalAlias: 'hostTask',
    roomMode: 'single_direction_private_task_room',
    hostRole: 'company_vendor_shop_provider_or_organizer',
    receiverRole: 'select_host_provided_options_and_fill_required_fields',
    evidencePolicy: 'sparse_evidence_candidate_first',
    unknownFieldDecision: 'receiver_required_field_or_review_gate',
    hostProvidedOptionRequired: true,
    archetypes: [
      'menu_unit_pricing',
      'tiered_slot_booking',
      'threshold_incentive',
      'posthoc_audit_split'
    ],
    commercialFieldRoles: [
      'SelectableItem',
      'CalculationRule',
      'AuditAnchor',
      'Metadata',
      'ForbiddenLeak',
      'ProviderOnlyField',
      'ReceiverRequiredField',
      'AvailabilitySlot',
      'ReviewGate'
    ],
    p0Rule: 'Sparse DM, menu, price-list, booking-form, receipt, or PDF evidence supports basic service tasks; missing details route to receiver input or review gates.'
  };
}

function buildTrustLayerContract() {
  return {
    contractVersion: trustLayerContractVersion,
    configured: Boolean(trustLayerSpreadsheetId),
    spreadsheetId: trustLayerSpreadsheetId || null,
    spreadsheetUrl: trustLayerSpreadsheetUrl || null,
    tabs: {
      whitelist: 'Whitelist',
      auditLog: 'AuditLog',
      toolSpec: 'ToolSpec'
    },
    whitelistColumns: [
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
    ],
    auditLogColumns: [
      'event_id',
      'room_id',
      'actor_device_id_hash',
      'action',
      'target_device_id_hash',
      'status_before',
      'status_after',
      'reason',
      'created_at',
      'expires_at',
      'notes'
    ],
    statuses: ['PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED'],
    roles: ['organizer', 'member', 'viewer'],
    tools: [
      {
        name: 'check_whitelist',
        mode: 'read_only',
        writesSheet: false,
        writesMoney: false
      },
      {
        name: 'enroll_device',
        mode: 'write_trust_row',
        writesSheet: true,
        writesMoney: false
      },
      {
        name: 'revoke_device',
        mode: 'write_status',
        writesSheet: true,
        writesMoney: false
      },
      {
        name: 'expire_whitelist_rows',
        mode: 'write_status',
        writesSheet: true,
        writesMoney: false
      }
    ],
    privacyRules: [
      'hash_only_device_id',
      'no_raw_device_fingerprint',
      'no_payment_data',
      'no_social_account_identifier',
      'no_cross_room_tracking',
      'expired_or_missing_rows_fail_closed'
    ],
    formulaBoundary: {
      externalCalculationAllowed: false,
      forbiddenExternalCalculationTargets: [
        'google_sheets',
        'notion',
        'external_ai',
        'browser_scraping'
      ]
    }
  };
}

function buildWebMcpToolSurface(room) {
  return {
    toolSurfaceVersion: webMcpToolSurfaceVersion,
    implementation: webMcpImplementationName,
    source: webMcpStateSource,
    readOnlyTools: [
      'inspect_room',
      'get_task_router',
      'get_claim_audit',
      'get_formula_contract',
      'get_trust_layer_contract',
      'suggest_next_actions'
    ],
    proposalOnlyTools: [
      'create_action_proposal'
    ],
    trustLayerTools: [
      'check_whitelist',
      'enroll_device',
      'revoke_device'
    ],
    proposalContract: buildAgentProposalContract(),
    registeredWhenSupported: true,
    activeRoomId: room?.id || null,
    readOnlyByDefault: true,
    proposalDraftCreationAllowed: true,
    serviceBlueprintContract: buildServiceBlueprintContract(),
    finalStateMutationAllowed: false,
    parsedItemMutationAllowedForAgent: false,
    moneyCalculationAllowed: false,
    externalCalculationAllowed: false
  };
}

function buildRoomFormulaSnapshot(room) {
  const itemTotals = {};
  for (const item of room.items) {
    itemTotals[item.id] = {
      qty: 0,
      subtotal: 0,
      claimMode: isSharedCostItem(item) ? 'shared_candidate' : 'personal_claim'
    };
  }

  const participants = Array.from(room.participants.values()).map((participant) => {
    let total = 0;
    const order = {};

    for (const item of room.items) {
      const entry = normalizeOrderEntry(participant.order[item.id], item);
      if (entry.qty > 0) {
        order[item.id] = entry;
        const subtotal = getItemUnitPrice(item, entry) * entry.qty;
        total += subtotal;
        itemTotals[item.id].qty += entry.qty;
        itemTotals[item.id].subtotal += subtotal;
      }
    }

    const hasOrder = Object.keys(order).length > 0;

    return {
      id: participant.id,
      displayName: participant.displayName,
      order,
      total,
      hasOrder,
      confirmed: Boolean(participant.confirmed),
      confirmedAt: participant.confirmedAt || null,
      connected: participant.connectedCount > 0,
      updatedAt: participant.updatedAt
    };
  }).filter((participant) => participant.connected || participant.hasOrder || participant.confirmed);

  const grandTotal = Object.values(itemTotals)
    .reduce((sum, itemTotal) => sum + itemTotal.subtotal, 0);
  const sharedCandidateTotal = Object.values(itemTotals)
    .filter((itemTotal) => itemTotal.claimMode === 'shared_candidate')
    .reduce((sum, itemTotal) => sum + itemTotal.subtotal, 0);
  const personalClaimTotal = Math.max(0, grandTotal - sharedCandidateTotal);
  const unconfirmedParticipants = participants
    .filter((participant) => Number(participant.total || 0) > 0 && !participant.confirmed)
    .map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      total: participant.total
    }));
  const claimedOrderCount = participants
    .reduce((sum, participant) => sum + Object.keys(participant.order || {}).length, 0);
  const activeParticipants = participants.filter((participant) => Number(participant.total || 0) > 0);
  const activeParticipantIds = activeParticipants.map((participant) => participant.id);
  const participantById = new Map(activeParticipants.map((participant) => [participant.id, participant]));
  const claimLedger = [];

  for (const participant of participants) {
    for (const item of room.items) {
      const entry = normalizeOrderEntry(participant.order[item.id], item);
      if (entry.qty <= 0) {
        continue;
      }

      const claimMode = itemTotals[item.id]?.claimMode || 'personal_claim';
      const subtotal = getItemUnitPrice(item, entry) * entry.qty;
      const verifiers = claimMode === 'shared_candidate'
        ? activeParticipantIds
        : [participant.id];
      const approvals = verifiers.filter((participantId) => Boolean(participantById.get(participantId)?.confirmed));
      const allApproved = verifiers.length > 0 && approvals.length === verifiers.length;
      const state = claimMode === 'shared_candidate'
        ? allApproved ? 'ready_to_split' : 'awaiting_votes'
        : participant.confirmed ? 'personal_confirmed' : 'awaiting_claimant_confirmation';

      claimLedger.push({
        claim_id: buildClaimId(participant.id, item.id, entry),
        item_id: item.id,
        item_name: item.name,
        claimer_id: participant.id,
        claimer_name: participant.displayName,
        mode: claimMode,
        cost_pool: claimMode === 'shared_candidate' ? 'shared_candidate' : 'personal',
        qty: entry.qty,
        unit_price: getItemUnitPrice(item, entry),
        subtotal,
        option_signature: getOrderOptionSignature(entry),
        verifiers,
        approvals,
        state,
        updated_at: participant.updatedAt || room.updatedAt || room.createdAt || null
      });
    }
  }

  const pendingClaimCount = claimLedger
    .filter((claim) => !['ready_to_split', 'personal_confirmed'].includes(claim.state))
    .length;
  const claimStateCounts = claimLedger.reduce((counts, claim) => {
    counts[claim.state] = (counts[claim.state] || 0) + 1;
    return counts;
  }, {});
  const audit = {
    claimAuditVersion: 'acmcp-claim-audit.v1',
    sharedCandidateTotal,
    personalClaimTotal,
    claimedOrderCount,
    claimLedgerCount: claimLedger.length,
    pendingClaimCount,
    claimStateCounts,
    claimLedger,
    unconfirmedParticipantCount: unconfirmedParticipants.length,
    unconfirmedParticipants,
    settlementReady: grandTotal > 0 && unconfirmedParticipants.length === 0 && pendingClaimCount === 0,
    rules: [
      'personal_claim_items_are_self_claimed',
      'shared_candidate_items_can_be_used_for_average_split',
      'ai_cannot_assign_claimants',
      'organizer_settlement_requires_human_confirmation'
    ]
  };

  return {
    participants,
    totals: {
      itemTotals,
      grandTotal,
      sharedCandidateTotal,
      personalClaimTotal
    },
    formulaContract: buildFormulaContract(room),
    formulaResults: {
      formulaVersion: formulaResultVersion,
      participantSubtotal: participants.map((participant) => ({
        participantId: participant.id,
        displayName: participant.displayName,
        subtotal: participant.total,
        confirmed: participant.confirmed
      })),
      sameItemMerge: Object.entries(itemTotals).map(([itemId, itemTotal]) => ({
        itemId,
        qty: itemTotal.qty,
        subtotal: itemTotal.subtotal,
        claimMode: itemTotal.claimMode
      })),
      grandTotal,
      averageSplit: participants.length > 0
        ? Math.ceil(sharedCandidateTotal / participants.length)
        : 0,
      thresholdRemaining: null,
      extraPersonalClaim: personalClaimTotal,
      sharedCandidateTotal,
      personalClaimTotal,
      claimLedger
    },
    audit
  };
}

function serializeRoom(room) {
  const formulaSnapshot = buildRoomFormulaSnapshot(room);

  return {
    id: room.id,
    menuLoaded: room.menuLoaded,
    itemsOpenForMembers: Boolean(room.itemsOpenForMembers),
    menuType: room.menuType,
    menuMode: room.menuMode,
    taskRouter: room.taskRouter || { ...defaultTaskRouter },
    taskRouterContract: buildTaskRouterContract(room),
    evidenceContract: buildEvidenceContract(room),
    serviceBlueprintContract: buildServiceBlueprintContract(),
    webMcpToolSurface: buildWebMcpToolSurface(room),
    trustLayerContract: buildTrustLayerContract(),
    items: room.items,
    evidenceAssets: Array.isArray(room.evidenceAssets) ? room.evidenceAssets : [],
    ocrObservations: Array.isArray(room.ocrObservations) ? room.ocrObservations : [],
    parserCandidates: Array.isArray(room.parserCandidates) ? room.parserCandidates : [],
    calculationRules: Array.isArray(room.calculationRules) ? room.calculationRules : [],
    reviewDecisions: Array.isArray(room.reviewDecisions) ? room.reviewDecisions : [],
    settlementSnapshots: Array.isArray(room.settlementSnapshots) ? room.settlementSnapshots : [],
    antiPollution: {
      contractVersion: 'acmcp-anti-pollution-gate.v1',
      blocks: getAntiPollutionBlocks(room),
      parserWritesCandidatesFirst: true,
      memberItemsRequireEvidencePointer: true
    },
    menuImages: Array.isArray(room.menuImages)
      ? room.menuImages.map((image, index) => ({
        index,
        url: `/api/rooms/${encodeURIComponent(room.id)}/menu-images/${index}?parsedAt=${encodeURIComponent(room.parsedAt || '')}`,
        width: image.width || null,
        height: image.height || null,
        originalBytes: image.originalBytes || null,
        processedBytes: image.processedBytes || null
      }))
      : [],
    menuImageUrl: room.menuLoaded && room.menuImageBuffer
      ? `/api/rooms/${encodeURIComponent(room.id)}/menu-image?parsedAt=${encodeURIComponent(room.parsedAt || '')}`
      : null,
    ownerParticipantId: room.ownerParticipantId,
    settled: Boolean(room.settled),
    settledAt: room.settledAt,
    settledBy: room.settledBy,
    agentProposalContract: buildAgentProposalContract(),
    agentProposals: Array.isArray(room.agentProposals)
      ? room.agentProposals.map((proposal) => serializeAgentProposal(proposal))
      : [],
    participants: formulaSnapshot.participants,
    totals: formulaSnapshot.totals,
    formulaContract: formulaSnapshot.formulaContract,
    formulaResults: formulaSnapshot.formulaResults,
    audit: formulaSnapshot.audit,
    warnings: room.warnings,
    parseQuality: room.parseQuality || null,
    evidenceReviewSource: room.evidenceReviewSource || null,
    evidenceReviewModel: room.evidenceReviewModel || null,
    localOcr: room.localOcr || null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    parsedAt: room.parsedAt
  };
}

function getExportLanguage(value) {
  return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function serverMoney(value) {
  return `NT$ ${Number(value || 0).toLocaleString('en-US')}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeExportFilename(value) {
  return String(value || 'room')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'room';
}

function buildRoomExportText(room, language = 'en') {
  const state = serializeRoom(room);
  const zh = language === 'zh';
  const lines = [
    zh ? '行動審核摘要' : 'Action Review Summary',
    `${zh ? '房間' : 'Room'} ${state.id}`,
    `${zh ? '狀態' : 'Status'} ${state.settled ? (zh ? '已完成' : 'finalized') : (zh ? '未完成' : 'not finalized')}`,
    ''
  ];

  lines.push(zh ? '品項彙總' : 'Item summary');
  if (Array.isArray(state.items) && state.items.length > 0) {
    for (const item of state.items) {
      const total = state.totals?.itemTotals?.[item.id] || { qty: 0, subtotal: 0 };
      lines.push(`${item.name} x ${Number(total.qty || 0)} = ${serverMoney(total.subtotal)}`);
    }
  } else {
    lines.push(zh ? '尚無品項' : 'No items');
  }

  lines.push('');
  lines.push(zh ? '每人明細' : 'People');
  const activeParticipants = Array.isArray(state.participants)
    ? state.participants.filter((participant) => Number(participant.total || 0) > 0 || participant.confirmed)
    : [];
  if (activeParticipants.length > 0) {
    for (const participant of activeParticipants) {
      lines.push(`${participant.displayName}: ${serverMoney(participant.total)} ${participant.confirmed || state.settled ? (zh ? '已確認' : 'confirmed') : (zh ? '未確認' : 'unconfirmed')}`);
      for (const [itemId, entry] of Object.entries(participant.order || {})) {
        const item = state.items.find((candidate) => candidate.id === itemId);
        if (!item) {
          continue;
        }
        const qty = Number(entry?.qty || 0);
        if (qty <= 0) {
          continue;
        }
        const subtotal = Number(item.price || 0) * qty;
        lines.push(`  ${item.name} x ${qty} = ${serverMoney(subtotal)}`);
      }
    }
  } else {
    lines.push(zh ? '尚無成員費用' : 'No member costs');
  }

  lines.push('');
  lines.push(`${zh ? '總金額' : 'Total'} ${serverMoney(state.totals?.grandTotal || 0)}`);
  lines.push(`${zh ? '可一起分' : 'Shared candidate'} ${serverMoney(state.totals?.sharedCandidateTotal || 0)}`);
  lines.push(`${zh ? '個人加點' : 'Personal add-ons'} ${serverMoney(state.totals?.personalClaimTotal || 0)}`);
  lines.push(`${zh ? '確認狀態' : 'Claim audit'} ${state.audit?.settlementReady ? (zh ? '可完成' : 'ready') : `${zh ? '未確認' : 'unconfirmed'} ${Number(state.audit?.unconfirmedParticipantCount || 0)}`}`);
  return lines.join('\n');
}

function buildRoomExportHtml(room, language = 'en') {
  const title = language === 'zh' ? '行動審核摘要' : 'Action Review Summary';
  const text = buildRoomExportText(room, language);
  const generatedAt = new Date().toISOString();
  return `<!doctype html>
<html lang="${language === 'zh' ? 'zh-Hant' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(room.id)}</title>
  <style>
    body {
      margin: 32px;
      color: #222;
      background: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif;
      line-height: 1.55;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 700;
    }
    .meta {
      margin: 0 0 24px;
      color: #666;
      font-size: 13px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 18px;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${escapeHtml(generatedAt)}</p>
    <pre>${escapeHtml(text)}</pre>
  </main>
</body>
</html>`;
}

function splitPdfLine(line, maxLength = 58) {
  const chars = Array.from(String(line || ''));
  if (chars.length <= maxLength) {
    return [String(line || '')];
  }
  const result = [];
  for (let index = 0; index < chars.length; index += maxLength) {
    result.push(chars.slice(index, index + maxLength).join(''));
  }
  return result;
}

function toPdfTextHex(value) {
  let hex = 'FEFF';
  for (const char of Array.from(String(value || ''))) {
    let codePoint = char.codePointAt(0);
    if (codePoint > 0xffff) {
      codePoint = 0x003f;
    }
    hex += codePoint.toString(16).padStart(4, '0').toUpperCase();
  }
  return hex;
}

function escapePdfLiteral(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

function isPdfWideCharacter(char) {
  return Number(char.codePointAt(0) || 0) > 0x7f;
}

function splitPdfTextRuns(value) {
  const runs = [];
  for (const char of Array.from(String(value || ''))) {
    const wide = isPdfWideCharacter(char);
    const previous = runs[runs.length - 1];
    if (previous && previous.wide === wide) {
      previous.text += char;
    } else {
      runs.push({ text: char, wide });
    }
  }
  return runs;
}

function estimatePdfRunWidth(run, fontSize) {
  if (run.wide) {
    return Array.from(run.text).length * fontSize * 1.45;
  }
  let units = 0;
  for (const char of Array.from(run.text)) {
    if (char === ' ') {
      units += 0.55;
    } else if (/[A-Z0-9$]/.test(char)) {
      units += 0.62;
    } else if (/[a-z]/.test(char)) {
      units += 0.5;
    } else {
      units += 0.36;
    }
  }
  return units * fontSize;
}

function buildRoomExportPdf(room, language = 'en') {
  const title = language === 'zh' ? '行動審核摘要' : 'Action Review Summary';
  const lines = [
    `${title} - ${room.id}`,
    new Date().toISOString(),
    '',
    ...buildRoomExportText(room, language).split('\n')
  ].flatMap((line) => splitPdfLine(line));
  const linesPerPage = 42;
  const pages = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type0 /BaseFont /MSung-Light /Encoding /UniCNS-UCS2-H /DescendantFonts [5 0 R] >>';
  objects[5] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MSung-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 0 >> >>';

  const pageObjectIds = [];
  let nextObjectId = 6;
  for (const pageLines of pages.length > 0 ? pages : [[]]) {
    const pageId = nextObjectId;
    const contentId = nextObjectId + 1;
    nextObjectId += 2;
    pageObjectIds.push(pageId);
    const fontSize = 11;
    const streamLines = ['BT'];
    for (let lineIndex = 0; lineIndex < pageLines.length; lineIndex += 1) {
      let x = 50;
      const y = 790 - (lineIndex * 15);
      for (const run of splitPdfTextRuns(pageLines[lineIndex])) {
        streamLines.push(`${run.wide ? '/F2' : '/F1'} ${fontSize} Tf`);
        streamLines.push(`1 0 0 1 ${x.toFixed(2)} ${y} Tm`);
        streamLines.push(run.wide
          ? `<${toPdfTextHex(run.text)}> Tj`
          : `(${escapePdfLiteral(run.text)}) Tj`);
        x += estimatePdfRunWidth(run, fontSize);
      }
    }
    streamLines.push('ET');
    const stream = streamLines.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) {
      continue;
    }
    offsets[id] = Buffer.byteLength(body);
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length}\n`;
  body += '0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id += 1) {
    const offset = offsets[id] || 0;
    body += `${String(offset).padStart(10, '0')} 00000 ${objects[id] ? 'n' : 'f'} \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

function buildMenuParsePrompt(options = {}) {
  const localOcrText = normalizeLocalOcrText(options.localOcrText);
  const localOcrCandidates = Array.isArray(options.localOcrCandidates) ? options.localOcrCandidates : [];
  const taskRouter = options.taskRouter && typeof options.taskRouter === 'object'
    ? options.taskRouter
    : { ...defaultTaskRouter };
  const featureProfile = buildExtractionFeatureProfile({
    localOcrText,
    taskType: taskRouter.selectedTaskType || taskRouter.taskType || options.taskType,
    taskRouter
  });
  const promptLines = [
    '你正在處理 host 發起的私密任務房價格證據圖片，不限餐飲、票券、預約、租借或現場費用。',
    `任務判別模組已鎖定 taskType=${taskRouter.taskType || 'generic_split'}，thresholdKind=${taskRouter.thresholdKind || 'custom'}，splitMode=${taskRouter.splitMode || 'individual_items'}，riskPolicy=${taskRouter.riskPolicy || 'conservative'}。`,
    '你只能在這個任務邊界內修補 evidence 欄位，不要把任務重新發散成其他產品；若圖片訊號與 taskType 衝突，請用 manual_review 與 note 標記，不要自行改任務。',
    '本次只會有一張圖片。每個項目的 sourceImageIndex 一律輸出 1。',
    '請先判斷整張圖片是一般消費項目、飲料單或混合清單，menuType 只能輸出 general、drink 或 mixed。',
    '解析流程必須分四步思考但只輸出 JSON：第一步辨識版面區塊與表格欄位；第二步抽取可選擇、可分攤或可列入費用的項目、價格與規格；第三步把自由文字收斂到固定欄位；第四步丟棄電話、地址、營業時間、品牌口號、廣告文案與非費用數字。',
    '請只輸出可選擇、可分攤或可列入費用的項目與單價，不要把電話、地址、營業時間、分類標題、方案說明或廣告文案當成獨立項目。',
    '自由價格證據規則：圖片可能是餐飲菜單、飲料單、KTV 包廂價目表、運動場地費率、票券表、課程/活動報名表、器材租借表、低消/服務費公告、優惠券格、套餐卡片或混合圖。請以視覺邊界與價格欄關係建立項目，不要只依照逐行 OCR 文字。',
    '欄位收斂規則：category 只能輸出 main、side、snack、soup、dessert、drink、set、service、ticket、rental、venue、addon、other；sectionName 放圖片上的區塊標題；sizeLabel 只放該列固定份量、時段、人數或規格；temperature 只能輸出 冷、熱、常溫、冷熱皆可、未標示；spiceLevel 只能輸出 none、mild、medium、hot、extra_hot、unknown。',
    '通用服務欄位規則：KTV 包廂、運動場地、球場、泳道、包場輸出 category=venue；票券、門票、報名、活動、課程輸出 category=ticket；器材、球拍、鞋、裝備、麥克風租借輸出 category=rental；服務費、清潔費、低消、人頭費、計時費輸出 category=service；多人方案、包套、組合、共享方案輸出 category=set。',
    '餐飲欄位規則：飯、麵、粥、便當、漢堡、吐司、蛋餅、咖哩、燴飯、披薩、主餐歸 category=main；湯/鍋/羹歸 soup；小菜/炸物/配菜歸 side 或 snack；甜點/冰品歸 dessert；多人餐、套餐、組合餐、優惠券格歸 set。',
    '餐廳規格規則：若有大/小、單人/雙人、乾/湯、飯/麵、加麵、加飯、升級套餐、換飲料、加蛋、加起司、加肉，請優先放在 optionGroups；若價格是固定商品差異，才拆成不同品項。',
    '飲料欄位規則：手搖、咖啡、茶、鮮奶、拿鐵、果汁、冰沙、氣泡飲歸 category=drink。咖啡因、無咖啡因、季節限定、招牌、熱賣、新品、甜度冰塊、冷熱、瓶裝、分享瓶、容量、加料都要收斂到 supportsDrinkOptions、temperature、tags、dietaryFlags、sizeLabel、optionGroups 或 note，不要塞進品名造成重複。',
    '方案與組合規則：如果一個價格包含主餐、附餐、飲料、甜點、包廂、場地、票券、器材或多人共享內容，輸出成一個項目 category=set，name 用短句保留主要內容，note 可寫固定內容、可換項目、時段、人數或限制。不要把方案裡的附帶內容拆成零元品項。',
    '不確定欄位規則：看得出可點但分類不明，category=other；價格或規格疑似模糊但仍可讀，tags 加 manual_review 且 note 寫短句；價格不可靠則跳過該品項。',
    '模糊規則 1：價格只能來自可選擇、可分攤或可列入費用的價格欄。若數字位於「總糖量、總熱量、大卡、卡路里、克、容量、ml、使用期限、代碼、電話、地址」等欄位，絕對不要當成 price。',
    '模糊規則 2：飲料價目表如果有「小杯、中杯、大杯、分享瓶、瓶裝、L、瓶」或英文「S、M、L、XL、Small、Medium、Regular、Large、Extra Large」欄位，請優先把大小做成該品項的 optionGroups size 下拉，不要輸出同名多價品項。',
    '模糊規則 3：同一列如果同時有價格與營養數字，只保留價格欄，不要輸出糖量、熱量、容量。若無法判斷哪個是價格，跳過該列。',
    '模糊規則 4：「加料、加購、加價升級、免費升級、珍珠、波霸、椰果、仙草、布丁、蘆薈」這類加料或升級選項不是主品項，除非它在菜單上明確是可單點商品。',
    '模糊規則 5：優惠券、套餐、多人組合、包廂方案、場地方案、活動方案以可見邊界為一個項目；同一個邊界內的內容要合併寫在同一個 name，price 使用該邊界最醒目的價格。',
    '模糊規則 6：同一品項有不同冷熱、尺寸或規格造成不同價格時，若它是固定欄位或可選規格，請用 optionGroups；若它是完全不同商品，才拆成多列並把差異寫進 name。英文尺寸同義：S/Small/Short=小杯，M/Medium/Med/Regular/Reg=中杯，L/Large=大杯，XL/Extra Large/X-Large=特大杯，瓶=瓶裝。',
    '複雜計費 hard-stop：稅率、服務費、押金、訂金、滿額門檻、滿件門檻、階梯折扣、運費分攤、人數門檻或需要公式的規則，不得輸出為 member_selectable line_item；請改用非 line_item 的 priceRole、reviewFlags 加 manual_review，並放入 host review / calculation rule 脈絡。',
    'price 必須是整數新台幣價格，不含 NT$、元、逗號或其他符號。',
    'supportsDrinkOptions 只給飲料店品項或可調甜度冰塊的飲品 true；一般餐點、便當、麵飯、小菜、甜點都給 false。',
    '若整張是飲料店菜單，所有飲料品項的 supportsDrinkOptions 應為 true。',
    '項目判定優先依照可見邊界設計：虛線券格、彩色框線、卡片邊緣、表格格線或完整方案區塊。若同一邊界內是組合餐、多人套餐、包廂方案、場地方案或活動方案，請輸出為同一個項目，name 要把主要內容寫在一起。',
    '全域加料區規則：請先定位包含「加料、配料、Topping、Add-ons、升級」的獨立區塊，採用由左到右、由上到下的 Z 字掃描。若看到「珍珠 10 椰果 10」，必須拆成珍珠 +10 與椰果 +10；若標題寫全區 +10 或加料皆 10 元，區塊內所有配料 priceDelta 都填 10。',
    '全域加料區請輸出到 addonSection，detected=true、selectionType=multiple、options 為配料清單；沒有加料區則 addonSection 輸出 detected=false、label=""、selectionType=multiple、options=[]。不要把全域加料重複塞到每個品項。',
    '尺寸欄位解析規則：如果表格上方價格欄是 S/M/L、Small/Medium/Large 或「L / 瓶」，請把同一列飲料輸出成一個品項，price 使用最低尺寸價格或 L 欄價格，optionGroups 內建立 label="大小"、type="size"、selectionType="single"，每個尺寸 priceDelta 是相對 price 的加價。',
    'L/瓶 欄位特別規則：台灣飲料菜單右側常見兩欄標頭「L」與「瓶」。L 是大杯欄，不是裝飾；瓶 是瓶裝欄。若同一列右側有兩個價格，例如「75 105」，請輸出 price=75，size options 為 L +0、瓶 +30。若瓶欄是「-」、空白或沒有價格，只輸出 L 價格且不要硬補瓶選項。不要把 L 或 瓶 放進 name。',
    '隱藏選項規則：如果某個品項明確有專屬尺寸、大小杯或專屬加價升級，請在該品項 optionGroups 輸出；沒有就輸出空陣列，不要硬補。',
    'optionGroups 的 size/custom 群組 selectionType 輸出 single；size 群組要包含基準尺寸且 priceDelta 為 0。addon 群組 selectionType 輸出 multiple，只輸出可加購配料，不要輸出「不加」。',
    'dietaryFlags 只輸出圖片明確可見或品名直接寫出的資訊：vegetarian、vegan、contains_meat、contains_pork、contains_beef、contains_chicken、contains_seafood、contains_dairy、contains_egg、contains_nuts、contains_caffeine、decaf、unknown。不要猜測過敏原。',
    'tags 只輸出圖片明確可見或品名直接寫出的資訊：signature、popular、limited、seasonal、new、discount、combo、shareable、single_serving、customizable、per_person、room_package、time_limited、spicy、vegetarian、caffeinated、non_caffeinated、manual_review。',
    '每個品項請輸出 name、price、priceRole、sourceNumberClass、currency、quantity、unit、conditions、reviewFlags、rawTextEvidence、confidence、supportsDrinkOptions、sourceImageIndex、category、sectionName、sizeLabel、temperature、spiceLevel、dietaryFlags、tags、note、optionGroups。price 只放可分攤或需人工判定的金額；年齡、行程編號、人數、公里、百分比、點數、卡號、統編不可塞進 price。',
    'priceRole 規則：一般商品或票券=line_item；押金/保證金=deposit；訂金/預付=prepayment_down；固定服務費或稅金=tax_and_fee；折扣/折抵=discount；小計=aggregate_subtotal；總計/實付=aggregate_grand_total。aggregate row 只作為對帳，不要當成可選商品。',
    'rawTextEvidence 必須是該 item 對應的原始文字片段；conditions 放會員/非會員、年齡、平假日、時段、房型、單位條件；reviewFlags 只輸出已知代碼，沒有就空陣列。全域加料只放 addonSection。不要輸出座標、圖片框、角度或其他欄位。',
    '若菜單是純文字飲料價目表，也照樣解析品名與價格，不需要判斷商品圖片。',
    '如果圖片有模糊、遮擋或無法確定的價格，請跳過該品項。',
    'warnings 只在嚴重無法解析整張證據圖片時輸出短句；英文來源用英文，中文來源用繁體中文。不要說明你如何假設大小杯價格。'
  ];

  promptLines.push(...buildAdaptivePromptLines(featureProfile));

  if (localOcrText) {
    promptLines.push(
      '',
      '以下是使用者裝置或本地 OCR 中介層提供的文字提示。這不是最終答案，只能作為輔助對齊圖片視覺內容；若文字與圖片衝突，以圖片可見價格與欄位為準。',
      '請優先用它補強品名、區塊標題、尺寸欄與價格欄，但不要照抄明顯 OCR 錯字、電話、地址、營業時間或營養數字。',
      'LOCAL_OCR_TEXT_START',
      localOcrText,
      'LOCAL_OCR_TEXT_END'
    );
  }

  if (localOcrCandidates.length > 0) {
    promptLines.push(
      '',
      '本地 deterministic parser 從 OCR 文字先抓到以下候選品項。請把它們視為候選，不是強制輸出；你必須用圖片檢查價格欄與規格欄後再收斂。',
      'LOCAL_OCR_CANDIDATES_START',
      JSON.stringify(localOcrCandidates.slice(0, 80).map((item) => ({
        name: item.name,
        price: item.price,
        category: item.category,
        sectionName: item.sectionName,
        supportsDrinkOptions: item.supportsDrinkOptions,
        optionGroups: item.optionGroups
      }))),
      'LOCAL_OCR_CANDIDATES_END'
    );
  }

  return promptLines.join('\n');
}

function buildGeminiContents(imageFiles, prompt) {
  const contents = [];
  for (let index = 0; index < imageFiles.length; index += 1) {
    const file = imageFiles[index];
    contents.push({
      text: `第 ${index + 1} 張價格證據圖片`
    });
    contents.push({
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype
      }
    });
  }
  contents.push({
    text: prompt
  });
  return contents;
}

function buildOpenAiInput(imageFiles, prompt, detail = openAiImageDetail) {
  const content = [];
  for (let index = 0; index < imageFiles.length; index += 1) {
    const file = imageFiles[index];
    content.push({
      type: 'input_text',
      text: `第 ${index + 1} 張價格證據圖片`
    });
    content.push({
      type: 'input_image',
      image_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      detail
    });
  }
  content.push({
    type: 'input_text',
    text: prompt
  });

  return [{
    role: 'user',
    content
  }];
}

function buildOpenAiCompatibleChatMessages(imageFiles, prompt, detail = openAiImageDetail) {
  const content = [];
  for (let index = 0; index < imageFiles.length; index += 1) {
    const file = imageFiles[index];
    content.push({
      type: 'text',
      text: `第 ${index + 1} 張價格證據圖片`
    });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        detail
      }
    });
  }
  content.push({
    type: 'text',
    text: prompt
  });

  return [{
    role: 'user',
    content
  }];
}

function buildOpenAiCompatibleUrl(baseUrl, route) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (base.endsWith('/v1') && route.startsWith('/v1/')) {
    return `${base}${route.slice(3)}`;
  }
  return `${base}${route}`;
}

function extractJsonObjectFromText(rawText, label = 'Local Vision') {
  const text = String(rawText || '').trim();
  if (!text) {
    throw new Error(`${label} 沒有回傳可用內容`);
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch (directError) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch (sliceError) {
        const wrapped = new Error(`${label} 回傳 JSON 格式異常`);
        wrapped.cause = sliceError;
        throw wrapped;
      }
    }
    const wrapped = new Error(`${label} 回傳 JSON 格式異常`);
    wrapped.cause = directError;
    throw wrapped;
  }
}

async function parseMenuImagesWithGemini(imageFiles, options = {}) {
  const { apiKey } = getGeminiApiKeyConfig();
  if (!apiKey) {
    const error = new Error('這個部署尚未開啟圖片讀取服務。請先貼上圖片中的文字，或由部署者在主機環境設定辨識服務。');
    error.statusCode = 500;
    throw error;
  }

  const ai = new GoogleGenAI({
    apiKey
  });
  const prompt = buildMenuParsePrompt(options);

  const generated = await generateMenuContent(ai, {
    contents: buildGeminiContents(imageFiles, prompt),
    config: {
      responseMimeType: 'application/json',
      responseSchema: menuSchema,
      temperature: 0.1
    }
  });
  const response = generated.response;

  const rawText = response.text;
  if (!rawText) {
    throw new Error('圖片讀取服務沒有回傳可用內容，請貼上圖片中的文字或換一張更清楚的圖片。');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const wrapped = new Error('圖片讀取服務回傳格式異常，請貼上圖片中的文字或稍後再試。');
    wrapped.cause = error;
    throw wrapped;
  }

  const items = normalizeParsedItems(parsed.items, imageFiles.length, parsed.addonSection);
  if (items.length === 0) {
    const error = new Error('圖片中沒有辨識到可用的品名與價格');
    error.statusCode = 422;
    throw error;
  }

  const taskRouter = buildRoomTaskRouter({
    taskType: options.taskRouter?.selectedTaskType || options.taskRouter?.taskType || options.taskType,
    localOcrText: options.localOcrText,
    items
  });
  const parseQuality = evaluateMenuParseQuality({
    items,
    menuType: normalizeMenuType(parsed.menuType, items),
    taskRouter,
    localOcrText: options.localOcrText
  });

  return {
    items,
    menuType: normalizeMenuType(parsed.menuType, items),
    provider: 'gemini',
    modelUsed: generated.model,
    warnings: [],
    parseQuality,
    taskRouter
  };
}

async function parseMenuImagesWithOpenAi(imageFiles, options = {}) {
  const { apiKey } = getOpenAiApiKeyConfig();
  if (!apiKey) {
    const error = new Error('這個部署尚未開啟備用圖片讀取服務。請先貼上圖片中的文字，或由部署者在主機環境設定辨識服務。');
    error.statusCode = 500;
    throw error;
  }

  const prompt = buildMenuParsePrompt(options);
  const generated = await generateOpenAiMenuContent(apiKey, {
    input: buildOpenAiInput(imageFiles, prompt)
  });

  const rawText = extractOpenAiOutputText(generated.response);
  if (!rawText) {
    throw new Error('備用圖片讀取服務沒有回傳可用內容，請貼上圖片中的文字或換一張更清楚的圖片。');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const wrapped = new Error('備用圖片讀取服務回傳格式異常，請貼上圖片中的文字或稍後再試。');
    wrapped.cause = error;
    throw wrapped;
  }

  const items = normalizeParsedItems(parsed.items, imageFiles.length, parsed.addonSection);
  if (items.length === 0) {
    const error = new Error('圖片中沒有辨識到可用的品名與價格');
    error.statusCode = 422;
    throw error;
  }

  const taskRouter = buildRoomTaskRouter({
    taskType: options.taskRouter?.selectedTaskType || options.taskRouter?.taskType || options.taskType,
    localOcrText: options.localOcrText,
    items
  });
  const parseQuality = evaluateMenuParseQuality({
    items,
    menuType: normalizeMenuType(parsed.menuType, items),
    taskRouter
  });

  return {
    items,
    menuType: normalizeMenuType(parsed.menuType, items),
    provider: 'openai',
    modelUsed: generated.model,
    warnings: [],
    parseQuality,
    taskRouter
  };
}

async function generateLocalVisionMenuContent(request) {
  if (!localVisionBaseUrl || !localVisionModel) {
    const error = new Error('本地視覺模型尚未設定 LOCAL_VISION_BASE_URL 與 LOCAL_VISION_MODEL。');
    error.statusCode = 503;
    throw error;
  }

  const endpoint = buildOpenAiCompatibleUrl(
    localVisionBaseUrl,
    localVisionApiStyle === 'responses' ? '/v1/responses' : '/v1/chat/completions'
  );
  const headers = {
    'Content-Type': 'application/json'
  };
  if (localVisionApiKey) {
    headers.Authorization = `Bearer ${localVisionApiKey}`;
  }
  const body = localVisionApiStyle === 'responses'
    ? {
      model: localVisionModel,
      input: request.input,
      text: {
        format: {
          type: 'json_object'
        }
      },
      max_output_tokens: localVisionMaxOutputTokens,
      store: false
    }
    : {
      model: localVisionModel,
      messages: request.messages,
      temperature: 0.1,
      max_tokens: localVisionMaxOutputTokens,
      response_format: {
        type: 'json_object'
      }
    };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, localVisionTimeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok) {
      const message = responseBody?.error?.message || response.statusText || 'Local Vision API request failed';
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }
    return {
      response: responseBody,
      model: localVisionModel,
      apiStyle: localVisionApiStyle
    };
  } catch (error) {
    const wrapped = error?.name === 'AbortError'
      ? Object.assign(new Error(`Local Vision 解析超過 ${Math.round(localVisionTimeoutMs / 1000)} 秒，已停止等待。`), { statusCode: 504 })
      : error;
    throw wrapped;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractLocalVisionOutputText(response, apiStyle = localVisionApiStyle) {
  if (apiStyle === 'responses') {
    return extractOpenAiOutputText(response);
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

async function parseMenuImagesWithLocalVision(imageFiles, options = {}) {
  const prompt = buildMenuParsePrompt(options);
  const generated = await generateLocalVisionMenuContent({
    input: buildOpenAiInput(imageFiles, prompt, localVisionImageDetail),
    messages: buildOpenAiCompatibleChatMessages(imageFiles, prompt, localVisionImageDetail)
  });
  const rawText = extractLocalVisionOutputText(generated.response, generated.apiStyle);
  const parsed = extractJsonObjectFromText(rawText, 'Local Vision');
  const items = normalizeParsedItems(parsed.items, imageFiles.length, parsed.addonSection);
  if (items.length === 0) {
    const error = new Error('Local Vision 沒有辨識到可用的品名與價格');
    error.statusCode = 422;
    throw error;
  }

  const taskRouter = buildRoomTaskRouter({
    taskType: options.taskRouter?.selectedTaskType || options.taskRouter?.taskType || options.taskType,
    localOcrText: options.localOcrText,
    items
  });
  const parseQuality = evaluateMenuParseQuality({
    items,
    menuType: normalizeMenuType(parsed.menuType, items),
    taskRouter,
    localOcrText: options.localOcrText
  });

  return {
    items,
    menuType: normalizeMenuType(parsed.menuType, items),
    provider: 'local_vision',
    modelUsed: generated.model,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean).slice(0, 12) : [],
    parseQuality,
    taskRouter
  };
}

function buildLocalOcrFallbackWarnings(warnings = []) {
  const fallbackWarning = 'Photo text was read, but the host should compare the photo before opening it to members.';
  return Array.from(new Set([...(Array.isArray(warnings) ? warnings : []), fallbackWarning].map(String).filter(Boolean)));
}

function forceLocalOcrFallbackReviewQuality(parseQuality) {
  const quality = parseQuality && typeof parseQuality === 'object' ? parseQuality : {};
  const fallbackIssue = {
    type: localOcrOnlyReviewIssueId,
    severity: 'high',
    detail: 'Photo text was read, but the host should compare the photo before opening it to members.'
  };
  const currentIssues = Array.isArray(quality.issues) ? quality.issues : [];
  const issues = [
    fallbackIssue,
    ...currentIssues.filter((issue) => issue?.type !== localOcrOnlyReviewIssueId)
  ].slice(0, 20);
  const blockingReasons = Array.from(new Set([
    localOcrOnlyReviewIssueId,
    ...(Array.isArray(quality.blockingReasons) ? quality.blockingReasons : [])
  ]));
  const highIssueCount = issues.filter((issue) => issue.severity === 'high').length;
  const mediumIssueCount = issues.filter((issue) => issue.severity === 'medium').length;
  return {
    ...quality,
    status: 'review_required',
    issueCount: issues.length,
    highIssueCount: Math.max(highIssueCount, 1),
    mediumIssueCount,
    issues,
    blockingReasons,
    requiresHostReview: true
  };
}

async function parseMenuImages(files, options = {}) {
  const imageFiles = Array.isArray(files) && files.length > 0 ? files.slice(0, 1) : [];
  if (imageFiles.length === 0) {
    const error = new Error('請上傳一張價格證據圖片');
    error.statusCode = 400;
    throw error;
  }

  const localOcr = parseLocalOcrMenuCandidates(options.localOcrText, imageFiles.length, {
    taskType: options.taskType
  });
  const initialTaskRouter = buildRoomTaskRouter({
    taskType: options.taskType,
    localOcrText: options.localOcrText,
    items: localOcr.items
  });
  const localQuality = evaluateMenuParseQuality({
    items: localOcr.items,
    menuType: localOcr.menuType,
    taskRouter: initialTaskRouter,
    localOcr: localOcr.metrics,
    localOcrText: options.localOcrText
  });
  const localFallback = localOcr.items.length > 0
    ? {
      items: localOcr.items,
      menuType: localOcr.menuType,
      provider: 'local_ocr_fallback',
      modelUsed: 'deterministic-ocr-text-parser',
      warnings: buildLocalOcrFallbackWarnings(['已先用你貼上的文字建立房間，請確認品名、價格與規格。']),
      parseQuality: forceLocalOcrFallbackReviewQuality(localQuality),
      localOcr: localOcr.metrics,
      taskRouter: initialTaskRouter
    }
    : null;
  const candidates = getConfiguredProviderCandidates();
  if (candidates.length === 0) {
    if (localFallback && localFallback.items.length >= localOcrMinItems) {
      return localFallback;
    }
    const error = new Error('這張圖片暫時讀不出足夠項目。請貼上圖片中的文字，或先用右側 WebMCP/Codex 協作審查補成草稿。');
    error.statusCode = 500;
    throw error;
  }

  let lastError = null;
  for (const provider of candidates) {
    try {
      if (provider === 'local_vision') {
        const parsed = await parseMenuImagesWithLocalVision(imageFiles, {
          localOcrText: options.localOcrText,
          localOcrCandidates: localOcr.items,
          taskRouter: initialTaskRouter
        });
        parsed.localOcr = localOcr.metrics;
        parsed.parseQuality = evaluateMenuParseQuality({
          items: parsed.items,
          menuType: parsed.menuType,
          taskRouter: parsed.taskRouter,
          localOcr: localOcr.metrics,
          localOcrText: options.localOcrText
        });
        return parsed;
      }
      if (provider === 'gemini') {
        const parsed = await parseMenuImagesWithGemini(imageFiles, {
          localOcrText: options.localOcrText,
          localOcrCandidates: localOcr.items,
          taskRouter: initialTaskRouter
        });
        parsed.localOcr = localOcr.metrics;
        parsed.parseQuality = evaluateMenuParseQuality({
          items: parsed.items,
          menuType: parsed.menuType,
          taskRouter: parsed.taskRouter,
          localOcr: localOcr.metrics,
          localOcrText: options.localOcrText
        });
        return parsed;
      }
      if (provider === 'openai') {
        const parsed = await parseMenuImagesWithOpenAi(imageFiles, {
          localOcrText: options.localOcrText,
          localOcrCandidates: localOcr.items,
          taskRouter: initialTaskRouter
        });
        parsed.localOcr = localOcr.metrics;
        parsed.parseQuality = evaluateMenuParseQuality({
          items: parsed.items,
          menuType: parsed.menuType,
          taskRouter: parsed.taskRouter,
          localOcr: localOcr.metrics,
          localOcrText: options.localOcrText
        });
        return parsed;
      }
    } catch (error) {
      lastError = error;
      const statusCode = Number(error.statusCode || error.status || error.code || 0);
      writeLog('error', 'provider_parse_failed', {
        provider,
        statusCode,
        message: error.message
      });
      if (provider === 'local_vision' && !allowRemoteVisionFallback) {
        writeLog('warn', 'local_vision_remote_fallback_blocked', {
          statusCode,
          hasLocalOcrFallback: Boolean(localFallback)
        });
        break;
      }
      if (!shouldFallbackToNextProvider(error)) {
        throw error;
      }
    }
  }

  if (localFallback && localFallback.items.length >= localOcrMinItems) {
    return localFallback;
  }

  const error = new Error(`所有 AI 解析來源都失敗。最後錯誤：${lastError?.message || '未知錯誤'}`);
  error.statusCode = Number(lastError?.statusCode || 503);
  throw error;
}

function cleanupExpiredRooms() {
  const now = Date.now();
  let deletedCount = 0;
  for (const [roomId, room] of rooms.entries()) {
    if (now - Date.parse(room.updatedAt) > roomTtlMs) {
      rooms.delete(roomId);
      deletedCount += 1;
      writeLog('info', 'expired_room_deleted', { roomId });
    }
  }
  if (deletedCount > 0) {
    persistRooms('expired_room_cleanup');
  }
}

app.get('/healthz', (req, res) => {
  const { apiKey: geminiApiKey, keyName: geminiKeyName } = getGeminiApiKeyConfig();
  const { apiKey: openAiApiKey, keyName: openAiKeyName } = getOpenAiApiKeyConfig();
  res.json({
    ok: true,
    rooms: rooms.size,
    providerOrder: aiProviderOrder,
    activeProviderCandidates: getConfiguredProviderCandidates(),
    localVisionConfigured: Boolean(localVisionBaseUrl && localVisionModel),
    allowRemoteVisionFallback,
    geminiModel,
    geminiFallbackModels: getGeminiModelCandidates().slice(1),
    geminiRetryAttempts,
    geminiTimeoutMs,
    openAiModel,
    openAiFallbackModels: getOpenAiModelCandidates().slice(1),
    openAiTimeoutMs,
    openAiMaxOutputTokens,
    openAiImageDetail,
    imageMaxDimension,
    imageJpegQuality,
    itemThumbSize,
    localOcrMaxChars,
    localOcrFirst,
    localOcrMinItems,
    rateLimitWindowMs,
    apiRateLimitMax,
    roomCreateRateLimitMax,
    menuParseRateLimitMax,
    roomPersistenceEnabled,
    roomStorePath,
    roomStoreVersion,
    roomPersistDebounceMs,
    roomPersistJitterMs,
    evidenceContractVersion,
    serviceBlueprintContractVersion,
    serviceBlueprintArchetypes: buildServiceBlueprintContract().archetypes,
    trustLayerConfigured: Boolean(trustLayerSpreadsheetId),
    trustLayerContractVersion,
    webMcpToolSurfaceVersion,
    hasGeminiKey: Boolean(geminiApiKey),
    geminiKeyName,
    hasOpenAiKey: Boolean(openAiApiKey),
    openAiKeyName,
    time: nowIso()
  });
});

process.on('SIGINT', () => {
  flushRoomPersistQueue('process_sigint');
  process.exit(0);
});

process.on('SIGTERM', () => {
  flushRoomPersistQueue('process_sigterm');
  process.exit(0);
});

app.post('/api/rooms', createRateLimitMiddleware('room_create', roomCreateRateLimitMax), (req, res) => {
  const room = createRoom();
  writeLog('info', 'room_created', { roomId: room.id });
  res.status(201).json(serializeRoom(room));
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: '找不到房間，請重新建立共享空間' });
    return;
  }
  touchRoom(room, 'room_read', false);
  res.json(serializeRoom(room));
});

app.get('/api/rooms/:roomId/export.html', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found. Create a new shared room first.' });
    return;
  }
  const state = serializeRoom(room);
  if (!state.menuLoaded || Number(state.totals?.grandTotal || 0) <= 0) {
    res.status(409).json({ error: 'The room needs reviewed items and at least one confirmed cost before export.' });
    return;
  }
  const language = getExportLanguage(req.query?.lang);
  const filename = `shared-room-${sanitizeExportFilename(room.id)}.html`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buildRoomExportHtml(room, language));
});

app.get('/api/rooms/:roomId/export.pdf', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found. Create a new shared room first.' });
    return;
  }
  const state = serializeRoom(room);
  if (!state.menuLoaded || Number(state.totals?.grandTotal || 0) <= 0) {
    res.status(409).json({ error: 'The room needs reviewed items and at least one confirmed cost before export.' });
    return;
  }
  const language = getExportLanguage(req.query?.lang);
  const filename = `shared-room-${sanitizeExportFilename(room.id)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buildRoomExportPdf(room, language));
});

app.post('/api/rooms/:roomId/agent-proposals', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: '找不到房間，請重新建立共享空間' });
    return;
  }
  const requesterId = String(req.body?.participantId || '');
  if (!requesterId || room.ownerParticipantId !== requesterId) {
    res.status(403).json({ error: '只有發起者可以建立建議草稿' });
    return;
  }

  const normalizedInput = normalizeAgentProposalInput(req.body || {});
  const proposalValidation = validateExternalAgentProposalInput(normalizedInput);
  if (!proposalValidation.ok) {
    res.status(proposalValidation.statusCode).json({ error: proposalValidation.error });
    return;
  }

  const proposal = createAgentProposal(room, normalizedInput);
  const state = serializeRoom(room);
  io.to(room.id).emit('roomState', state);
  writeLog('info', 'agent_proposal_created', {
    roomId: room.id,
    proposalId: proposal.id,
    proposalType: proposal.proposalType,
    riskLevel: proposal.riskLevel
  });
  res.status(201).json({
    ok: true,
    proposal,
    room: state
  });
});

app.post('/api/rooms/:roomId/sample', createRateLimitMiddleware('room_sample', roomCreateRateLimitMax), async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found. Create a new shared room first.' });
    return;
  }

  const requesterId = String(req.body?.participantId || '');
  if (!requesterId || requesterId.length > 80) {
    res.status(400).json({ error: 'A valid participant is required before loading the sample room.' });
    return;
  }
  if (room.ownerParticipantId && room.ownerParticipantId !== requesterId) {
    res.status(403).json({ error: 'Only the room owner can load the sample room.' });
    return;
  }
  if (room.menuLoaded || room.items.length > 0 || room.agentProposals.length > 0) {
    res.status(409).json({ error: 'This room already has data. Create a new room before loading the sample.' });
    return;
  }

  try {
    const { proposal } = await loadSampleRoom(room, {
      participantId: requesterId,
      displayName: req.body?.displayName || 'Demo Host',
      language: req.body?.language,
      taskType: req.body?.taskType
    });
    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'sample_room_loaded', {
      roomId: room.id,
      proposalId: proposal.id,
      itemCount: room.items.length,
      taskType: room.taskRouter?.taskType || null,
      sampleId: room.localOcr?.sampleId || null,
      language: room.localOcr?.language || null,
      contractId: room.localOcr?.contractId || null
    });
    res.status(201).json({
      ok: true,
      proposal,
      room: state
    });
  } catch (error) {
    writeLog('error', 'sample_room_load_failed', {
      roomId: room.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to load a page-matched sample room.' });
  }
});

app.post('/api/rooms/:roomId/menu', createRateLimitMiddleware('menu_parse', menuParseRateLimitMax), upload.single('menuImage'), async (req, res, next) => {
  try {
    const room = getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: '找不到房間，請重新建立共享空間' });
      return;
    }
    if (room.menuLoaded) {
      res.status(409).json({ error: '此房間已經解析過價格證據，不會重複解析圖片。請先清空房間再上傳新證據。' });
      return;
    }
    const uploadedFiles = req.file ? [req.file] : [];
    if (uploadedFiles.length === 0) {
      res.status(400).json({ error: '請上傳一張價格證據圖片' });
      return;
    }

    const localOcrText = normalizeLocalOcrText(req.body?.ocrText);
    const requestedTaskType = normalizeRoomTaskType(req.body?.taskType);
    const preparedImages = await Promise.all(uploadedFiles.map((file) => prepareMenuImage(file)));
    const parsed = await parseMenuImages(preparedImages, {
      localOcrText,
      taskType: requestedTaskType
    });
    room.menuType = parsed.menuType;
    room.menuMode = 'auto';
    room.taskRouter = parsed.taskRouter || buildRoomTaskRouter({
      taskType: requestedTaskType,
      localOcrText,
      items: parsed.items
    });
    room.warnings = parsed.warnings;
    room.evidenceReviewSource = parsed.provider || null;
    room.evidenceReviewModel = parsed.modelUsed || null;
    room.parseQuality = parsed.parseQuality || evaluateMenuParseQuality({
      items: parsed.items,
      menuType: parsed.menuType,
      taskRouter: room.taskRouter
    });
    room.localOcr = parsed.localOcr || parseLocalOcrMenuCandidates(localOcrText, preparedImages.length, {
      taskType: requestedTaskType
    }).metrics;
    room.menuImages = preparedImages.map((image, index) => ({
      index,
      buffer: image.buffer,
      mimeType: image.mimetype,
      width: image.processedWidth,
      height: image.processedHeight,
      originalBytes: image.originalBytes,
      processedBytes: image.processedBytes
    }));
    room.menuImageBuffer = preparedImages[0].buffer;
    room.menuImageMimeType = preparedImages[0].mimetype;
    room.menuImageWidth = preparedImages[0].processedWidth;
    room.menuImageHeight = preparedImages[0].processedHeight;
    room.itemImageCache = new Map();
    applyEvidenceReviewLayers(room, parsed.items, {
      images: room.menuImages,
      localOcrText,
      taskType: room.taskRouter?.taskType || requestedTaskType,
      scenarioContractId: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
      evidenceKind: 'uploaded_image',
      sourceLabel: 'uploaded price evidence',
      ocrSource: localOcrText ? 'user_pasted_text' : 'local_ocr'
    });
    room.menuLoaded = true;
    room.itemsOpenForMembers = false;
    room.settled = false;
    room.settledAt = null;
    room.settledBy = null;
    room.parsedAt = nowIso();
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'menu_parsed', {
      roomId: room.id,
      providerUsed: parsed.provider,
      modelUsed: parsed.modelUsed,
      menuType: room.menuType,
      taskType: room.taskRouter?.taskType || null,
      taskRouterReviewStatus: room.taskRouter?.reviewStatus || null,
      itemCount: room.items.length,
      warningCount: room.warnings.length,
      parseQualityStatus: room.parseQuality?.status || null,
      parseQualityIssueCount: room.parseQuality?.issueCount || 0,
      localOcrEnabled: Boolean(room.localOcr?.enabled),
      localOcrCandidateCount: room.localOcr?.candidateCount || 0,
      imageCount: preparedImages.length,
      originalBytes: preparedImages.reduce((sum, image) => sum + image.originalBytes, 0),
      processedBytes: preparedImages.reduce((sum, image) => sum + image.processedBytes, 0),
      processedInMs: preparedImages.reduce((sum, image) => sum + image.processedInMs, 0)
    });
    res.json(state);
  } catch (error) {
    next(error);
  }
});

app.get('/api/rooms/:roomId/menu-image', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room || !room.menuImageBuffer || !room.menuImageMimeType) {
    res.status(404).json({ error: '找不到價格證據圖片' });
    return;
  }

  res.setHeader('Content-Type', room.menuImageMimeType);
  res.setHeader('Cache-Control', 'no-store');
  res.send(room.menuImageBuffer);
});

app.get('/api/rooms/:roomId/menu-images/:imageIndex', (req, res) => {
  const room = getRoom(req.params.roomId);
  const imageIndex = Number(req.params.imageIndex);
  const image = Number.isInteger(imageIndex) && Array.isArray(room?.menuImages)
    ? room.menuImages[imageIndex]
    : null;
  if (!image?.buffer || !image?.mimeType) {
    res.status(404).json({ error: '找不到價格證據圖片' });
    return;
  }

  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Cache-Control', 'no-store');
  res.send(image.buffer);
});

app.get('/api/rooms/:roomId/items/:itemId/thumb', async (req, res, next) => {
  try {
    const room = getRoom(req.params.roomId);
    const item = room?.items.find((candidate) => candidate.id === req.params.itemId);
    if (!room || !item || !item.hasImage) {
      res.status(404).json({ error: '此品項沒有可裁切商品圖' });
      return;
    }

    const thumbnail = await buildItemThumbnail(room, item);
    if (!thumbnail) {
      res.status(404).json({ error: '此品項沒有可裁切商品圖' });
      return;
    }

    res.setHeader('Content-Type', thumbnail.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(thumbnail.buffer);
  } catch (error) {
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.on('joinRoom', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room) {
      ack?.({ ok: false, error: '找不到房間，請重新建立共享空間' });
      return;
    }

    const participant = ensureParticipant(room, payload?.participantId, payload?.displayName);
    if (!room.ownerParticipantId) {
      room.ownerParticipantId = participant.id;
    }
    const alreadyJoinedSameParticipant = socket.data.roomId === room.id
      && socket.data.participantId === participant.id;

    if (socket.data.roomId && !alreadyJoinedSameParticipant) {
      const previousRoom = getRoom(socket.data.roomId);
      const previousParticipant = previousRoom?.participants.get(socket.data.participantId);
      if (previousParticipant) {
        previousParticipant.connectedCount = Math.max(0, previousParticipant.connectedCount - 1);
        previousParticipant.updatedAt = nowIso();
        removeInactiveParticipant(previousRoom, previousParticipant.id);
        touchRoom(previousRoom);
        io.to(previousRoom.id).emit('presenceState', serializeRoom(previousRoom));
      }
      socket.leave(socket.data.roomId);
    }

    if (!alreadyJoinedSameParticipant) {
      participant.connectedCount += 1;
    }
    participant.updatedAt = nowIso();
    touchRoom(room);

    socket.data.roomId = room.id;
    socket.data.participantId = participant.id;
    socket.join(room.id);

    const state = serializeRoom(room);
    socket.emit('roomState', state);
    io.to(room.id).emit('presenceState', state);
    ack?.({ ok: true, participantId: participant.id, room: state });
  });

  socket.on('setItemQty', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再修改數量' });
      return;
    }
    if (!room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '發起者尚未開放清單，請先等待確認' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    const participant = room.participants.get(participantId);
    if (!participant) {
      ack?.({ ok: false, error: '請先輸入名稱並加入房間' });
      return;
    }
    if (!hasUsableDisplayName(participant.displayName)) {
      ack?.({ ok: false, error: '請先輸入名稱再選擇項目' });
      return;
    }
    if (participant.confirmed) {
      ack?.({ ok: false, error: '個人費用已確認，請先取消確認再修改數量' });
      return;
    }

    const item = room.items.find((candidate) => candidate.id === payload?.itemId);
    if (!item) {
      ack?.({ ok: false, error: '找不到品項' });
      return;
    }

    const qty = normalizeQty(payload?.qty);
    if (qty === 0) {
      delete participant.order[item.id];
    } else {
      const previousEntry = normalizeOrderEntry(participant.order[item.id], item);
      participant.order[item.id] = {
        qty,
        sweetness: previousEntry.sweetness,
        ice: previousEntry.ice,
        options: previousEntry.options
      };
    }
    participant.confirmed = false;
    participant.confirmedAt = null;
    participant.updatedAt = nowIso();
    removeInactiveParticipant(room, participant.id);
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    ack?.({ ok: true, room: state });
  });

  socket.on('setDrinkOption', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再修改甜度冰塊' });
      return;
    }
    if (!room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '發起者尚未開放清單，請先等待確認' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    const participant = room.participants.get(participantId);
    if (!participant) {
      ack?.({ ok: false, error: '請先輸入名稱並加入房間' });
      return;
    }
    if (!hasUsableDisplayName(participant.displayName)) {
      ack?.({ ok: false, error: '請先輸入名稱再選甜度冰塊' });
      return;
    }
    if (participant.confirmed) {
      ack?.({ ok: false, error: '個人費用已確認，請先取消確認再修改甜度冰塊' });
      return;
    }

    const item = room.items.find((candidate) => candidate.id === payload?.itemId);
    if (!item) {
      ack?.({ ok: false, error: '找不到品項' });
      return;
    }
    if (!itemUsesDrinkOptions(room, item)) {
      ack?.({ ok: false, error: '目前是一般項目模式，此項目不需要甜度冰塊' });
      return;
    }

    const entry = normalizeOrderEntry(participant.order[item.id], item);
    if (entry.qty <= 0) {
      ack?.({ ok: false, error: '請先增加數量，再選甜度冰塊' });
      return;
    }

    const optionType = String(payload?.optionType || '');
    if (optionType === 'sweetness') {
      entry.sweetness = normalizeDrinkOption(payload?.value, sweetnessOptions, entry.sweetness);
    } else if (optionType === 'ice') {
      entry.ice = normalizeDrinkOption(payload?.value, iceOptions, entry.ice);
    } else {
      ack?.({ ok: false, error: '不支援的飲料選項' });
      return;
    }

    participant.order[item.id] = entry;
    participant.updatedAt = nowIso();
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    ack?.({ ok: true, room: state });
  });

  socket.on('setItemOption', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再修改選項' });
      return;
    }
    if (!room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '發起者尚未開放清單，請先等待確認' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    const participant = room.participants.get(participantId);
    if (!participant) {
      ack?.({ ok: false, error: '請先輸入名稱並加入房間' });
      return;
    }
    if (!hasUsableDisplayName(participant.displayName)) {
      ack?.({ ok: false, error: '請先輸入名稱再選品項選項' });
      return;
    }
    if (participant.confirmed) {
      ack?.({ ok: false, error: '個人費用已確認，請先取消確認再修改選項' });
      return;
    }

    const item = room.items.find((candidate) => candidate.id === payload?.itemId);
    if (!item) {
      ack?.({ ok: false, error: '找不到品項' });
      return;
    }

    const groupId = String(payload?.groupId || '');
    const optionId = String(payload?.optionId || '');
    const group = Array.isArray(item.optionGroups)
      ? item.optionGroups.find((candidate) => candidate.id === groupId)
      : null;
    const option = group?.options?.find((candidate) => candidate.id === optionId);
    if (!group || !option) {
      ack?.({ ok: false, error: '找不到選項' });
      return;
    }

    const entry = normalizeOrderEntry(participant.order[item.id], item);
    if (entry.qty <= 0) {
      ack?.({ ok: false, error: '請先增加數量，再選品項選項' });
      return;
    }

    if (groupUsesMultipleSelection(group)) {
      const selected = Array.isArray(entry.options[group.id]) ? entry.options[group.id] : [];
      const shouldSelect = payload?.selected !== false;
      if (shouldSelect && !selected.includes(option.id)) {
        selected.push(option.id);
      }
      if (!shouldSelect) {
        const index = selected.indexOf(option.id);
        if (index >= 0) {
          selected.splice(index, 1);
        }
      }
      entry.options[group.id] = selected;
    } else {
      entry.options[group.id] = option.id;
    }
    participant.order[item.id] = normalizeOrderEntry(entry, item);
    participant.confirmed = false;
    participant.confirmedAt = null;
    participant.updatedAt = nowIso();
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    ack?.({ ok: true, room: state });
  });

  socket.on('setMenuMode', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再切換項目模式' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    if (!participantId || room.ownerParticipantId !== participantId) {
      ack?.({ ok: false, error: '只有發起者可以切換項目模式' });
      return;
    }

    room.menuMode = normalizeMenuMode(payload?.menuMode);
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'menu_mode_changed', {
      roomId: room.id,
      menuMode: room.menuMode
    });
    ack?.({ ok: true, room: state });
  });

  socket.on('openItemsForMembers', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再開放項目' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    if (!participantId || room.ownerParticipantId !== participantId) {
      ack?.({ ok: false, error: '只有發起者可以開放清單' });
      return;
    }
    if (!Array.isArray(room.items) || room.items.length === 0) {
      ack?.({ ok: false, error: '沒有可開放的品項' });
      return;
    }
    const evidenceReviewBlock = getEvidenceReviewReleaseBlock(room);
    if (evidenceReviewBlock) {
      appendGuardrailMemoryEvent({
        eventType: 'open_members_blocked',
        roomId: room.id,
        taskType: room.taskRouter?.taskType || null,
        scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        blockingReasons: [evidenceReviewBlock.id],
        issueTypes: [evidenceReviewBlock.id]
      });
      ack?.({ ok: false, error: '照片草稿還沒有完成看圖核對，不能開放給成員。' });
      return;
    }
    const antiPollutionBlocks = getAntiPollutionBlocks(room);
    if (antiPollutionBlocks.length > 0) {
      appendGuardrailMemoryEvent({
        eventType: 'open_members_blocked',
        roomId: room.id,
        taskType: room.taskRouter?.taskType || null,
        scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        blockingReasons: antiPollutionBlocks.map((block) => block.id),
        issueTypes: antiPollutionBlocks.map((block) => block.id)
      });
      ack?.({ ok: false, error: `清單仍有 ${antiPollutionBlocks.length} 個項目或費用規則需要核對，請先處理後再開放給成員。` });
      return;
    }
    room.parseQuality = evaluateMenuParseQuality({
      items: room.items,
      menuType: room.menuType,
      taskRouter: room.taskRouter
    });
    const recomputedEvidenceReviewBlock = getEvidenceReviewReleaseBlock(room);
    if (recomputedEvidenceReviewBlock) {
      room.parseQuality = forceLocalOcrFallbackReviewQuality(room.parseQuality);
      appendGuardrailMemoryEvent({
        eventType: 'open_members_blocked',
        roomId: room.id,
        taskType: room.taskRouter?.taskType || null,
        scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        blockingReasons: [recomputedEvidenceReviewBlock.id],
        issueTypes: [recomputedEvidenceReviewBlock.id]
      });
      ack?.({ ok: false, error: '照片草稿還沒有完成看圖核對，不能開放給成員。' });
      return;
    }
    if (hasBlockingParseQuality(room)) {
      appendGuardrailMemoryEvent({
        eventType: 'open_members_blocked',
        roomId: room.id,
        taskType: room.taskRouter?.taskType || null,
        scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        blockingReasons: room.parseQuality?.blockingReasons || [],
        issueTypes: Array.isArray(room.parseQuality?.issues)
          ? room.parseQuality.issues.map((issue) => issue.type).filter(Boolean)
          : []
      });
      ack?.({ ok: false, error: 'AI 複查發現高風險解析問題，請先修正清單後再開放給成員。' });
      return;
    }

    room.itemsOpenForMembers = true;
    touchRoom(room, 'items_opened_for_members');

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'items_opened_for_members', {
      roomId: room.id,
      openedBy: participantId,
      itemCount: room.items.length
    });
    ack?.({ ok: true, room: state });
  });

  socket.on('updateParsedItem', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再修正品項' });
      return;
    }
    if (room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '清單已開放給成員，不能再修正品項' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    if (!participantId || room.ownerParticipantId !== participantId) {
      ack?.({ ok: false, error: '只有發起者可以修正解析結果' });
      return;
    }
    if (roomHasConfirmedParticipant(room)) {
      ack?.({ ok: false, error: '已有成員確認費用，請先取消確認再修正品項' });
      return;
    }

    const item = room.items.find((candidate) => candidate.id === payload?.itemId);
    if (!item) {
      ack?.({ ok: false, error: '找不到品項' });
      return;
    }
    if (getItemClaimQty(room, item.id) > 0) {
      ack?.({ ok: false, error: '此品項已有人選取，請先歸零再修正' });
      return;
    }

    const nextName = normalizeShortText(payload?.name || item.name, 48);
    const nextPrice = Number(payload?.price);
    if (!nextName || shouldDropNonMenuPriceName(nextName)) {
      ack?.({ ok: false, error: '品項名稱不合理，請重新輸入' });
      return;
    }
    if (!Number.isInteger(nextPrice) || nextPrice <= 0 || nextPrice > 100000) {
      ack?.({ ok: false, error: '金額必須是 1 到 100000 之間的整數' });
      return;
    }

    const previousItem = {
      name: item.name,
      price: item.price,
      category: item.category,
      supportsDrinkOptions: item.supportsDrinkOptions,
      priceRole: item.priceRole,
      sourceNumberClass: item.sourceNumberClass,
      reviewFlags: item.reviewFlags,
      rawTextEvidence: item.rawTextEvidence,
      confidence: item.confidence
    };
    const supportsDrinkOptions = typeof payload?.supportsDrinkOptions === 'boolean'
      ? payload.supportsDrinkOptions
      : inferDrinkItem(nextName);
    item.name = nextName;
    item.price = nextPrice;
    item.supportsDrinkOptions = supportsDrinkOptions;
    item.category = normalizeMenuCategory(payload?.category || item.category, nextName, supportsDrinkOptions);
    item.priceRole = normalizePriceRole(payload?.priceRole || item.priceRole, {
      ...item,
      name: nextName,
      price: nextPrice
    }, room.taskRouter?.taskType || room.menuType);
    item.sourceNumberClass = normalizeSourceNumberClass(item.sourceNumberClass, {
      ...item,
      name: nextName,
      priceRole: item.priceRole
    });
    item.sectionName = normalizeShortText(item.sectionName, 32);
    item.sizeLabel = normalizeShortText(item.sizeLabel, 24);
    item.temperature = normalizeTemperature(item.temperature, nextName, supportsDrinkOptions);
    item.spiceLevel = normalizeSpiceLevel(item.spiceLevel, nextName);
    item.tags = normalizeFlagList(item.tags, allowedItemTags, 8);
    item.note = normalizeShortText(item.note, 60);
    item.reviewGates = resolveReviewGatesAfterHostDecision(item.reviewGates, 'modify');
    const linkedCandidate = Array.isArray(room.parserCandidates)
      ? room.parserCandidates.find((candidate) => candidate.proposedItemId === item.id || candidate.id === item.parserCandidateId)
      : null;
    if (linkedCandidate) {
      const previousCandidate = { ...linkedCandidate };
      linkedCandidate.label = item.name;
      linkedCandidate.amount = item.price;
      linkedCandidate.priceRole = item.priceRole;
      linkedCandidate.sourceNumberClass = item.sourceNumberClass;
      linkedCandidate.displaySurface = inferDisplaySurface(item, room.taskRouter?.taskType || room.menuType);
      linkedCandidate.reviewGates = resolveReviewGatesAfterHostDecision(linkedCandidate.reviewGates, 'modify');
      linkedCandidate.status = 'modified';
      linkedCandidate.reviewedAt = nowIso();
      linkedCandidate.reviewedBy = participantId;
      recordReviewDecision(room, {
        candidateId: linkedCandidate.id,
        action: 'modify',
        previousPayload: previousCandidate,
        nextPayload: { ...linkedCandidate },
        reviewerId: participantId,
        reason: 'host edited parsed item before member open'
      });
      room.calculationRules = buildCalculationRulesFromCandidates(room.parserCandidates);
    }
    room.parseQuality = evaluateMenuParseQuality({
      items: room.items,
      menuType: room.menuType,
      taskRouter: room.taskRouter
    });
    touchRoom(room, 'parsed_item_updated');

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'parsed_item_updated', {
      roomId: room.id,
      itemId: item.id,
      updatedBy: participantId
    });
    appendGuardrailMemoryEvent({
      eventType: 'parsed_item_updated',
      roomId: room.id,
      taskType: room.taskRouter?.taskType || null,
      scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
      previousItem,
      nextItem: {
        name: item.name,
        price: item.price,
        category: item.category,
        supportsDrinkOptions: item.supportsDrinkOptions,
        priceRole: item.priceRole,
        sourceNumberClass: item.sourceNumberClass,
        reviewFlags: item.reviewFlags,
        rawTextEvidence: item.rawTextEvidence,
        confidence: item.confidence
      },
      parseQuality: {
        status: room.parseQuality?.status || null,
        issueTypes: Array.isArray(room.parseQuality?.issues)
          ? room.parseQuality.issues.map((issue) => issue.type).filter(Boolean)
          : []
      }
    });
    ack?.({ ok: true, room: state });
  });

  socket.on('removeParsedItem', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再移除品項' });
      return;
    }
    if (room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '清單已開放給成員，不能再移除品項' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    if (!participantId || room.ownerParticipantId !== participantId) {
      ack?.({ ok: false, error: '只有發起者可以移除解析結果' });
      return;
    }
    if (roomHasConfirmedParticipant(room)) {
      ack?.({ ok: false, error: '已有成員確認費用，請先取消確認再移除品項' });
      return;
    }

    const itemId = String(payload?.itemId || '');
    const item = room.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      ack?.({ ok: false, error: '找不到品項' });
      return;
    }
    if (getItemClaimQty(room, itemId) > 0) {
      ack?.({ ok: false, error: '此品項已有人選取，請先歸零再移除' });
      return;
    }

    room.items = room.items.filter((candidate) => candidate.id !== itemId);
    if (Array.isArray(room.parserCandidates)) {
      room.parserCandidates = room.parserCandidates.map((candidate) => {
        if (candidate.proposedItemId !== itemId && candidate.id !== item.parserCandidateId) {
          return candidate;
        }
        const nextCandidate = {
          ...candidate,
          status: 'rejected',
          reviewedAt: nowIso(),
          reviewedBy: participantId
        };
        recordReviewDecision(room, {
          candidateId: candidate.id,
          action: 'reject',
          previousPayload: candidate,
          nextPayload: nextCandidate,
          reviewerId: participantId,
          reason: 'host removed parsed item before member open'
        });
        return nextCandidate;
      });
      room.calculationRules = buildCalculationRulesFromCandidates(room.parserCandidates);
    }
    room.parseQuality = evaluateMenuParseQuality({
      items: room.items,
      menuType: room.menuType,
      taskRouter: room.taskRouter
    });
    touchRoom(room, 'parsed_item_removed');

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'parsed_item_removed', {
      roomId: room.id,
      itemId,
      removedBy: participantId
    });
    appendGuardrailMemoryEvent({
      eventType: 'parsed_item_removed',
      roomId: room.id,
      taskType: room.taskRouter?.taskType || null,
      scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
      removedItem: {
        name: item.name,
        price: item.price,
        category: item.category
      },
      parseQuality: {
        status: room.parseQuality?.status || null,
        issueTypes: Array.isArray(room.parseQuality?.issues)
          ? room.parseQuality.issues.map((issue) => issue.type).filter(Boolean)
          : []
      }
    });
    ack?.({ ok: true, room: state });
  });

  socket.on('confirmOrder', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (room.settled) {
      ack?.({ ok: false, error: '此房間已結算，不能再修改確認狀態' });
      return;
    }
    if (!room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '發起者尚未開放清單，請先等待確認' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    const participant = room.participants.get(participantId);
    if (!participant) {
      ack?.({ ok: false, error: '請先輸入名稱並加入房間' });
      return;
    }
    if (!hasUsableDisplayName(participant.displayName)) {
      ack?.({ ok: false, error: '請先輸入名稱再確認個人費用' });
      return;
    }

    const shouldConfirm = Boolean(payload?.confirmed);
    if (shouldConfirm && !participantHasOrder(room, participant)) {
      ack?.({ ok: false, error: '目前沒有費用項目，不能確認空明細' });
      return;
    }

    participant.confirmed = shouldConfirm;
    participant.confirmedAt = shouldConfirm ? nowIso() : null;
    participant.updatedAt = nowIso();
    removeInactiveParticipant(room, participant.id);
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    ack?.({ ok: true, room: state });
  });

  socket.on('settleRoom', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room || !room.menuLoaded) {
      ack?.({ ok: false, error: '房間尚未建立項目' });
      return;
    }
    if (!room.itemsOpenForMembers) {
      ack?.({ ok: false, error: '清單尚未開放給成員，不能結算' });
      return;
    }

    const participantId = String(payload?.participantId || '');
    if (!participantId || room.ownerParticipantId !== participantId) {
      ack?.({ ok: false, error: '只有發起者可以結算此房間' });
      return;
    }

    const participant = room.participants.get(participantId);
    if (!participant || !hasUsableDisplayName(participant.displayName)) {
      ack?.({ ok: false, error: '發起者請先輸入名稱再結算' });
      return;
    }

    const stateBeforeSettle = serializeRoom(room);
    if (Number(stateBeforeSettle.totals?.grandTotal || 0) <= 0) {
      ack?.({ ok: false, error: '目前沒有任何費用項目，不能結算空明細' });
      return;
    }

    room.settled = true;
    room.settledAt = nowIso();
    room.settledBy = participant.id;
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'room_settled', {
      roomId: room.id,
      settledBy: participant.id,
      total: state.totals.grandTotal
    });
    ack?.({ ok: true, room: state });
  });

  socket.on('reviewAgentProposal', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room) {
      ack?.({ ok: false, error: '找不到房間' });
      return;
    }

    const reviewerId = String(payload?.participantId || '');
    if (!reviewerId || room.ownerParticipantId !== reviewerId) {
      ack?.({ ok: false, error: '只有發起者可以決定建議草稿' });
      return;
    }

    const proposalId = String(payload?.proposalId || '');
    const action = String(payload?.action || '');
    const nextStatus = action === 'accept'
      ? 'accepted_by_host'
      : action === 'reject'
        ? 'rejected_by_host'
        : '';
    if (!nextStatus) {
      ack?.({ ok: false, error: '不支援的草稿審核動作' });
      return;
    }

    const proposals = Array.isArray(room.agentProposals) ? room.agentProposals : [];
    const proposal = proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal) {
      ack?.({ ok: false, error: '找不到建議草稿' });
      return;
    }
    if (proposal.status !== 'pending_host_confirmation') {
      ack?.({ ok: false, error: '這份建議草稿已處理' });
      return;
    }
    const reviewProposalTypes = ['semantic_repair_draft', 'evidence_review', 'task_router_review'];
    const isReviewProposal = reviewProposalTypes.includes(String(proposal.proposalType || ''));
    const willApplyVisualReviewProposal = action === 'accept' && shouldApplyStructuredDraftProposal(proposal);
    const clearsLocalOcrOnlyBlock = action === 'accept'
      && isLlmVisualReviewBackedSemanticProposal(proposal)
      && hasOnlyLocalOcrOnlyReviewBlock(room);
    if (action === 'accept' && isReviewProposal && hasBlockingParseQuality(room) && !clearsLocalOcrOnlyBlock && !willApplyVisualReviewProposal) {
      appendGuardrailMemoryEvent({
        eventType: 'proposal_accept_blocked',
        roomId: room.id,
        proposalId,
        proposalType: proposal.proposalType || null,
        taskType: room.taskRouter?.taskType || null,
        scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
        blockingReasons: room.parseQuality?.blockingReasons || [],
        issueTypes: Array.isArray(room.parseQuality?.issues)
          ? room.parseQuality.issues.map((issue) => issue.type).filter(Boolean)
          : []
      });
      ack?.({ ok: false, error: 'AI 複查發現高風險解析問題，請先修正清單後再確認草稿。' });
      return;
    }
    if (action === 'accept' && isReviewProposal) {
      const structuralBlocks = getStructuralReviewBlocks(room);
      if (structuralBlocks.length > 0 && !willApplyVisualReviewProposal) {
        appendGuardrailMemoryEvent({
          eventType: 'proposal_accept_blocked',
          roomId: room.id,
          proposalId,
          proposalType: proposal.proposalType || null,
          taskType: room.taskRouter?.taskType || null,
          scenarioContract: room.parseQuality?.adaptiveConfidence?.featureProfile?.scenarioContract || null,
          blockingReasons: structuralBlocks.map((block) => block.id),
          issueTypes: structuralBlocks.flatMap((block) => block.gateIds || [])
        });
        ack?.({ ok: false, error: '有結構性風險欄位必須先修改或移除，不能只按同意放行。' });
        return;
      }
    }
    let acceptedCandidateCount = 0;
    let appliedStructuredDraftCount = 0;
    if (action === 'accept' && isReviewProposal) {
      appliedStructuredDraftCount = applyAcceptedVisualReviewProposal(room, proposal, reviewerId);
      acceptedCandidateCount = appliedStructuredDraftCount > 0
        ? appliedStructuredDraftCount
        : acceptPendingParserCandidates(room, reviewerId, `proposal ${proposalId} accepted by host`);
    }
    if (clearsLocalOcrOnlyBlock && appliedStructuredDraftCount === 0) {
      room.evidenceReviewSource = 'local_vision_bridge';
      room.evidenceReviewModel = normalizeBoundedText(proposal.payload?.localVision?.model, 120) || 'local_vision_bridge';
      room.parseQuality = stripLocalOcrOnlyReviewBlock(room.parseQuality);
    }

    proposal.status = nextStatus;
    proposal.reviewedAt = nowIso();
    proposal.reviewedBy = reviewerId;
    room.agentProposals = proposals.map((candidate) => serializeAgentProposal(candidate));
    touchRoom(room, 'agent_proposal_reviewed');

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'agent_proposal_reviewed', {
      roomId: room.id,
      proposalId,
      status: nextStatus,
      reviewedBy: reviewerId,
      acceptedCandidateCount,
      appliedStructuredDraftCount
    });
    ack?.({ ok: true, room: state });
  });

  socket.on('resetRoom', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room) {
      ack?.({ ok: false, error: '找不到房間' });
      return;
    }
    const participantId = String(payload?.participantId || '');
    if (!participantId || room.ownerParticipantId !== participantId) {
      ack?.({ ok: false, error: '只有發起者可以清空此房間' });
      return;
    }

    room.menuLoaded = false;
    room.itemsOpenForMembers = false;
    room.items = [];
    room.evidenceAssets = [];
    room.ocrObservations = [];
    room.parserCandidates = [];
    room.calculationRules = [];
    room.reviewDecisions = [];
    room.settlementSnapshots = [];
    room.menuType = 'general';
    room.menuMode = 'auto';
    room.taskRouter = { ...defaultTaskRouter };
    room.warnings = [];
    room.parseQuality = null;
    room.evidenceReviewSource = null;
    room.evidenceReviewModel = null;
    room.localOcr = {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0,
      ruleLineCount: 0,
      ruleHints: []
    };
    room.menuImages = [];
    room.menuImageBuffer = null;
    room.menuImageMimeType = null;
    room.menuImageWidth = null;
    room.menuImageHeight = null;
    room.itemImageCache = new Map();
    room.settled = false;
    room.settledAt = null;
    room.settledBy = null;
    room.agentProposals = [];
    room.parsedAt = null;
    for (const participant of room.participants.values()) {
      participant.order = {};
      participant.confirmed = false;
      participant.confirmedAt = null;
      participant.updatedAt = nowIso();
    }
    touchRoom(room);

    const state = serializeRoom(room);
    io.to(room.id).emit('roomState', state);
    writeLog('info', 'room_reset', { roomId: room.id });
    ack?.({ ok: true, room: state });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) {
      return;
    }
    const participant = room.participants.get(socket.data.participantId);
    if (participant) {
      participant.connectedCount = Math.max(0, participant.connectedCount - 1);
      participant.updatedAt = nowIso();
      removeInactiveParticipant(room, participant.id);
      touchRoom(room);
      io.to(room.id).emit('presenceState', serializeRoom(room));
    }
  });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `圖片超過 ${maxImageMb}MB 限制`
      : error.message;
    res.status(400).json({ error: message });
    return;
  }

  const statusCode = Number(error.statusCode || 500);
  writeLog('error', 'request_failed', {
    statusCode,
    path: req.path,
    method: req.method,
    error: error.message
  });
  res.status(statusCode).json({
    error: error.message || '伺服器處理失敗'
  });
});

server.on('error', (error) => {
  writeLog('error', 'server_listen_failed', {
    port,
    host,
    error: error.message
  });
  process.exitCode = 1;
});

loadPersistedRooms();
setInterval(cleanupExpiredRooms, 30 * 60 * 1000).unref();

server.listen(port, host, () => {
  writeLog('info', 'server_started', {
    port,
    host,
    providerOrder: aiProviderOrder,
    geminiModel,
    openAiModel,
    roomTtlHours: roomTtlMs / 60 / 60 / 1000,
    maxImageMb,
    roomPersistenceEnabled,
    roomStorePath
  });
});
