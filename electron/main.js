const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Allow software WebGL on PCs without working GPU drivers.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#141421',
    title: "Hiphtia's Blessing",
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.type === 'keyDown' && input.key === 'F12' && process.env.HB_DEVTOOLS) {
      win.webContents.toggleDevTools();
    }
  });
}

ipcMain.on('quit', () => app.quit());
// Bundled .vrm models (default townsfolk and Celesti)
ipcMain.handle('readAsset', async (_e, name) => {
  const file = path.join(__dirname, '..', 'dist', 'models', path.basename(String(name)));
  return fs.promises.readFile(file);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
