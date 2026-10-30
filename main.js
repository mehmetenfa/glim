const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, powerMonitor, powerSaveBlocker, systemPreferences } = require('electron');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const path = require('path');

const SHORTCUT = 'CommandOrControl+Shift+R';
const MODES = [
  { id: 'clock', label: 'Saat' },
  { id: 'breath', label: 'Nefes' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'fireflies', label: 'Ateş böcekleri' },
  { id: 'rain', label: 'Yağmur' },
  { id: 'sphere', label: 'Küre' },
  { id: 'stars', label: 'Yıldızlar' },
  { id: 'waves', label: 'Dalgalar' },
  { id: 'embers', label: 'Közler' },
];
const IDLE_OPTIONS = [0, 5, 10, 15, 30]; // dakika; 0 = kapalı
const FADE_IN_MS = 1100; // perde çekilirken
const FADE_OUT_MS = 700; // perde kalkarken
const AWAKE_AFTER_LOCK_MAX_MS = 60 * 60 * 1000; // kilitten sonra en fazla 1 saat uyanık tut
const LOCK_INSTANT = -1;
const LOCK_OPTIONS = [0, LOCK_INSTANT, 1, 2, 5, 10, 15, 30]; // çekildikten kaç dk sonra kilitlensin; 0 = kapalı, -1 = anında
const DEFAULTS = { mode: 'clock', showClock: false, dim: 0.85, idleMinutes: 15, keepAwake: true, lockMinutes: 5, lockType: 'system' };
// lockType: 'system' = macOS kilit ekranı, 'curtain' = perde oynamaya devam eder, Touch ID / şifre ile kalkar (yalnızca macOS)
const MAX_PASSWORD_TRIES = 5;
const PASSWORD_LOCKOUT_MS = 30000;

let wins = [];
let blockerId = null;
let lockTimer = null;
let openedAt = 0;
let closing = false;
let closingAt = 0;
let curtainLocked = false;
let failedTries = 0;
let lockedOutUntil = 0;
let awakeAfterLock = false;
let awakeTimer = null;
let idleArmed = true; // kilitten sonra kullanıcı etkinleşmeden perde tekrar çekilmesin
let tray = null;
let settings = { ...DEFAULTS };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {}
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings));
  } catch {}
}

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2); // yumuşak başla, yumuşak bitir

function fadeWindow(w, from, to, ms, done) {
  const start = Date.now();
  w.setOpacity(from);
  const timer = setInterval(() => {
    if (w.isDestroyed()) return clearInterval(timer);
    const k = Math.min(1, (Date.now() - start) / ms);
    w.setOpacity(from + (to - from) * ease(k));
    if (k >= 1) {
      clearInterval(timer);
      if (done) done();
    }
  }, 16);
}

function openOverlay() {
  if (wins.length) return;
  openedAt = Date.now();
  const cursorId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  for (const display of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      ...display.bounds,
      frame: false,
      show: false,
      opacity: 0,
      backgroundColor: '#000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      enableLargerThanScreen: true,
      hasShadow: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    w.loadFile('index.html');
    w.once('ready-to-show', () => {
      w.setBounds(display.bounds);
      if (process.platform === 'darwin') w.setSimpleFullScreen(true);
      else w.setFullScreen(true);
      w.show();
      fadeWindow(w, 0, 1, FADE_IN_MS);
      if (display.id === cursorId) w.focus();
      w.webContents.send('settings', settings);
    });
    w.on('closed', () => {
      wins = wins.filter((x) => x !== w);
      if (!wins.length) {
        closing = false;
        curtainLocked = false;
      }
      syncSleepBlocker();
      syncLockTimer();
      if (wins.length) closeOverlay(); // biri kapandıysa diğer ekranlardaki de kapansın
      buildTrayMenu();
    });
    wins.push(w);
  }
  syncSleepBlocker();
  syncLockTimer();
  buildTrayMenu();
}

// Perde çekiliyken (ve ayar açıksa) ekran ve sistem uykuya geçmesin.
function syncSleepBlocker() {
  const want = (wins.length > 0 || awakeAfterLock) && settings.keepAwake;
  if (want && blockerId === null) blockerId = powerSaveBlocker.start('prevent-display-sleep');
  if (!want && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

const MAC_LOCK_JXA = `
ObjC.import('Foundation');
$.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/login.framework').load;
ObjC.bindFunction('SACLockScreenImmediate', ['int', []]);
$.SACLockScreenImmediate();`;

function logLock(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'lock.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// Kilitten sonra ekran ve sistem uyanık kalsın (kilit ekranı görünsün); açılınca ya da süre dolunca bırak.
function holdAwakeAfterLock() {
  awakeAfterLock = true;
  syncSleepBlocker();
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(releaseAwakeAfterLock, AWAKE_AFTER_LOCK_MAX_MS);
  // Kilit komutu ekranı kapattıysa kullanıcı etkinliği bildirerek uyandır.
  if (process.platform === 'darwin') setTimeout(() => execFile('caffeinate', ['-u', '-t', '3']), 1500);
}

function releaseAwakeAfterLock() {
  clearTimeout(awakeTimer);
  awakeAfterLock = false;
  syncSleepBlocker();
}

function lockScreen() {
  logLock(`kilitleniyor (${process.platform})`);
  holdAwakeAfterLock();
  if (process.platform === 'darwin') {
    execFile('osascript', ['-l', 'JavaScript', '-e', MAC_LOCK_JXA], (err, stdout, stderr) => {
      logLock(`osascript bitti: hata=${err ? err.message : 'yok'} cikti=${String(stdout).trim()} ${String(stderr).trim()}`);
      if (err) execFile('pmset', ['displaysleepnow']); // yedek: ekranı uyut
    });
  } else if (process.platform === 'win32') {
    execFile('rundll32.exe', ['user32.dll,LockWorkStation']);
  } else {
    execFile('loginctl', ['lock-session']);
  }
}

// Perde çekildikten lockMinutes dk sonra ekranı kilitle ve perdeyi kaldır.
function syncLockTimer() {
  clearTimeout(lockTimer);
  lockTimer = null;
  if (!wins.length || !settings.lockMinutes || curtainLocked || closing) return;
  // Anında: ekran bir an belirsin diye kısa bir gecikmeyle kilitle.
  const wait = settings.lockMinutes === LOCK_INSTANT ? 600 : openedAt + settings.lockMinutes * 60000 - Date.now();
  if (wait <= 0) return;
  lockTimer = setTimeout(() => {
    idleArmed = false;
    if (settings.lockType === 'curtain' && process.platform === 'darwin') return lockCurtain();
    lockScreen();
    setTimeout(closeOverlay, 800);
  }, wait);
}

function closeOverlay() {
  if (!wins.length) return;
  if (closing && Date.now() - closingAt < 3000) return; // kapanış sürüyor; takılırsa 3 sn sonra yeniden denenebilir
  closing = true;
  closingAt = Date.now();
  for (const w of [...wins]) {
    if (w.isDestroyed()) continue;
    fadeWindow(w, w.getOpacity(), 0, FADE_OUT_MS, () => destroyOverlayWindow(w));
    // Her ne olursa olsun pencere kapanmazsa görünmez bir pencere ekranda kalmasın.
    setTimeout(() => destroyOverlayWindow(w), FADE_OUT_MS + 1500);
  }
}

function destroyOverlayWindow(w) {
  if (w.isDestroyed()) return;
  try {
    if (w.isKiosk()) w.setKiosk(false); // Dock / menü çubuğu / uygulama değiştirme kısıtlarını geri ver
  } catch {}
  w.destroy();
}

// Perde kilidi: perde oynamaya devam eder, kaldırmak için Touch ID / Mac şifresi gerekir.
// Kiosk kipi Dock, menü çubuğu, uygulama değiştirme ve zorla kapatmayı engeller.
function lockCurtain() {
  if (!wins.length || curtainLocked || closing) return;
  curtainLocked = true;
  failedTries = 0;
  const target = BrowserWindow.getFocusedWindow() || wins[0];
  target.setKiosk(true);
  target.focus();
  for (const w of wins) w.webContents.send('locked', true);
  logLock('perde kilitlendi');
}

function unlockCurtain() {
  curtainLocked = false;
  for (const w of wins) if (!w.isDestroyed()) w.webContents.send('locked', false);
  closeOverlay();
  logLock('perde kilidi açıldı');
}

async function requestUnlock() {
  if (!curtainLocked) return { ok: true };
  if (systemPreferences.canPromptTouchID()) {
    try {
      await systemPreferences.promptTouchID('Perdeyi kaldırmak için kimliğini doğrula');
      unlockCurtain();
      return { ok: true };
    } catch {
      // iptal edildi ya da tanınmadı: şifre ile devam
    }
  }
  return { needPassword: true };
}

function verifyPassword(password) {
  return new Promise((resolve) => {
    execFile('dscl', ['.', '-authonly', os.userInfo().username, password], (err) => resolve(!err));
  });
}

async function tryPassword(password) {
  if (!curtainLocked) return { ok: true };
  const now = Date.now();
  if (now < lockedOutUntil) return { ok: false, wait: Math.ceil((lockedOutUntil - now) / 1000) };
  if (typeof password === 'string' && password && (await verifyPassword(password))) {
    unlockCurtain();
    return { ok: true };
  }
  if (++failedTries >= MAX_PASSWORD_TRIES) {
    failedTries = 0;
    lockedOutUntil = Date.now() + PASSWORD_LOCKOUT_MS;
    return { ok: false, wait: PASSWORD_LOCKOUT_MS / 1000 };
  }
  return { ok: false };
}

function toggleOverlay() {
  if (curtainLocked) {
    // Kilitliyken kısayol / menü perdeyi doğrudan kaldıramaz; kimlik doğrulamayı başlat.
    const w = BrowserWindow.getFocusedWindow() || wins[0];
    if (w && !w.isDestroyed()) w.webContents.send('prompt-unlock');
    return;
  }
  wins.length ? closeOverlay() : openOverlay();
}

function update(patch) {
  settings = { ...settings, ...patch };
  saveSettings();
  syncSleepBlocker();
  syncLockTimer();
  for (const w of wins) w.webContents.send('settings', settings);
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: wins.length ? 'Perdeyi kaldır' : 'Perdeyi çek', accelerator: SHORTCUT, click: toggleOverlay },
    { type: 'separator' },
    ...MODES.map((m) => ({
      label: m.label,
      type: 'radio',
      checked: settings.mode === m.id,
      click: () => update({ mode: m.id }),
    })),
    { type: 'separator' },
    {
      label: 'Animasyonun üstünde saat göster',
      type: 'checkbox',
      checked: settings.showClock,
      enabled: settings.mode !== 'clock',
      click: (item) => update({ showClock: item.checked }),
    },
    {
      label: 'Perde çekiliyken bilgisayar uykuya geçmesin',
      type: 'checkbox',
      checked: settings.keepAwake,
      click: (item) => update({ keepAwake: item.checked }),
    },
    {
      label: 'Boşta kalınca perdeyi çek',
      submenu: IDLE_OPTIONS.map((m) => ({
        label: m ? `${m} dakika` : 'Kapalı',
        type: 'radio',
        checked: settings.idleMinutes === m,
        click: () => update({ idleMinutes: m }),
      })),
    },
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'Kilit türü',
            submenu: [
              { id: 'system', label: 'macOS kilit ekranı' },
              { id: 'curtain', label: 'Perde kilidi (perde oynar, Touch ID / şifre ile kalkar)' },
            ].map((t) => ({
              label: t.label,
              type: 'radio',
              checked: settings.lockType === t.id,
              click: () => update({ lockType: t.id }),
            })),
          },
        ]
      : []),
    {
      label: 'Perde çekildikten sonra ekranı kilitle',
      submenu: LOCK_OPTIONS.map((m) => ({
        label: m === 0 ? 'Kilitleme' : m === LOCK_INSTANT ? 'Anında' : `${m} dakika sonra`,
        type: 'radio',
        checked: settings.lockMinutes === m,
        click: () => update({ lockMinutes: m }),
      })),
    },
    { type: 'separator' },
    { label: 'Çık', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  if (process.platform === 'darwin') {
    // "Template" ile biten dosya adı macOS'ta açık/koyu menü çubuğuna göre otomatik renklenir.
    tray = new Tray(path.join(__dirname, 'build', 'trayTemplate.png'));
  } else {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 32, height: 32 });
    tray = new Tray(icon);
  }
  tray.setToolTip('Glim');
  buildTrayMenu();

  if (!globalShortcut.register(SHORTCUT, toggleOverlay)) {
    console.error(`Kısayol kaydedilemedi: ${SHORTCUT}`);
  }

  // Bilgisayar ayarlanan süre boyunca kullanılmazsa perdeyi çek.
  // Mod açıkken tekrar tetiklenmez; kapatınca kullanıcı etkin olduğu için sayaç sıfırlanır.
  setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();
    if (idle < 30) idleArmed = true;
    if (wins.length || !idleArmed || !settings.idleMinutes) return;
    if (idle >= settings.idleMinutes * 60) openOverlay();
  }, 10000);

  powerMonitor.on('unlock-screen', releaseAwakeAfterLock);

  ipcMain.on('close', () => {
    if (!curtainLocked) closeOverlay();
  });
  ipcMain.handle('unlock-request', requestUnlock);
  ipcMain.handle('unlock-password', (_e, password) => tryPassword(password));
  ipcMain.on('update', (_e, patch) => update(patch));
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
