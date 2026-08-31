# Shared Room MCP Demo Scenario Matrix

Generated on 2026-09-01. This matrix keeps Chinese and English scenarios separate and unique. It is used for OCR/text parsing drift tests; prompts are not treated as OCR results.

| id | language | task type | scenario | drift focus |
|---|---|---|---|---|
| zh_01_office_drinks | zh | drink_order | 辦公室飲料團單 | 數量欄、甜度冰量、外送袋是否當品項 |
| zh_02_lunch_bento | zh | restaurant_split | 公司便當午餐 | 餐點、湯品、服務費分類 |
| zh_03_free_shipping_buy | zh | group_buy | 社區水果免運團購 | 商品、運費、免運差額分開 |
| zh_04_ktv_room | zh | ktv_room | KTV 包廂低消 | 包廂費、人頭費、清潔費不可亂算 |
| zh_05_event_signup | zh | ticket_activity | 戶外音樂祭報名 | 票券、接駁、置物櫃、餐券分類 |
| zh_06_badminton_court | zh | sports_venue | 羽球臨打場地 | 場地、器材、消耗品、停車費分開 |
| en_01_coffee_run | en | drink_order | Team Coffee Run | drink items versus add-ons and delivery fee |
| en_02_birthday_dinner | en | restaurant_split | Birthday Dinner Split | shared food, individual mains, drink line, service fee |
| en_03_keyboard_group_buy | en | group_buy | Keyboard Group Buy | product lines versus shipping threshold |
| en_04_salon_group_booking | en | generic_split | Salon Group Booking Draft | service request draft, deposit, fee, no final booking |
| en_05_theme_park_tickets | en | ticket_activity | Theme Park Group Pass | tickets, locker rental, shuttle, voucher |
| en_06_soccer_pitch | en | sports_venue | Indoor Soccer Pitch | venue rental, equipment, referee service, parking, water |

## Text Fixtures

### zh_01_office_drinks - 辦公室飲料團單

```text
紅茶拿鐵 55
鐵觀音鮮奶茶 65
四季春青茶 35
檸檬綠茶 40
外送袋 30
```

### zh_02_lunch_bento - 公司便當午餐

```text
雞腿便當 120
排骨便當 110
蔬食便當 100
味噌湯 25
服務費 30
```

### zh_03_free_shipping_buy - 社區水果免運團購

```text
大盒草莓 450
中盒草莓 300
水蜜桃禮盒 880
冷藏運費 150
免運差額 500
```

### zh_04_ktv_room - KTV 包廂低消

```text
大包廂三小時 2400
基本人頭費 399
炸物拼盤 499
飲料壺 180
清潔費 300
```

### zh_05_event_signup - 戶外音樂祭報名

```text
成人票 1500
團體優惠票 1300
接駁車來回 250
置物櫃單日 150
餐券 100
```

### zh_06_badminton_court - 羽球臨打場地

```text
一號場地兩小時 600
二號場地兩小時 600
羽球一桶 550
球拍租借 80
停車費 50
```

### en_01_coffee_run - Team Coffee Run

```text
Iced Latte 5
Cold Brew 6
Matcha Latte 6
Oat Milk Add-on 1
Delivery Bag 1
```

### en_02_birthday_dinner - Birthday Dinner Split

```text
Shared Appetizers 42
Ribeye Steak 45
Truffle Risotto 32
Cocktails 60
Service Fee 18
```

### en_03_keyboard_group_buy - Keyboard Group Buy

```text
Linear Switch Pack 54
Deskmat 25
Stabilizers Set 24
Shipping Fee 35
Free Shipping Gap 80
```

### en_04_salon_group_booking - Salon Group Booking Draft

```text
Hair Styling 80
Makeup Session 95
Nail Add-on 35
Deposit 100
Late Change Fee 20
```

### en_05_theme_park_tickets - Theme Park Group Pass

```text
Adult Ticket 85
Group Discount Ticket 70
Locker Rental 12
Shuttle Seat 18
Meal Voucher 25
```

### en_06_soccer_pitch - Indoor Soccer Pitch

```text
Pitch Rental Two Hours 220
Equipment Rental 30
Referee Fee 40
Parking Pass 25
Water Pack 18
```

## Validation Evidence

Last validated: 2026-09-01 05:53 Asia/Taipei.

Command shape:

```text
PORT=3146 HOST=127.0.0.1 ROOM_STORE_PATH=/private/tmp/shared-room-mcp-unique-closed-loop-3146.json npm start
BASE_URL=http://127.0.0.1:3146 REPEAT=20 TIMEOUT_MS=20000 node /private/tmp/shared-room-unique-stress.mjs
```

Result summary:

| check | result |
|---|---|
| Total runs | 240 |
| Passed runs | 240 |
| Failed runs | 0 |
| Unique scenario IDs | 12 |
| Unique scenario titles | 12 |
| Duplicate IDs | 0 |
| Chinese scenarios | 6 |
| English scenarios | 6 |
| Draft proposal status | `pending_host_confirmation` in every run |
| Draft proposal type | `semantic_repair_draft` in every run |

Stable task routing:

| id | expected task | observed over 20 runs |
|---|---|---|
| zh_01_office_drinks | `drink_order` | `drink_order` 20/20 |
| zh_02_lunch_bento | `restaurant_split` | `restaurant_split` 20/20 |
| zh_03_free_shipping_buy | `group_buy` | `group_buy` 20/20 |
| zh_04_ktv_room | `ktv_room` | `ktv_room` 20/20 |
| zh_05_event_signup | `ticket_activity` | `ticket_activity` 20/20 |
| zh_06_badminton_court | `sports_venue` | `sports_venue` 20/20 |
| en_01_coffee_run | `drink_order` | `drink_order` 20/20 |
| en_02_birthday_dinner | `restaurant_split` | `restaurant_split` 20/20 |
| en_03_keyboard_group_buy | `group_buy` | `group_buy` 20/20 |
| en_04_salon_group_booking | `generic_split` | `generic_split` 20/20 |
| en_05_theme_park_tickets | `ticket_activity` | `ticket_activity` 20/20 |
| en_06_soccer_pitch | `sports_venue` | `sports_venue` 20/20 |

Observed warning:

| warning | count | decision |
|---|---:|---|
| `drink_without_size_or_addon_options` | 20 | Acceptable for the Chinese office drink fixture because it intentionally does not include sweetness/ice/size options. The app keeps this as a human-review warning instead of inventing missing options. |
