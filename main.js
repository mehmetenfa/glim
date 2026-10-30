const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, powerMonitor, powerSaveBlocker } = require('electron');
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
const LOCK_INSTANT = -1;
const LOCK_OPTIONS = [0, LOCK_INSTANT, 1, 2, 5, 10, 15, 30]; // çekildikten kaç dk sonra kilitlensin; 0 = kapalı, -1 = anında
const DEFAULTS = { mode: 'clock', showClock: false, dim: 0.85, idleMinutes: 15, keepAwake: true, lockMinutes: 5 };

let wins = [];
let blockerId = null;
let lockTimer = null;
let openedAt = 0;
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

function openOverlay() {
  if (wins.length) return;
  openedAt = Date.now();
  const cursorId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  for (const display of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      ...display.bounds,
      frame: false,
      show: false,
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
      if (display.id === cursorId) w.focus();
      w.webContents.send('settings', settings);
    });
    w.on('closed', () => {
      wins = wins.filter((x) => x !== w);
      syncSleepBlocker();
      syncLockTimer();
      closeOverlay();
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
  const want = wins.length > 0 && settings.keepAwake;
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

function lockScreen() {
  if (process.platform === 'darwin') {
    execFile('osascript', ['-l', 'JavaScript', '-e', MAC_LOCK_JXA], (err) => {
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
  if (!wins.length || !settings.lockMinutes) return;
  // Anında: ekran bir an belirsin diye kısa bir gecikmeyle kilitle.
  const wait = settings.lockMinutes === LOCK_INSTANT ? 600 : openedAt + settings.lockMinutes * 60000 - Date.now();
  if (wait <= 0) return;
  lockTimer = setTimeout(() => {
    idleArmed = false;
    lockScreen();
    setTimeout(closeOverlay, 800);
  }, wait);
}

function closeOverlay() {
  for (const w of [...wins]) if (!w.isDestroyed()) w.close();
}

function toggleOverlay() {
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

  ipcMain.on('close', closeOverlay);
  ipcMain.on('update', (_e, patch) => update(patch));
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
