import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import http from 'node:http';
import { URL } from 'node:url';

// Loopback server catches Spotify's OAuth redirect (a fixed URI must be
// registered in the app dashboard), then hands the code back over IPC.
const OAUTH_PORT = 17872;
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/callback`;

let mainWindow: BrowserWindow | null = null;
let oauthServer: http.Server | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false, // renders its own chrome (the device shell)
    hasShadow: false, // avoids an OS drop-shadow rectangle behind the transparent areas
    titleBarStyle: 'hidden',
    title: 'Retro Music Player',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function startOAuthListener(): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }

    oauthServer = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://127.0.0.1:${OAUTH_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (error) {
          res.end(`<html><body style="background:#111;color:#eee;font-family:sans-serif;text-align:center;padding-top:80px">
            <h2>Authorization failed</h2><p>${error}</p><p>You can close this window.</p></body></html>`);
          reject(new Error(error));
        } else if (code && state) {
          res.end(`<html><body style="background:#111;color:#eee;font-family:sans-serif;text-align:center;padding-top:80px">
            <h2>Connected to Spotify ✓</h2><p>You can close this window and return to Retro Music Player.</p></body></html>`);
          resolve({ code, state });
        } else {
          res.end('Missing code/state');
          reject(new Error('Missing code/state in callback'));
        }

        oauthServer?.close();
        oauthServer = null;
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    oauthServer.listen(OAUTH_PORT, '127.0.0.1');
  });
}

ipcMain.handle('oauth:start', async (_evt, authorizeUrl: string) => {
  const resultPromise = startOAuthListener();
  await shell.openExternal(authorizeUrl);
  return resultPromise;
});

ipcMain.handle('oauth:redirect-uri', () => REDIRECT_URI);

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:close', () => mainWindow?.close());

app.setName('Retro Music Player');

// No Widevine/DRM needed: this app never decodes audio, it only remote-controls Spotify via the Web API.
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
