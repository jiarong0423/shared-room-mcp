# Shared Room MCP Additional Scenario Matrix B

Generated on 2026-09-01. This second matrix is separate from the original 12-scenario matrix and is used to prove that the routing and proposal-only boundaries still hold on new social coordination cases.

## Mutual Exclusion Result

Command shape:

```text
Run the local mutual-exclusion checker against the original scenario matrix and this second matrix.
```

Result summary:

| check | result |
|---|---|
| Baseline scenarios compared | 12 |
| Candidate scenarios compared | 12 |
| Candidate Chinese scenarios | 6 |
| Candidate English scenarios | 6 |
| Candidate duplicate IDs | 0 |
| Candidate duplicate titles | 0 |
| Candidate duplicate OCR texts | 0 |
| Duplicate IDs against baseline | 0 |
| Duplicate titles against baseline | 0 |
| Internal similarity blocks | 0 |
| Baseline similarity blocks | 0 |
| Mutual exclusion decision | passed |

## Scenario List

| id | language | task type | scenario | drift focus |
|---|---|---|---|---|
| zh_b01_breakfast_run | zh | restaurant_split | 早餐店代買分帳 | 早餐主餐、飲料、外送服務費分開 |
| zh_b02_bbq_group_buy | zh | group_buy | 社區烤肉食材團購 | 食材、押金、免運差額不可混算 |
| zh_b03_yoga_signup | zh | ticket_activity | 瑜伽體驗課報名 | 課程券、租借、清潔費、飲品券分類 |
| zh_b04_boardgame_room | zh | ktv_room | 桌遊包廂聚會 | 包廂費、延長費、清潔費、食品飲料分開 |
| zh_b05_meeting_room | zh | sports_venue | 共享會議室租用 | 場地、設備、耗材、服務與停車券分類 |
| zh_b06_camping_rental | zh | rental_share | 露營裝備共租 | 租借項目、押金、清潔費保持分離 |
| en_b01_pastry_box | en | restaurant_split | Office Pastry Box | pastry items, drink, and delivery fee |
| en_b02_farmers_market_bulk | en | group_buy | Farmers Market Bulk Order | bulk products, deposit, and discount gap |
| en_b03_pottery_workshop | en | ticket_activity | Pottery Workshop Signup | class seat, material fee, rental, voucher |
| en_b04_airport_shuttle | en | rental_share | Airport Shuttle Coordination | shared vehicle reservation, service fees, seat rental, no final booking |
| en_b05_volleyball_court | en | sports_venue | Beach Volleyball Court | court rental, equipment, setup service, water, parking |
| en_b06_pet_grooming_group | en | generic_split | Pet Grooming Group Draft | service draft, add-on, deposit, no final appointment |

## Split Stress Result

Chinese command shape:

```text
Start a local server with a temporary JSON room store, then run the local unique-scenario stress runner with the Chinese scenario filter for 20 repeats per scenario.
```

English command shape:

```text
Start a local server with a temporary JSON room store, then run the local unique-scenario stress runner with the English scenario filter for 20 repeats per scenario.
```

Result summary:

| split | scenarios | repeat per scenario | total runs | passed | failed | warnings |
|---|---:|---:|---:|---:|---:|---:|
| Chinese | 6 | 20 | 120 | 120 | 0 | 0 |
| English | 6 | 20 | 120 | 120 | 0 | 0 |
| Total | 12 | 20 | 240 | 240 | 0 | 0 |

Stable task routing:

| id | expected task | observed over 20 runs |
|---|---|---|
| zh_b01_breakfast_run | `restaurant_split` | `restaurant_split` 20/20 |
| zh_b02_bbq_group_buy | `group_buy` | `group_buy` 20/20 |
| zh_b03_yoga_signup | `ticket_activity` | `ticket_activity` 20/20 |
| zh_b04_boardgame_room | `ktv_room` | `ktv_room` 20/20 |
| zh_b05_meeting_room | `sports_venue` | `sports_venue` 20/20 |
| zh_b06_camping_rental | `rental_share` | `rental_share` 20/20 |
| en_b01_pastry_box | `restaurant_split` | `restaurant_split` 20/20 |
| en_b02_farmers_market_bulk | `group_buy` | `group_buy` 20/20 |
| en_b03_pottery_workshop | `ticket_activity` | `ticket_activity` 20/20 |
| en_b04_airport_shuttle | `rental_share` | `rental_share` 20/20 |
| en_b05_volleyball_court | `sports_venue` | `sports_venue` 20/20 |
| en_b06_pet_grooming_group | `generic_split` | `generic_split` 20/20 |

Boundary result:

| boundary | result |
|---|---|
| Room owner required before proposal creation | enforced by the stress flow |
| Draft type | `semantic_repair_draft` in every run |
| Draft status | `pending_host_confirmation` in every run |
| Final settlement/payment/booking submission | not exposed to the stress flow |
| Human confirmation boundary | preserved |

## Issues Found And Fixed

| issue | direct cause | fix |
|---|---|---|
| Breakfast split warned as drink flow | One drink item category made task inference too eager. | Drink task inference now requires a majority of drink items or explicit drink wording from source text. |
| Yoga signup warned as drink flow | `飲品券` contains the drink word `飲品`, but the line is a voucher. | Ticket/voucher wording now takes priority over drink wording. |
| Meeting room warned as rental flow | `會議室` was not recognized as a venue-like room. | Meeting rooms, classrooms, and studios are recognized as venue surfaces. |
| Camping rental warned as KTV flow | Generic `清潔費` was too strong as a KTV signal. | KTV inference now relies on KTV/room/minimum/spend-specific signals, not generic cleaning fees. |
| Delivery service fee disappeared | `外送` was treated as a skip-line marker before price extraction. | Delivery lines with prices are kept and categorized as service fees. |
