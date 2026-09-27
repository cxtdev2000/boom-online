# Prompt tạo bộ asset mới (thay asset gốc Nexon)

Mục tiêu: bộ asset **nguyên bản, dùng thương mại được**, khớp đúng tên file + kích thước mà code đang đọc
(`js/assets.js`, `style.css`, `js/audio.js`) để chỉ cần chép đè vào `assets/` là chạy.

Cách dùng:
1. Dán **Master style** vào đầu mỗi lần gen (giữ phong cách đồng nhất).
2. Gen từng mục bên dưới. Sprite sheet: gen từng frame/tư thế riêng trên nền trong suốt rồi ghép lưới
   bằng Aseprite / TexturePacker (AI ảnh thường không giữ lưới pixel chính xác).
3. Resize đúng kích thước, xuất PNG nền trong suốt (JPG cho nền/ảnh xem trước).
4. Kiểm tra giấy phép của công cụ AI cho phép dùng thương mại; không dùng tên/nhân vật của game khác trong prompt.

---

## 0. Master style (dán trước mọi prompt)

```text
Original IP for a cute top-down party arcade game about water balloons (Bomberman-like genre).
Style: bright, colorful, chibi / kawaii 2D cartoon, thick clean dark-brown outlines, soft cel shading,
3/4 top-down camera, friendly and readable at small sizes, saturated pastel palette
(sky blue, mint green, coral red, sunny yellow, lilac). Game-ready asset, transparent background,
no text unless requested, no watermark, no logo, centered, consistent lighting from top-left.
Do NOT imitate Crazy Arcade, BnB, Bomberman or any existing game characters.
```

---

## 1. Nhân vật (4 con) — `assets/images/player/`

Tên file giữ nguyên để khỏi sửa code: `boz`, `evie`, `ike`, `plunk` (có thể đổi tên trong `BOOM.CHARACTERS` ở `js/config.js`).

| File | Kích thước | Bố cục |
|---|---|---|
| `<name>.png` | 290×285 | Lưới 5 cột × 4 hàng, mỗi frame **58×71**. Hàng: 0 = đi xuống, 1 = trái, 2 = phải, 3 = lên. 5 frame chu kỳ đi bộ; cột index 2 là tư thế đứng yên |
| `<name>_avatar.png` | 210×230 | Chân dung bán thân, nhìn thẳng, dùng trong phòng + HUD |

Prompt ý tưởng 4 nhân vật:
```text
Design 4 original chibi mascot characters for a water-balloon party game, full body, 2.5 heads tall,
big head, big expressive eyes, each wearing a distinct hat/hood silhouette so they are recognizable
at 58x71 pixels:
1) a brave red fox-hooded kid with a bandage on the nose,
2) a cheerful pink mushroom-cap girl with freckles,
3) a sleepy blue penguin-hoodie boy,
4) a mischievous yellow frog-hat kid with goggles.
Character turnaround sheet: front, left side, right side, back. Transparent background.
```

Prompt sprite đi bộ (lặp cho từng nhân vật + từng hướng):
```text
[character description], 5-frame walk cycle facing [down / left / right / up], 3/4 top-down view,
feet at the bottom of each frame, same scale every frame, pixel-perfect grid of 5 frames 58x71 px,
transparent background, frame 3 is a neutral standing pose.
```

Prompt avatar:
```text
[character description], bust portrait, facing viewer, happy confident expression, soft rim light,
fits 210x230, transparent background.
```

### Bị nhốt / nổ bong bóng — `player/bomber_deads.png` (400×400)
Lưới 4×4, mỗi frame **100×100**, 16 frame chạy theo thứ tự:
```text
16-frame sprite sheet (4x4 grid, 100x100 each): a generic silhouette-free translucent water bubble
trapping a character: frames 1-8 the bubble wobbles and shimmers, frames 9-12 the bubble cracks with
droplets, frames 13-16 it bursts into splash droplets and fades out. Character inside is NOT drawn
(the game draws it). Transparent background.
```

---

## 2. Bóng nước & vụ nổ — `assets/images/boom/`

| File | Kích thước | Bố cục |
|---|---|---|
| `custom_bubble_100.png`, `_101`, `_102` | 219×84 | 3 frame **73×84** nằm ngang, bóng phập phồng (3 skin: xanh dương, hồng, xanh lá) |
| `custom_bubble_10x_avatar.png` | 38×38 | Icon nhỏ của từng skin |
| `explosion.png` | 1022×103 | 10 frame ~**102×103** nằm ngang |

```text
Water balloon bomb, round, glossy, with a tied knot and a tiny fuse-like ribbon, [blue / pink / green],
3-frame idle squash-and-stretch pulse animation, horizontal strip, each frame 73x84, transparent background.
```
```text
Cartoon water splash explosion, 10-frame horizontal strip, each frame 102x103: starts as a small burst,
expands into a big crown splash with droplets and foam, then dissipates into mist. Blue-white water,
top-down view, transparent background. The game tiles this frame along a cross-shaped blast.
```

---

## 3. Vật phẩm — `assets/images/items/`

| File | Kích thước | Nội dung |
|---|---|---|
| `item_bombs.png` | 128×52 | 4 frame **32×52**: +1 bóng nước |
| `item_bombsizes.png` | 128×50 | 4 frame **32×50**: tăng tầm nổ (lọ nước) |
| `item_shoes.png` | 128×47 | 4 frame **32×47**: tăng tốc (giày có cánh) |
| `move_1.png` | 589×98 | 6 frame ~**98×98**: hiệu ứng lấp lánh khi nhặt đồ/cứu bạn |

```text
Power-up icon: [a small extra water balloon / a blue potion bottle with a water drop / a sneaker with tiny wings],
inside a soft glowing bubble, 4-frame gentle float and shine animation, horizontal strip,
each frame 32 px wide, transparent background, readable at tiny size.
```
```text
Sparkle pickup effect, stars and glitter burst, 6-frame horizontal strip 98x98 each, transparent background.
```

---

## 4. Bản đồ (5 chủ đề) — `assets/images/map/<theme>/`

Thư mục: `desert_mode`, `land_mode`, `town_mode`, `underwater_mode`, `xmas_mode`.

| File | Kích thước | Nội dung |
|---|---|---|
| `floor.png` | 128×128 | Nền lặp liền mạch (seamless) |
| `brick.png` | 64×89 | Khối **phá được**: mặt trên 64×64 + mặt trước ~25px (khối có chiều cao, căn đáy) |
| `gift_box.png` | 64×89 | Khối phá được loại 2 (hộp/thùng) |
| `stone.png` | 64×89 | Khối **không phá được** |
| `../<theme>_avatar.jpg` | 716×526 | Ảnh xem trước bản đồ trong phòng |
| `../time_border.png` | 125×42 | Khung đồng hồ phía trên (dùng chung) |

```text
Top-down 3/4 game tile set for a [desert oasis / flower meadow / cozy toy town / coral reef underwater /
snowy christmas village] arena. Provide:
(a) seamless tileable ground texture 128x128,
(b) breakable block 64x89: a [clay brick wall / wooden crate / shop crate / coral chunk / snowman-wrapped present],
    top face 64x64 visible plus ~25 px front face, bottom-aligned,
(c) second breakable block 64x89: a gift box variant,
(d) indestructible block 64x89: a [sandstone pillar / big rock / house / giant shell / ice pillar].
Consistent perspective, transparent background for blocks.
```
```text
Map preview thumbnail 716x526: bird's-eye view of a 21x13 grid arena in the [theme] style,
filled with blocks and open lanes, colorful, no UI, no text.
```
```text
Small wooden-and-gold timer frame 125x42, empty center for digits, cartoon style, transparent background.
```

---

## 5. Nền màn hình — `assets/images/background/`

Stage game là **1200×624** (tỉ lệ ~1.92:1). Nên gen 1600×832 rồi xuất theo tên dưới (CSS dùng `cover`).

| File | Dùng cho |
|---|---|
| `welcome.jpg` | Màn giới thiệu (cần chừa chỗ giữa cho logo + nút "Bắt đầu") |
| `home.jpg` | Menu chính / chọn chế độ / phòng |
| `setting.jpg` | Màn cài đặt |

```text
Wide game title-screen background 1600x832 for an original water-balloon party game: [sunny rainbow sky
with fluffy clouds and floating water balloons / playful town square at golden hour / soft pastel
bubbles pattern], the 4 mascot characters playing on the sides, keep the center 40% calm and empty
for UI, no text, no logo.
```

Logo nhỏ `assets/images/tile_image.png` (78×72, dùng ở HUD + favicon):
```text
Game icon: a glossy water balloon with a cheeky face and a splash, 78x72, transparent background.
```
Nên gen thêm logo lớn chữ tên game mới + icon app 1024×1024 cho store.

---

## 6. Nút & giao diện — `assets/images/buttons/`

| File | Kích thước | Bố cục |
|---|---|---|
| `button.png` / `button_touch.png` | 218×47 | Nút trống (thường / hover), chữ do code vẽ |
| `1P.png` / `1P_touch.png` | ~840×265 | Thẻ chế độ 1 người (thường / hover), có minh họa + chữ "1 PLAYER" |
| `2P.png` / `2P_touch.png` | ~850×265 | Thẻ chế độ 2 người |
| `arrow_left.png`, `arrow_right.png` | 512×512 | Mũi tên tròn |
| `back.png` / `back_touch.png` | 75×75 | Nút quay lại tròn |
| `pause_menu.png` | 258×389 | Bảng tạm dừng pixel-art; tiêu đề "PAUSED" trên cùng, chừa chỗ cho 2 nút âm thanh, thanh âm lượng và 3 nút ở đáy (giữ bố cục giống bảng hiện tại vì code định vị theo pixel) |
| `sound_button.png` | 126×84 | Lưới 3×2 ô **42×42**: cột = thường / hover / nhấn, hàng 0 = bật, hàng 1 = tắt tiếng |
| `urm_buttons.png` | 168×168 | Lưới 3×3 ô **56×56**: hàng = tiếp tục (play) / chơi lại / về nhà; cột = thường / hover / nhấn |
| `volume_buttons.png` | 299×44 | 3 núm kéo **28×44** (thường / hover / nhấn) ở x=0–84, rồi thanh trượt rộng **215** từ x=84 |

```text
Cohesive game UI kit, candy-cartoon style matching the characters: rounded glossy buttons with soft
drop shadow and white highlight, colors sky blue (#2675BF accent) and cream (#F9F8F0).
Include: empty wide button 218x47 in normal and hover states; round arrow buttons left/right; round back
button; square icon buttons (speaker on, speaker muted, play, replay, home) each in normal/hover/pressed;
a volume slider track and knob. Pixel-aligned, transparent background, no text except where specified.
```
```text
Pixel-art pause menu board 258x389, wooden frame with cream parchment inside, title "PAUSED" in a chunky
pixel font at the top, empty slots for two small sound toggles, one horizontal slider, and three square
buttons at the bottom. Transparent outside the board.
```

---

## 7. Âm thanh — `assets/sounds/` (WAV hoặc đổi sang OGG/MP3 + sửa `js/audio.js`)

Nhạc (loop liền mạch, 60–120 giây):

| File | Dùng cho | Gợi ý prompt nhạc (Suno / Udio / soạn tay) |
|---|---|---|
| `background.wav` | Màn giới thiệu | `upbeat cheerful chiptune-pop intro theme, bouncy, 128bpm, seamless loop, instrumental` |
| `soundMenu.wav` | Menu / phòng offline | `light playful menu music, marimba and synth, relaxed, seamless loop, instrumental` |
| `online.wav` | Sảnh / phòng online | `energetic lobby music, funky bass, anticipation, seamless loop, instrumental` |
| `soundGame.wav` | Trận mặc định | `fast fun battle music for a cartoon party game, 140bpm, seamless loop, instrumental` |
| `desert.wav` | Map sa mạc | `arabian-flavored cartoon battle theme, darbuka, loop` |
| `land.wav` | Map đồng cỏ | `sunny countryside cartoon battle theme, ukulele and whistle, loop` |
| `town.wav` | Map thị trấn | `bustling toy-town cartoon battle theme, brass and xylophone, loop` |
| `underwater.wav` | Map dưới nước | `bubbly underwater cartoon theme, steel drums, loop` |
| `xmas.wav` | Map Giáng sinh | `festive christmas cartoon battle theme, sleigh bells, loop` |

Hiệu ứng (ngắn 0.1–2 giây):

| File | Sự kiện |
|---|---|
| `set_boom.wav` | Đặt bóng nước (tiếng "bộp" cao su) |
| `boom_bang.wav`, `bang_bang.wav` | Bóng nổ (2 biến thể tiếng nước bắn tung) |
| `eat_item.wav` | Nhặt vật phẩm (ting vui) |
| `touch.wav` | Bị nhốt vào bong bóng |
| `die.wav` | Bong bóng vỡ / bị loại |
| `item.wav` | Cứu đồng đội |
| `start.wav` | Bắt đầu trận ("Ready… Go!") |
| `win.wav` / `lose.wav` | Thắng / thua (jingle 2–4 giây) |
| `click.wav` / `move.wav` | Bấm nút / rê chuột qua nút |
| `bye_bye.wav` | Rời phòng |

Nguồn SFX dùng thương mại: tự tạo bằng jsfxr/ChipTone, hoặc Kenney.nl (CC0), Freesound (chỉ lấy CC0).

---

## Checklist sau khi gen
- [ ] Đúng tên file + kích thước từng bảng trên; sprite sheet đúng lưới frame.
- [ ] PNG nền trong suốt, không viền trắng/halo.
- [ ] Mở `http://localhost:3000` kiểm tra: phòng (avatar), trong trận (đi 4 hướng, nổ, bị nhốt, vật phẩm), tạm dừng, kết quả.
- [ ] Xóa hẳn asset gốc Nexon, `assets/map_data` và tự thiết kế lại bố cục bản đồ trong `js/maps-data.js`.
- [ ] Lưu lại bằng chứng giấy phép (điều khoản công cụ AI, license nhạc/SFX).
