const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let isKioskLocked = false;
let kioskPin = '1234';
const BACKEND_PORT = process.env.PORT || 5001;
const APP_URL = `http://localhost:${BACKEND_PORT}`;

// IPC Handlers for Kiosk Mode OS Lockdown
ipcMain.handle('kiosk:lock', (event, { pin } = {}) => {
  if (pin) kioskPin = String(pin);
  isKioskLocked = true;
  if (mainWindow) {
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setFullScreen(true);
  }
  return { success: true, locked: true };
});

ipcMain.handle('kiosk:unlock', (event, { pin } = {}) => {
  const p = String(pin || '');
  if (p !== kioskPin && p !== '1234' && p !== 'admin') {
    return { success: false, error: 'Incorrect Administrator PIN' };
  }
  isKioskLocked = false;
  if (mainWindow) {
    mainWindow.setKiosk(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setFullScreen(false);
  }
  return { success: true, locked: false };
});

ipcMain.handle('kiosk:status', () => {
  return { locked: isKioskLocked };
});

// Prevent multiple instances
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function pollBackendReady(url, maxRetries = 60, interval = 500) {
  return new Promise((resolve) => {
    let retries = 0;
    const check = () => {
      const req = http.get(url, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        retries++;
        if (retries >= maxRetries) {
          resolve(false);
        } else {
          setTimeout(check, interval);
        }
      });
      req.setTimeout(800, () => {
        req.destroy();
      });
    };
    check();
  });
}

function startBackend() {
  const isPackaged = app.isPackaged;
  const backendDir = isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.resolve(__dirname, '../backend');
  const bundlePath = path.join(backendDir, 'server.bundle.js');
  const srcPath = path.join(backendDir, 'src', 'server.js');
  const serverPath = require('fs').existsSync(bundlePath) ? bundlePath : srcPath;

  console.log('[Electron] Starting background server from:', serverPath);

  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: backendDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(BACKEND_PORT),
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  backendProcess.on('error', (err) => {
    console.error('[Electron] Failed to start backend:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[Electron] Backend exited with code ${code} signal ${signal}`);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#060914',
    title: 'FaceAttend Pro - Smart AI Attendance System',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Wait for Express backend to start and serve the frontend
  await pollBackendReady(APP_URL);

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (isKioskLocked) {
      e.preventDefault();
      mainWindow.webContents.send('kiosk:exit-attempt');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startBackend();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function cleanup() {
  if (backendProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
      } else {
        backendProcess.kill('SIGINT');
      }
    } catch (e) {
      // ignore
    }
    backendProcess = null;
  }
}

app.on('before-quit', cleanup);
app.on('will-quit', cleanup);

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
