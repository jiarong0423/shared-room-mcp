import express from 'express';
import fs from 'fs';
import http from 'http';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GoogleGenAI, Type } from '@google/genai';

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

const port = Number(process.env.PORT || 3000);
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
const aiProviderTypes = new Set(['gemini', 'openai']);
const aiProviderOrder = normalizeAiProviderOrder(process.env.AI_PROVIDER_ORDER || 'gemini,openai');
const roomTtlMs = Number(process.env.ROOM_TTL_HOURS || 12) * 60 * 60 * 1000;
const maxImageMb = Number(process.env.MAX_IMAGE_MB || 8);
const maxImageBytes = maxImageMb * 1024 * 1024;
const rateLimitWindowMs = Math.max(1000, Math.min(15 * 60 * 1000, Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000)));
const apiRateLimitMax = Math.max(10, Math.min(3000, Number(process.env.API_RATE_LIMIT_MAX || 180)));
const roomCreateRateLimitMax = Math.max(2, Math.min(300, Number(process.env.ROOM_CREATE_RATE_LIMIT_MAX || 20)));
const menuParseRateLimitMax = Math.max(1, Math.min(120, Number(process.env.MENU_PARSE_RATE_LIMIT_MAX || 6)));
const imageMaxDimension = Math.max(640, Math.min(1800, Number(process.env.IMAGE_MAX_DIMENSION || 1400)));
const imageJpegQuality = Math.max(50, Math.min(86, Number(process.env.IMAGE_JPEG_QUALITY || 80)));
const itemThumbSize = Math.max(96, Math.min(360, Number(process.env.ITEM_THUMB_SIZE || 160)));
const localOcrMaxChars = Math.max(0, Math.min(24000, Number(process.env.LOCAL_OCR_MAX_CHARS || 12000)));
const localOcrFirst = String(process.env.LOCAL_OCR_FIRST || 'true').toLowerCase() !== 'false';
const localOcrMinItems = Math.max(1, Math.min(20, Number(process.env.LOCAL_OCR_MIN_ITEMS || 3)));
const trustLayerSpreadsheetId = String(process.env.TRUST_LAYER_SPREADSHEET_ID || '').trim();
const trustLayerSpreadsheetUrl = trustLayerSpreadsheetId
  ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(trustLayerSpreadsheetId)}/edit`
  : '';
const roomPersistenceEnabled = String(process.env.ROOM_PERSISTENCE || 'json').toLowerCase() !== 'memory';
const roomStorePath = path.resolve(__dirname, process.env.ROOM_STORE_PATH || 'data/rooms.json');
const roomStoreVersion = 'group-room-json-store.v1';
const rooms = new Map();
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
  fixedTaxonomyVersion: 'group-room-task-router.v1'
});
const taskRouterContractVersion = 'group-room-task-router-contract.v1';
const formulaContractVersion = 'group-room-formula-contract.v1';
const formulaResultVersion = 'group-room-formula.v1';
const formulaModuleContracts = Object.freeze([
  {
    id: 'participantSubtotal',
    status: 'active',
    inputSource: 'participant.order',
    outputField: 'formulaResults.participantSubtotal'
  },
  {
    id: 'sameItemMerge',
    status: 'active',
    inputSource: 'room.items + participant.order',
    outputField: 'formulaResults.sameItemMerge'
  },
  {
    id: 'grandTotal',
    status: 'active',
    inputSource: 'formulaResults.sameItemMerge',
    outputField: 'formulaResults.grandTotal'
  },
  {
    id: 'averageSplit',
    status: 'active',
    inputSource: 'sharedCandidateTotal + active participants',
    outputField: 'formulaResults.averageSplit'
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
    outputField: 'formulaResults.extraPersonalClaim'
  },
  {
    id: 'thresholdRemaining',
    status: 'p1_manual_input_required',
    inputSource: 'client threshold input',
    outputField: 'formulaResults.thresholdRemaining'
  },
  {
    id: 'sharedFeeSplit',
    status: 'p1_manual_input_required',
    inputSource: 'service fee / room fee / venue fee inputs',
    outputField: 'formulaResults.sharedFeeSplit'
  },
  {
    id: 'depositGate',
    status: 'p1_manual_input_required',
    inputSource: 'deposit include/exclude toggle',
    outputField: 'formulaResults.depositGate'
  },
  {
    id: 'tierDiscount',
    status: 'p1_manual_input_required',
    inputSource: 'discount threshold and discount rule inputs',
    outputField: 'formulaResults.tierDiscount'
  }
]);
const trustLayerContractVersion = 'group-room-trust-layer-contract.v1';
const webMcpToolSurfaceVersion = 'group-room-webmcp-tools.v2';
const evidenceContractVersion = 'group-room-evidence-ocr-contract.v1';
const agentProposalContractVersion = 'group-room-agent-proposal-contract.v1';
const rateLimitBuckets = new Map();
const agentProposalTypes = new Set([
  'claim_assignment',
  'missing_confirmation',
  'evidence_review',
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
const nonMenuPriceFieldPattern = /總糖量|糖量|總熱量|熱量|大卡|卡路里|營養|公克|克數|容量|毫升|ml|ML|代碼|編號|期限|效期|日期|使用期限|有效期限|電話|地址|營業|外送|回饋|點數|建議表/;
const addonOnlyItemPattern = /^(加料|加購|加價|升級|免費升級|飲品免費升級|珍珠|波霸|椰果|仙草|布丁|蘆薈|脆纖果|百年仙草凍|鮮奶酪|奶蓋|加珍珠|加波霸|加椰果|加仙草|加布丁|加蘆薈)$/;
const noAddonOptionPattern = /^(不加|不要|無|無加料|不需加料|none|no)$/i;
const standaloneBottlePattern = /(?:^|[\s｜|/（(])瓶(?:$|[\s｜|/）)])|瓶$/;
const drinkSizePattern = /小杯|中杯|大杯|特大杯|分享瓶|瓶裝|加大|小瓶|中瓶|大瓶|\bS\b|\bM\b|\bL\b|\bXL\b|\bSmall\b|\bMedium\b|\bMed\b|\bRegular\b|\bReg\b|\bLarge\b|\bExtra\s*Large\b|\bX-Large\b/i;
const largeDrinkSizePattern = /大杯|特大杯|分享瓶|瓶裝|加大|大瓶|\bL\b|\bXL\b|\bLarge\b|\bExtra\s*Large\b|\bX-Large\b/i;
const localOcrPricePattern = /(?:NT\$?\s*)?([0-9]{1,4})(?:\s*(?:元|圓|塊))?/g;
const localOcrSectionPattern = /^(飯類|麵類|粥品|湯品|湯類|小菜|點心|炸物|主餐|套餐|便當|飲品|飲料|咖啡|茶飲|鮮奶茶|果汁|冰沙|甜點|加料|配料|包廂|場地|場租|票券|門票|活動|課程|器材|租借|低消|服務費|Toppings?|Add-?ons?|Meals?|Drinks?|Coffee|Tea|Rooms?|Tickets?|Rentals?|Activities?|Courts?|Venues?)$/i;
const localOcrSkipLinePattern = /總糖量|糖量|總熱量|熱量|大卡|卡路里|營養|公克|克數|容量|毫升|ml|ML|電話|地址|營業|外送|回饋|點數|建議表|使用期限|有效期限|統一編號|發票/;
const suspiciousMenuNoise = /(總糖量|總熱量|大卡|卡路里|熱量|糖量|建議表|使用期限|外送|回饋|點數|電話|地址|營業|店長推薦|不建議)/;
const suspiciousAddon = /^(加料|加購|加價|升級|免費升級|飲品免費升級|珍珠|波霸|椰果|仙草|布丁|蘆薈|脆纖果|百年仙草凍|鮮奶酪)$/;
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
    approveEffect: 'marks_proposal_as_accepted_only',
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

  room.agentProposals = [proposal, ...proposals].slice(0, 24);
  touchRoom(room, 'agent_proposal_created');
  return proposal;
}

function serializeRoomForStore(room) {
  return {
    id: room.id,
    menuLoaded: Boolean(room.menuLoaded),
    items: Array.isArray(room.items) ? room.items : [],
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
    localOcr: room.localOcr || {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0
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
    items: Array.isArray(record.items) ? record.items : [],
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
    localOcr: record.localOcr || {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0
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

function persistRooms(reason = 'room_state_changed') {
  if (!roomPersistenceEnabled) {
    return;
  }

  const payload = {
    storeVersion: roomStoreVersion,
    savedAt: nowIso(),
    roomTtlHours: roomTtlMs / 60 / 60 / 1000,
    rooms: Array.from(rooms.values()).map((room) => serializeRoomForStore(room))
  };
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
    return ['gemini', 'openai'];
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
        width: imageMaxDimension,
        height: imageMaxDimension,
        fit: 'inside',
        withoutEnlargement: true
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
          `Gemini 解析超過 ${Math.round(geminiTimeoutMs / 1000)} 秒，請改用較清晰或較小的價格證據圖片再試一次。`
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
  const error = new Error(`Gemini 目前高流量或暫時不可用，已重試並切換備援模型仍失敗。請稍後再按「確定上傳」。最後錯誤：${info.message}`);
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
    items: [],
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
    localOcr: {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0
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
  const text = String(name || '').replace(/\s+/g, '');
  if (!text) {
    return false;
  }

  if (/茶葉蛋|茶碗蒸|茶油|油茶|茶餐|飯|麵|粥|湯|排骨|雞腿|便當|水餃|鍋貼|炒|燴|咖哩|小菜|滷味|沙拉|吐司|漢堡|蛋餅|鬆餅/.test(text)) {
    return false;
  }

  return /紅茶|綠茶|青茶|烏龍|奶茶|鮮奶|拿鐵|咖啡|可可|豆漿|果汁|檸檬|多多|冰沙|奶蓋|手搖|飲品|飲料|冷飲|熱飲|氣泡|珍珠|波霸|椰果|仙草|布丁|芋圓|黑糖|乳酸/.test(text);
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
  const text = String(name || '').replace(/\s+/g, '');
  if (!text) {
    return 'other';
  }
  if (/包廂|包場|場地|場租|球場|羽球|籃球|網球|桌球|保齡球|泳池|泳道|KTV|唱歌|Room|Court|Venue/i.test(text)) {
    return 'venue';
  }
  if (/票券|門票|入場|報名|課程|體驗|活動|展覽|演唱會|Ticket|Pass|Admission|Workshop|Class|Activity/i.test(text)) {
    return 'ticket';
  }
  if (/租借|器材|球拍|鞋|裝備|麥克風|押金|Rental|Rent|Equipment/i.test(text)) {
    return 'rental';
  }
  if (/服務費|清潔費|低消|開瓶費|人頭費|計時費|鐘點|每人|低消|Service|Minimum|PerPerson|perperson/i.test(text)) {
    return 'service';
  }
  if (supportsDrinkOptions || inferDrinkItem(text)) {
    return 'drink';
  }
  if (/套餐|組合|雙人|多人|分享餐|家庭餐|全餐|Combo|Set/i.test(text)) {
    return 'set';
  }
  if (/湯|羹|鍋/.test(text)) {
    return 'soup';
  }
  if (/甜點|蛋糕|布丁|豆花|冰品|鬆餅|可頌|塔|派/.test(text)) {
    return 'dessert';
  }
  if (/小菜|滷味|泡菜|青菜|沙拉|薯條|雞塊|炸物|點心|配菜/.test(text)) {
    return 'side';
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

function extractLocalOcrPriceMatches(line) {
  const matches = [];
  localOcrPricePattern.lastIndex = 0;
  let match;
  while ((match = localOcrPricePattern.exec(line)) !== null) {
    const price = Number(match[1]);
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
  const normalized = String(text || '').replace(/\s+/g, '').toLowerCase();
  const itemText = items.map((item) => `${item.name || ''} ${item.category || ''} ${item.sectionName || ''} ${(item.tags || []).join(' ')}`).join(' ').toLowerCase();
  const combined = `${normalized} ${itemText}`;

  if (/免運|滿額|滿[0-9]|團購|合購|批發|volume|free.?shipping|group.?buy/.test(combined)) {
    return 'group_buy';
  }
  if (/ktv|唱歌|包廂|歡唱|低消|開瓶費|清潔費|room/.test(combined)) {
    return 'ktv_room';
  }
  if (/球場|場租|羽球|籃球|網球|桌球|保齡球|泳道|健身|運動|court|venue|sports/.test(combined)) {
    return 'sports_venue';
  }
  if (/票券|門票|報名|活動|課程|展覽|體驗|演唱會|ticket|admission|workshop|class|activity/.test(combined)) {
    return 'ticket_activity';
  }
  if (/租借|器材|球拍|鞋|裝備|麥克風|押金|rental|equipment/.test(combined)) {
    return 'rental_share';
  }
  const drinkCount = items.filter((item) => item.supportsDrinkOptions || item.category === 'drink').length;
  if (drinkCount >= Math.max(2, Math.ceil(items.length * 0.6)) || /飲料|飲品|手搖|咖啡|茶飲|drink/.test(combined)) {
    return 'drink_order';
  }
  if (/餐廳|菜單|便當|飯|麵|火鍋|主餐|小菜|restaurant|menu|meal/.test(combined)) {
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
    fixedTaxonomyVersion: 'group-room-task-router.v1',
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
      itemCount: Number(localOcr.itemCount || 0)
    },
    imageInput: {
      requiredForUpload: true,
      maxImageMb,
      maxImageBytes,
      maxImagesPerUpload: 1,
      processedMaxDimension: imageMaxDimension,
      processedJpegQuality: imageJpegQuality,
      storedAsProcessedEvidenceImage: true
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
      parserVersion: 'local-ocr-price-parser.v1',
      pricePattern: 'NTD integer price from text line',
      sectionPattern: 'known menu/activity/venue/rental section labels',
      maxCandidateItems: 120,
      outputFields: [
        'name',
        'price',
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

function parseLocalOcrMenuCandidates(localOcrText, imageCount = 1) {
  const lines = splitLocalOcrLines(localOcrText);
  const rawItems = [];
  let currentSection = '';

  for (const line of lines) {
    if (localOcrSkipLinePattern.test(line)) {
      continue;
    }
    if (isLikelyLocalOcrSection(line)) {
      currentSection = line.replace(/\s+/g, '').slice(0, 24);
      continue;
    }

    const priceMatches = extractLocalOcrPriceMatches(line);
    if (priceMatches.length === 0) {
      continue;
    }

    const firstPrice = priceMatches[0];
    const name = cleanLocalOcrName(line.slice(0, firstPrice.index));
    if (!name || name.length < 2 || shouldDropNonMenuPriceName(name) || addonOnlyItemPattern.test(name)) {
      continue;
    }

    const supportsDrinkOptions = inferDrinkItem(name);
    const category = normalizeMenuCategory('', `${currentSection} ${name}`, supportsDrinkOptions);
    const optionGroups = [];
    if (priceMatches.length >= 2 && supportsDrinkOptions) {
      const basePrice = firstPrice.price;
      const labels = ['小杯', '中杯', '大杯', '瓶裝'];
      optionGroups.push({
        label: '大小',
        type: 'size',
        selectionType: 'single',
        options: priceMatches.slice(0, 4).map((priceMatch, index) => ({
          label: labels[index] || `規格 ${index + 1}`,
          priceDelta: Math.max(0, priceMatch.price - basePrice)
        }))
      });
    }

    rawItems.push({
      name,
      price: firstPrice.price,
      supportsDrinkOptions,
      sourceImageIndex: Math.min(1, imageCount),
      category,
      sectionName: currentSection,
      sizeLabel: '',
      temperature: normalizeTemperature('', `${currentSection} ${name}`, supportsDrinkOptions),
      spiceLevel: normalizeSpiceLevel('', name),
      dietaryFlags: [],
      tags: priceMatches.length >= 2 ? ['manual_review'] : [],
      note: priceMatches.length >= 2 ? '本地 OCR 偵測到多個價格，請確認尺寸欄位。' : '',
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
      itemCount: items.length
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

function evaluateMenuParseQuality(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const menuType = normalizeMenuType(input?.menuType, items);
  const taskRouter = input?.taskRouter && typeof input.taskRouter === 'object' ? input.taskRouter : null;
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
      detail: `任務鎖定為 ${taskRouter.selectedTaskType || taskRouter.taskType || 'unknown'}，但證據訊號接近 ${taskRouter.conflictTaskType || taskRouter.inferredTaskType || 'unknown'}，需要人工確認後才能結算。`
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
        detail: '疑似把營養資訊、說明或非結算文字當成項目。'
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
        detail: '同品名有多個價格但沒有收斂成尺寸或規格。'
      });
    }
  }

  for (const [base, group] of baseNames.entries()) {
    const prices = Array.from(new Set(group.map((item) => Number(item.price)))).sort((a, b) => a - b);
    const names = Array.from(new Set(group.map((item) => String(item.name || '').trim())));
    if (group.length > 1 && prices.length > 1 && names.some((name) => !hasDrinkSizeMarker(name))) {
      issues.push({
        type: 'size_variant_missing_marker',
        severity: 'high',
        item: base,
        detail: '疑似大小杯或規格價差，但部分名稱沒有標明規格。'
      });
    }
  }

  const otherCount = categoryCounts.other || 0;
  if (items.length >= 5 && otherCount / items.length > 0.7) {
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

  const highIssues = issues.filter((issue) => issue.severity === 'high').length;
  const mediumIssues = issues.filter((issue) => issue.severity === 'medium').length;
  const status = highIssues > 0 ? 'review_required' : mediumIssues > 0 ? 'warn' : 'pass';

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

  return mergeDrinkSizeVariants(pruneDrinkNutritionItems(normalized)).map((item, index) => ({
    ...item,
    id: `item_${index + 1}`
  }));
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
      'formulaResults.participantSubtotal',
      'formulaResults.sameItemMerge',
      'formulaResults.averageSplit',
      'formulaResults.extraPersonalClaim',
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
    implementation: 'document.modelContext.registerTool',
    source: 'browser_page_state',
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
    draftMutationAllowed: true,
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
    claimAuditVersion: 'group-room-claim-audit.v1',
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
    menuType: room.menuType,
    menuMode: room.menuMode,
    taskRouter: room.taskRouter || { ...defaultTaskRouter },
    taskRouterContract: buildTaskRouterContract(room),
    evidenceContract: buildEvidenceContract(room),
    webMcpToolSurface: buildWebMcpToolSurface(room),
    trustLayerContract: buildTrustLayerContract(),
    items: room.items,
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
    localOcr: room.localOcr || null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    parsedAt: room.parsedAt
  };
}

function buildMenuParsePrompt(options = {}) {
  const localOcrText = normalizeLocalOcrText(options.localOcrText);
  const localOcrCandidates = Array.isArray(options.localOcrCandidates) ? options.localOcrCandidates : [];
  const taskRouter = options.taskRouter && typeof options.taskRouter === 'object'
    ? options.taskRouter
    : { ...defaultTaskRouter };
  const promptLines = [
    '你正在處理多人揪團消費的現場價格證據圖片，不限餐飲。',
    `任務判別模組已鎖定 taskType=${taskRouter.taskType || 'generic_split'}，thresholdKind=${taskRouter.thresholdKind || 'custom'}，splitMode=${taskRouter.splitMode || 'individual_items'}，riskPolicy=${taskRouter.riskPolicy || 'conservative'}。`,
    '你只能在這個任務邊界內修補 OCR 與欄位，不要把任務重新發散成其他產品；若圖片訊號與 taskType 衝突，請用 manual_review 與 note 標記，不要自行改任務。',
    '本次只會有一張圖片。每個項目的 sourceImageIndex 一律輸出 1。',
    '請先判斷整張圖片是一般消費項目、飲料單或混合清單，menuType 只能輸出 general、drink 或 mixed。',
    '解析流程必須分四步思考但只輸出 JSON：第一步辨識版面區塊與表格欄位；第二步抽取可選擇、可分攤或可結算的項目、價格與規格；第三步把自由文字收斂到固定欄位；第四步丟棄電話、地址、營業時間、品牌口號、廣告文案與非結算數字。',
    '請只輸出可選擇、可分攤或可結算的項目與單價，不要把電話、地址、營業時間、分類標題、方案說明或廣告文案當成獨立項目。',
    '自由價格證據規則：圖片可能是餐飲菜單、飲料單、KTV 包廂價目表、運動場地費率、票券表、課程/活動報名表、器材租借表、低消/服務費公告、優惠券格、套餐卡片或混合圖。請以視覺邊界與價格欄關係建立項目，不要只依照逐行 OCR 文字。',
    '欄位收斂規則：category 只能輸出 main、side、snack、soup、dessert、drink、set、service、ticket、rental、venue、addon、other；sectionName 放圖片上的區塊標題；sizeLabel 只放該列固定份量、時段、人數或規格；temperature 只能輸出 冷、熱、常溫、冷熱皆可、未標示；spiceLevel 只能輸出 none、mild、medium、hot、extra_hot、unknown。',
    '通用揪團欄位規則：KTV 包廂、運動場地、球場、泳道、包場輸出 category=venue；票券、門票、報名、活動、課程輸出 category=ticket；器材、球拍、鞋、裝備、麥克風租借輸出 category=rental；服務費、清潔費、低消、人頭費、計時費輸出 category=service；多人方案、包套、組合、共享方案輸出 category=set。',
    '餐飲欄位規則：飯、麵、粥、便當、漢堡、吐司、蛋餅、咖哩、燴飯、披薩、主餐歸 category=main；湯/鍋/羹歸 soup；小菜/炸物/配菜歸 side 或 snack；甜點/冰品歸 dessert；多人餐、套餐、組合餐、優惠券格歸 set。',
    '餐廳規格規則：若有大/小、單人/雙人、乾/湯、飯/麵、加麵、加飯、升級套餐、換飲料、加蛋、加起司、加肉，請優先放在 optionGroups；若價格是固定商品差異，才拆成不同品項。',
    '飲料欄位規則：手搖、咖啡、茶、鮮奶、拿鐵、果汁、冰沙、氣泡飲歸 category=drink。咖啡因、無咖啡因、季節限定、招牌、熱賣、新品、甜度冰塊、冷熱、瓶裝、分享瓶、容量、加料都要收斂到 supportsDrinkOptions、temperature、tags、dietaryFlags、sizeLabel、optionGroups 或 note，不要塞進品名造成重複。',
    '方案與組合規則：如果一個價格包含主餐、附餐、飲料、甜點、包廂、場地、票券、器材或多人共享內容，輸出成一個項目 category=set，name 用短句保留主要內容，note 可寫固定內容、可換項目、時段、人數或限制。不要把方案裡的附帶內容拆成零元品項。',
    '不確定欄位規則：看得出可點但分類不明，category=other；價格或規格疑似模糊但仍可讀，tags 加 manual_review 且 note 寫短句；價格不可靠則跳過該品項。',
    '模糊規則 1：價格只能來自可選擇、可分攤或可結算的價格欄。若數字位於「總糖量、總熱量、大卡、卡路里、克、容量、ml、使用期限、代碼、電話、地址」等欄位，絕對不要當成 price。',
    '模糊規則 2：飲料價目表如果有「小杯、中杯、大杯、分享瓶、瓶裝、L、瓶」或英文「S、M、L、XL、Small、Medium、Regular、Large、Extra Large」欄位，請優先把大小做成該品項的 optionGroups size 下拉，不要輸出同名多價品項。',
    '模糊規則 3：同一列如果同時有價格與營養數字，只保留價格欄，不要輸出糖量、熱量、容量。若無法判斷哪個是價格，跳過該列。',
    '模糊規則 4：「加料、加購、加價升級、免費升級、珍珠、波霸、椰果、仙草、布丁、蘆薈」這類加料或升級選項不是主品項，除非它在菜單上明確是可單點商品。',
    '模糊規則 5：優惠券、套餐、多人組合、包廂方案、場地方案、活動方案以可見邊界為一個項目；同一個邊界內的內容要合併寫在同一個 name，price 使用該邊界最醒目的價格。',
    '模糊規則 6：同一品項有不同冷熱、尺寸或規格造成不同價格時，若它是固定欄位或可選規格，請用 optionGroups；若它是完全不同商品，才拆成多列並把差異寫進 name。英文尺寸同義：S/Small/Short=小杯，M/Medium/Med/Regular/Reg=中杯，L/Large=大杯，XL/Extra Large/X-Large=特大杯，瓶=瓶裝。',
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
    '每個品項請輸出 name、price、supportsDrinkOptions、sourceImageIndex、category、sectionName、sizeLabel、temperature、spiceLevel、dietaryFlags、tags、note、optionGroups。全域加料只放 addonSection。不要輸出座標、圖片框、角度或其他欄位。',
    '若菜單是純文字飲料價目表，也照樣解析品名與價格，不需要判斷商品圖片。',
    '如果圖片有模糊、遮擋或無法確定的價格，請跳過該品項。',
    'warnings 請只在嚴重無法解析整張菜單時才輸出繁體中文短句；不要輸出英文解釋，不要說明你如何假設大小杯價格。'
  ];

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

function buildOpenAiInput(imageFiles, prompt) {
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
      detail: openAiImageDetail
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

async function parseMenuImagesWithGemini(imageFiles, options = {}) {
  const { apiKey } = getGeminiApiKeyConfig();
  if (!apiKey) {
    const error = new Error(`目前執行環境尚未設定可用 Gemini API Key。Zeabur 請到 Variables 設定其中一個變數名：${geminiApiKeyNames.join('、')}。不要把金鑰寫進程式碼。`);
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
    throw new Error('Gemini 未回傳可解析內容');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const wrapped = new Error('Gemini 回傳內容不是合法 JSON');
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
    const error = new Error(`目前執行環境尚未設定可用 OpenAI API Key。Zeabur 請到 Variables 設定 ${openAiApiKeyNames.join('、')}。不要把金鑰寫進程式碼。`);
    error.statusCode = 500;
    throw error;
  }

  const prompt = buildMenuParsePrompt(options);
  const generated = await generateOpenAiMenuContent(apiKey, {
    input: buildOpenAiInput(imageFiles, prompt)
  });

  const rawText = extractOpenAiOutputText(generated.response);
  if (!rawText) {
    throw new Error('OpenAI 未回傳可解析內容');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const wrapped = new Error('OpenAI 回傳內容不是合法 JSON');
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

async function parseMenuImages(files, options = {}) {
  const imageFiles = Array.isArray(files) && files.length > 0 ? files.slice(0, 1) : [];
  if (imageFiles.length === 0) {
    const error = new Error('請上傳一張價格證據圖片');
    error.statusCode = 400;
    throw error;
  }

  const localOcr = parseLocalOcrMenuCandidates(options.localOcrText, imageFiles.length);
  const initialTaskRouter = buildRoomTaskRouter({
    taskType: options.taskType,
    localOcrText: options.localOcrText,
    items: localOcr.items
  });
  const localQuality = evaluateMenuParseQuality({
    items: localOcr.items,
    menuType: localOcr.menuType,
    taskRouter: initialTaskRouter
  });
  const localFallback = localOcr.items.length > 0
    ? {
      items: localOcr.items,
      menuType: localOcr.menuType,
      provider: 'local_ocr',
      modelUsed: 'deterministic-ocr-text-parser',
      warnings: ['已使用本地 OCR 文字候選開房，請人工確認品名、價格與規格。'],
      parseQuality: localQuality,
      localOcr: localOcr.metrics,
      taskRouter: initialTaskRouter
    }
    : null;
  if (
    localOcrFirst
    && localFallback
    && localFallback.items.length >= localOcrMinItems
    && localQuality.highIssueCount === 0
  ) {
    return Object.assign({}, localFallback, {
      warnings: localQuality.issueCount > 0
        ? ['本地 OCR 已完成初步結構化，部分欄位請快速檢查。']
        : []
    });
  }
  const candidates = getConfiguredProviderCandidates();
  if (candidates.length === 0) {
    if (localFallback && localFallback.items.length >= localOcrMinItems) {
      return localFallback;
    }
    const error = new Error(`目前執行環境尚未設定可用 AI Key，且本地 OCR 文字候選不足。免費優先請設定 ${geminiApiKeyNames.join('、')}；OpenAI 備援請設定 ${openAiApiKeyNames.join('、')}。不要把金鑰寫進程式碼。`);
    error.statusCode = 500;
    throw error;
  }

  let lastError = null;
  for (const provider of candidates) {
    try {
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
          taskRouter: parsed.taskRouter
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
          taskRouter: parsed.taskRouter
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
    evidenceContractVersion,
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

app.post('/api/rooms', createRateLimitMiddleware('room_create', roomCreateRateLimitMax), (req, res) => {
  const room = createRoom();
  writeLog('info', 'room_created', { roomId: room.id });
  res.status(201).json(serializeRoom(room));
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: '找不到房間，請重新建立揪團分帳房' });
    return;
  }
  touchRoom(room, 'room_read', false);
  res.json(serializeRoom(room));
});

app.post('/api/rooms/:roomId/agent-proposals', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: '找不到房間，請重新建立揪團分帳房' });
    return;
  }
  const requesterId = String(req.body?.participantId || '');
  if (!requesterId || room.ownerParticipantId !== requesterId) {
    res.status(403).json({ error: '只有發起者可以建立 Agent 草稿' });
    return;
  }

  const proposal = createAgentProposal(room, req.body || {});
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

app.post('/api/rooms/:roomId/menu', createRateLimitMiddleware('menu_parse', menuParseRateLimitMax), upload.single('menuImage'), async (req, res, next) => {
  try {
    const room = getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: '找不到房間，請重新建立揪團分帳房' });
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
    room.items = parsed.items;
    room.menuType = parsed.menuType;
    room.menuMode = 'auto';
    room.taskRouter = parsed.taskRouter || buildRoomTaskRouter({
      taskType: requestedTaskType,
      localOcrText,
      items: parsed.items
    });
    room.warnings = parsed.warnings;
    room.parseQuality = parsed.parseQuality || evaluateMenuParseQuality({
      items: parsed.items,
      menuType: parsed.menuType,
      taskRouter: room.taskRouter
    });
    room.localOcr = parsed.localOcr || parseLocalOcrMenuCandidates(localOcrText, preparedImages.length).metrics;
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
    room.menuLoaded = true;
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
  res.setHeader('Cache-Control', 'private, max-age=3600');
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
  res.setHeader('Cache-Control', 'private, max-age=3600');
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
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(thumbnail.buffer);
  } catch (error) {
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.on('joinRoom', (payload, ack) => {
    const room = getRoom(payload?.roomId);
    if (!room) {
      ack?.({ ok: false, error: '找不到房間，請重新建立揪團分帳房' });
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
      ack?.({ ok: false, error: '只有發起者可以審核 Agent 草稿' });
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
      ack?.({ ok: false, error: '找不到 Agent 草稿' });
      return;
    }
    if (proposal.status !== 'pending_host_confirmation') {
      ack?.({ ok: false, error: '此 Agent 草稿已審核' });
      return;
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
      reviewedBy: reviewerId
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
    room.items = [];
    room.menuType = 'general';
    room.menuMode = 'auto';
    room.taskRouter = { ...defaultTaskRouter };
    room.warnings = [];
    room.parseQuality = null;
    room.localOcr = {
      enabled: false,
      lineCount: 0,
      candidateCount: 0,
      itemCount: 0
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
