/*
 * KegHero — Heineken Pour Demo
 * Waveshare ESP32-S3-Touch-LCD-4  (480x480)
 * Board : ESP32S3 Dev Module | OPI PSRAM | 16MB Flash
 * Library: GFX_Library_for_Arduino (moononournation)
 */

#include <Arduino_GFX_Library.h>
#include "HWCDC.h"
HWCDC USBSerial;

// ─── Display driver (correct pins from Waveshare WiFi Analyzer example) ───────
Arduino_DataBus *bus = new Arduino_SWSPI(
  GFX_NOT_DEFINED /* DC */, 42 /* CS */,
  2 /* SCK */, 1 /* MOSI */, GFX_NOT_DEFINED /* MISO */);

Arduino_ESP32RGBPanel *rgbpanel = new Arduino_ESP32RGBPanel(
  40 /* DE */,  39 /* VSYNC */, 38 /* HSYNC */, 41 /* PCLK */,
  46 /* R0 */,   3 /* R1 */,    8 /* R2 */,    18 /* R3 */,  17 /* R4 */,
  14 /* G0 */,  13 /* G1 */,   12 /* G2 */,    11 /* G3 */,  10 /* G4 */,  9 /* G5 */,
   5 /* B0 */,  45 /* B1 */,   48 /* B2 */,    47 /* B3 */,  21 /* B4 */,
  1, 10, 8, 50,   // hsync: polarity, front_porch, pulse_width, back_porch
  1, 10, 8, 20    // vsync: polarity, front_porch, pulse_width, back_porch
);

Arduino_RGB_Display *gfx = new Arduino_RGB_Display(
  480 /* width */, 480 /* height */, rgbpanel, 2 /* rotation */, true /* auto_flush */,
  bus, GFX_NOT_DEFINED /* RST */,
  st7701_type1_init_operations, sizeof(st7701_type1_init_operations));

// ─── Off-screen canvas for flicker-free animation ────────────────────────────
Arduino_Canvas *canvas = nullptr;

// ─── Backlight ────────────────────────────────────────────────────────────────
#define GFX_BL 46  // not used as RGB pin on this board revision

// ─── Dimensions ───────────────────────────────────────────────────────────────
#define W   480
#define H   480
#define CX  (W/2)
#define CY  (H/2)

// ─── Color palette (RGB565) ───────────────────────────────────────────────────
#define C_BLACK    0x0000
#define C_BG       0x0841
#define C_BG2      0x18C3
#define C_GREEN    0x0534   // Heineken #00A651
#define C_GREEN_DK 0x0240
#define C_GREEN_LT 0x2FCC
#define C_AMBER    0xF440
#define C_AMBER_DK 0xB200
#define C_AMBER_LT 0xFEE0
#define C_FOAM     0xF7BE
#define C_GOLD     0xFEC0
#define C_WHITE    0xFFFF
#define C_GREY     0x7BCF
#define C_GREY_DK  0x39E7
#define C_RED      0xE000
#define C_RED_DK   0x6000

// ─── State machine ────────────────────────────────────────────────────────────
enum State { ST_SPLASH, ST_IDLE, ST_POURING, ST_POUR_DONE, ST_ALERT };
State    gState     = ST_SPLASH;
uint32_t stateStart = 0;
uint32_t frame      = 0;
float    pourFill   = 0.0f;
float    pourMl     = 0.0f;

// ─── Bubbles ─────────────────────────────────────────────────────────────────
struct Bubble { float x, y, r, speed; };
#define N_BUBBLES 16
Bubble bubbles[N_BUBBLES];

void initBubbles() {
  for (int i = 0; i < N_BUBBLES; i++) {
    bubbles[i].x     = CX - 38 + random(76);
    bubbles[i].y     = 290 + random(70);
    bubbles[i].r     = 1.5f + random(200) / 100.0f;
    bubbles[i].speed = 0.4f + random(80)  / 100.0f;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Centered text
void ctext(const char *txt, int y, uint8_t sz, uint16_t col) {
  canvas->setTextColor(col);
  canvas->setTextSize(sz);
  int16_t x1, y1; uint16_t tw, th;
  canvas->getTextBounds(txt, 0, y, &x1, &y1, &tw, &th);
  canvas->setCursor(CX - tw / 2, y);
  canvas->print(txt);
}

// Filled rounded rect with optional border
void card(int x, int y, int w, int h, int r, uint16_t fill, uint16_t border = 0) {
  canvas->fillRoundRect(x, y, w, h, r, fill);
  if (border) canvas->drawRoundRect(x, y, w, h, r, border);
}

// Simple 5-point star
void drawStar(int cx, int cy, int R, int r, uint16_t col) {
  int16_t xs[10], ys[10];
  for (int i = 0; i < 10; i++) {
    float a   = -M_PI / 2 + i * M_PI / 5;
    float rad = (i % 2 == 0) ? R : r;
    xs[i] = cx + (int)(rad * cosf(a));
    ys[i] = cy + (int)(rad * sinf(a));
  }
  for (int i = 0; i < 10; i++) {
    int j = (i + 1) % 10;
    canvas->fillTriangle(cx, cy, xs[i], ys[i], xs[j], ys[j], col);
  }
}

// Beer glass with liquid, foam and bubbles
void drawGlass(int cx, int cy, int gh, float fill) {
  int gw   = 90, rimW = 110;
  int y0   = cy - gh / 2, yb = cy + gh / 2, base = 18;

  canvas->fillRect(cx - gw/2, y0 + 6, gw, gh - base - 6, C_BG2);

  if (fill > 0.01f) {
    int fh  = (int)((gh - base - 10) * fill);
    int fy  = yb - base - fh;
    // Liquid gradient (2 bands)
    canvas->fillRect(cx - gw/2 + 2, fy + fh/2, gw - 4, fh - fh/2, C_AMBER_LT);
    canvas->fillRect(cx - gw/2 + 2, fy,         gw - 4, fh/2,       C_AMBER);
    // Foam
    if (fill > 0.07f) {
      int fmH = max(7, (int)(fh * 0.10f));
      canvas->fillRect(cx - gw/2 + 2, fy - fmH, gw - 4, fmH, C_WHITE);
      canvas->fillRect(cx - gw/2 + 2, fy - fmH, gw - 4, fmH/2, C_FOAM);
    }
    // Bubbles
    for (int i = 0; i < N_BUBBLES; i++) {
      if (bubbles[i].y > fy && bubbles[i].y < yb - base - 4
          && bubbles[i].x > cx - gw/2 + 4 && bubbles[i].x < cx + gw/2 - 4)
        canvas->drawCircle((int)bubbles[i].x, (int)bubbles[i].y,
                           (int)bubbles[i].r, C_AMBER_LT);
    }
  }

  // Outline
  canvas->drawFastHLine(cx - rimW/2, y0,       rimW, C_GREY);
  canvas->drawLine(cx - rimW/2, y0, cx - gw/2, yb - base, C_GREY);
  canvas->drawLine(cx + rimW/2, y0, cx + gw/2, yb - base, C_GREY);
  canvas->drawFastHLine(cx - gw/2, yb - base,  gw,   C_GREY);
  canvas->fillRect(cx - gw/2, yb - base + 1,   gw, base - 1, C_GREY_DK);
  canvas->drawFastHLine(cx - gw/2, yb,          gw,   C_GREY);
}

// ─── Screens ─────────────────────────────────────────────────────────────────
void drawSplash() {
  canvas->fillScreen(C_BLACK);
  // Green gradient top half
  for (int y = 0; y < 200; y++)
    canvas->drawFastHLine(0, y, W, (y < 80) ? C_GREEN_DK : C_BG);

  // Heineken star logo
  canvas->drawCircle(CX, 158, 96, C_GOLD);
  drawStar(CX, 158, 80, 32, C_GOLD);
  drawStar(CX, 158, 46, 18, C_GREEN);

  ctext("HEINEKEN",     276, 3, C_WHITE);
  canvas->drawFastHLine(CX - 120, 314, 240, C_GREEN);
  ctext("LIVE POUR MONITOR", 328, 2, C_GREEN_LT);

  canvas->fillRect(0, 440, W, 40, C_GREEN);
  canvas->setTextColor(C_BLACK);
  canvas->setTextSize(2);
  ctext("TAP 01  -  La Cerveceria", 452, 2, C_BLACK);

  canvas->flush();
}

void drawIdle() {
  canvas->fillScreen(C_BLACK);

  // Top bar
  canvas->fillRect(0, 0, W, 52, C_GREEN);
  drawStar(28, 26, 17, 7, C_GOLD);
  canvas->setTextColor(C_BLACK);
  canvas->setTextSize(3);
  canvas->setCursor(54, 10);
  canvas->print("HEINEKEN");

  // ON TAP badge
  card(CX - 50, 62, 100, 26, 8, C_GREEN);
  ctext("ON TAP", 70, 1, C_BLACK);

  // Keg body
  int kx = CX, ky = 210, kw = 100, kh = 128;
  canvas->fillRoundRect(kx - kw/2, ky - kh/2, kw, kh, 10, C_GREEN_DK);
  canvas->drawRoundRect(kx - kw/2, ky - kh/2, kw, kh, 10, C_GREEN);
  canvas->fillRect(kx - kw/2 - 7, ky - kh/2 + 12, kw + 14, 10, C_GREEN);
  canvas->fillRect(kx - kw/2 - 7, ky + kh/2 - 22, kw + 14, 10, C_GREEN);
  canvas->fillCircle(kx, ky, 16, C_GREEN);
  canvas->fillCircle(kx, ky,  8, C_GREEN_DK);

  // Blinking dot
  uint16_t pulse = (millis() % 1200 < 600) ? C_GREEN : C_GREEN_DK;
  canvas->fillCircle(CX - 72, 424, 5, pulse);
  ctext("Waiting for pour...", 418, 1, C_GREY);

  // Stat cards
  card(22,  358, 132, 52, 8, C_BG, C_GREY_DK);
  card(174, 358, 132, 52, 8, C_BG, C_GREY_DK);
  card(326, 358, 132, 52, 8, C_BG, C_GREY_DK);
  canvas->setTextSize(1);
  canvas->setTextColor(C_GREY);
  canvas->setCursor(38,  366); canvas->print("Keg level");
  canvas->setCursor(190, 366); canvas->print("Temp");
  canvas->setCursor(342, 366); canvas->print("CO2");
  canvas->setTextSize(2);
  canvas->setTextColor(C_GREEN_LT); canvas->setCursor(36,  382); canvas->print("72%");
  canvas->setTextColor(C_AMBER_LT); canvas->setCursor(184, 382); canvas->print("4.1C");
  canvas->setTextColor(C_WHITE);    canvas->setCursor(336, 382); canvas->print("2.4b");

  canvas->flush();
}

void drawPouring(float fill, float ml) {
  int gy = 240, gh = 200, yb = gy + gh/2, base = 18;
  int fillTop = (int)(yb - base - (gh - base - 10) * fill);

  for (int i = 0; i < N_BUBBLES; i++) {
    bubbles[i].y -= bubbles[i].speed;
    if (bubbles[i].y < fillTop + 4) {
      bubbles[i].y = yb - base - 6;
      bubbles[i].x = CX - 38 + random(76);
    }
  }

  canvas->fillScreen(C_BLACK);

  // Header
  canvas->fillRect(0, 0, W, 50, C_AMBER_DK);
  canvas->setTextColor(C_WHITE);
  canvas->setTextSize(3);
  canvas->setCursor(18, 8);
  canvas->print("POURING");
  drawStar(W - 36, 25, 16, 7, C_GOLD);

  // Beer stream from tap
  if (fill < 0.96f)
    canvas->fillRect(CX - 3, 52, 6, gy - gh/2 - 44, C_AMBER_LT);

  drawGlass(CX, gy, gh, fill);

  // mL counter
  char mlb[16]; snprintf(mlb, 16, "%.0f mL", ml);
  canvas->setTextSize(3);
  ctext(mlb, 366, 3, C_WHITE);

  canvas->setTextSize(1);
  ctext("Flow: 3.1 L/min", 412, 1, C_GREY);

  // Progress bar
  canvas->fillRoundRect(40, 442, W - 80, 14, 7, C_GREY_DK);
  if (fill > 0.005f)
    canvas->fillRoundRect(40, 442, (int)((W - 80) * fill), 14, 7, C_AMBER);

  canvas->flush();
}

void drawPourDone(float ml) {
  canvas->fillScreen(C_BLACK);
  canvas->fillRect(0, 0, W, 66, C_GREEN);
  ctext("POUR DONE", 14, 3, C_BLACK);

  canvas->fillCircle(CX, 188, 58, C_GREEN);
  canvas->fillCircle(CX, 188, 42, C_BLACK);
  canvas->fillCircle(CX, 188, 34, C_GREEN);

  char mlb[24]; snprintf(mlb, 24, "%.0f mL poured", ml);
  canvas->setTextSize(2);
  ctext(mlb, 282, 2, C_WHITE);
  canvas->setTextSize(1);
  ctext("Keg: 72% remaining  (36.1 L)", 314, 1, C_GREY);

  card(38,  358, 122, 56, 8, C_BG, C_GREY_DK);
  card(179, 358, 122, 56, 8, C_BG, C_GREY_DK);
  card(320, 358, 122, 56, 8, C_BG, C_GREY_DK);
  canvas->setTextSize(1);
  canvas->setTextColor(C_GREY);
  canvas->setCursor(56,  366); canvas->print("Today");
  canvas->setCursor(197, 366); canvas->print("Pours");
  canvas->setCursor(338, 366); canvas->print("Waste");
  canvas->setTextSize(2);
  canvas->setTextColor(C_AMBER_LT); canvas->setCursor(46,  382); canvas->print("12.4L");
  canvas->setTextColor(C_WHITE);    canvas->setCursor(197, 382); canvas->print("   8");
  canvas->setTextColor(C_GREEN_LT); canvas->setCursor(334, 382); canvas->print("2.1%");

  canvas->flush();
}

void drawAlert(bool flash) {
  canvas->fillScreen(flash ? C_RED_DK : C_BLACK);
  canvas->fillRect(0, 0, W, 66, flash ? C_RED : C_RED_DK);
  ctext("! ALERT !", 14, 3, C_WHITE);

  card(24, 90, W - 48, 118, 12, C_RED_DK, C_RED);
  canvas->setTextSize(1);
  ctext("TEMPERATURE WARNING", 102, 1, C_WHITE);
  canvas->setTextSize(2);
  ctext("7.8 C  -  Tap #1", 124, 2, C_AMBER_LT);
  canvas->setTextSize(1);
  ctext("Threshold: 6.0 C  |  Check cooler", 164, 1, C_GREY);

  ctext("Other taps: OK", 244, 1, C_GREEN_LT);

  card(24, 268, W - 48, 58, 10, C_BG, C_GREY_DK);
  canvas->setTextColor(C_GREY); canvas->setTextSize(1);
  canvas->setCursor(40, 278); canvas->print("Tap #2  Guinness Extra");
  canvas->setCursor(40, 294); canvas->print("Tap #3  Heineken");
  canvas->setTextColor(C_GREEN_LT);
  canvas->setCursor(336, 278); canvas->print("4.1 C");
  canvas->setCursor(336, 294); canvas->print("3.9 C");

  ctext("Touch to dismiss", 450, 1, C_GREY_DK);
  canvas->flush();
}

// ─── State control ────────────────────────────────────────────────────────────
void setState(State s) {
  gState     = s;
  stateStart = millis();
  if (s == ST_POURING) { pourFill = 0; pourMl = 0; initBubbles(); }
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  USBSerial.begin(115200);

  if (!gfx->begin()) {
    USBSerial.println("ERROR: gfx->begin() failed");
    while (1) delay(500);
  }
  gfx->fillScreen(C_BLACK);

  canvas = new Arduino_Canvas(W, H, gfx);
  if (!canvas->begin()) {
    USBSerial.println("ERROR: canvas->begin() failed — check OPI PSRAM is enabled");
    while (1) delay(500);
  }

  setState(ST_SPLASH);
  USBSerial.println("KegHero demo started");
}

// ─── Loop ────────────────────────────────────────────────────────────────────
void loop() {
  uint32_t elapsed = millis() - stateStart;
  frame++;

  switch (gState) {
    case ST_SPLASH:
      drawSplash();
      if (elapsed > 3000) setState(ST_IDLE);
      break;

    case ST_IDLE:
      drawIdle();
      if (elapsed > 4000) setState(ST_POURING);
      break;

    case ST_POURING: {
      float t  = min(1.0f, (float)elapsed / 5500.0f);
      pourFill = t * t * (3.0f - 2.0f * t);
      pourMl   = pourFill * 420.0f;
      drawPouring(pourFill, pourMl);
      if (elapsed > 5500) setState(ST_POUR_DONE);
      break;
    }

    case ST_POUR_DONE:
      drawPourDone(420);
      if (elapsed > 3500) setState(ST_ALERT);
      break;

    case ST_ALERT:
      drawAlert(frame % 15 < 7);
      if (elapsed > 4500) setState(ST_IDLE);
      break;
  }

  delay(16);
}
