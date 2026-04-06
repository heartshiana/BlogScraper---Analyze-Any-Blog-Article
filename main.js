const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

// ─── Settings ─────────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}
function saveSettings(obj) {
  try { fs.writeFileSync(settingsPath, JSON.stringify({ ...loadSettings(), ...obj }, null, 2)); } catch(e) {}
}

// ─── Resolve scraper.py ────────────────────────────────────────────────────
// Checks settings first, then common locations, then known hardcoded path
function getScraperPath() {
  const { scraperPath } = loadSettings();
  const candidates = [
    scraperPath,                                              // saved in settings (highest priority)
    'D:\\[Downloads]\\files (3)\\scraper.py',               // your known path
    path.join(app.getAppPath(), 'scraper.py'),
    path.join(__dirname, 'scraper.py'),
    path.join(process.cwd(), 'scraper.py'),
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

// ─── Python Detection ──────────────────────────────────────────────────────
function getPythonCandidates() {
  const { pythonPath } = loadSettings();
  const c = [];
  if (pythonPath) c.push(pythonPath);

  if (process.platform === 'win32') {
    // Scan D:\, E:\, etc. for non-standard installs
    for (const drive of ['D', 'E', 'F', 'G', 'C']) {
      for (const folder of ['Python', 'Python3', 'Python313', 'Python312', 'Python311', 'Python310']) {
        c.push(`${drive}:\\${folder}\\python.exe`);
      }
    }
    c.push(
      'py', 'python', 'python3',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python39', 'python.exe'),
      'C:\\Python313\\python.exe', 'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe', 'C:\\Python310\\python.exe',
      path.join(process.env.USERPROFILE || '', 'miniconda3', 'python.exe'),
      path.join(process.env.USERPROFILE || '', 'anaconda3', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'python3.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'python.exe'),
    );
  } else if (process.platform === 'darwin') {
    c.push(
      'python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3', '/opt/homebrew/bin/python',
      path.join(os.homedir(), '.pyenv', 'shims', 'python3'),
      path.join(os.homedir(), 'miniconda3', 'bin', 'python3'),
      '/usr/bin/python',
    );
  } else {
    c.push(
      'python3', 'python', '/usr/bin/python3', '/usr/bin/python',
      '/usr/local/bin/python3', '/usr/local/bin/python',
      path.join(os.homedir(), '.pyenv', 'shims', 'python3'),
      path.join(os.homedir(), 'miniconda3', 'bin', 'python3'),
      '/snap/bin/python3',
    );
  }
  return [...new Set(c)];
}

function testPython(cmd) {
  try {
    const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
    const r = spawnSync(cmd, args, { timeout: 4000, encoding: 'utf8' });
    if (r.error) return null;
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/Python\s+(\d+\.\d+\.\d+)/i);
    if (m) { const [maj] = m[1].split('.').map(Number); return maj >= 3 ? m[1] : null; }
    return null;
  } catch { return null; }
}

let cachedPython = null;
function findWorkingPython() {
  for (const cmd of getPythonCandidates()) {
    const v = testPython(cmd); if (v) return { cmd, version: v };
  }
  return null;
}
function getPython() {
  if (!cachedPython) cachedPython = findWorkingPython();
  return cachedPython;
}

// ─── Window ────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 820, minWidth: 800, minHeight: 600,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#F4F2EE', show: false,
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── IPC Handlers ─────────────────────────────────────────────────────────
ipcMain.handle('detect-python', async () => {
  cachedPython = null;
  const r = findWorkingPython();
  cachedPython = r;
  return r ? { found: true, cmd: r.cmd, version: r.version } : { found: false };
});

ipcMain.handle('set-python-path', async (_, customPath) => {
  const v = testPython(customPath);
  if (!v) return { success: false, error: `"${customPath}" is not a valid Python 3 executable.` };
  saveSettings({ pythonPath: customPath });
  cachedPython = { cmd: customPath, version: v };
  return { success: true, cmd: customPath, version: v };
});

// New handler: let the user point to their scraper.py from the UI
ipcMain.handle('set-scraper-path', async (_, scraperPath) => {
  if (!fs.existsSync(scraperPath)) {
    return { success: false, error: `File not found: "${scraperPath}"` };
  }
  saveSettings({ scraperPath });
  return { success: true, path: scraperPath };
});

ipcMain.handle('get-scraper-path', async () => {
  const p = getScraperPath();
  return { path: p || null };
});

ipcMain.handle('browse-python', async () => {
  const filters = process.platform === 'win32'
    ? [{ name: 'Executable', extensions: ['exe'] }]
    : [{ name: 'All Files', extensions: ['*'] }];
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Python Executable', properties: ['openFile'], filters
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  return { canceled: false, filePath: r.filePaths[0] };
});

ipcMain.handle('scrape-url', async (_, url) => {
  const python = getPython();
  if (!python) return {
    error: 'python_not_found',
    message: 'Python 3 not found. Click ⚙ Settings to set your Python path.'
  };

  const scriptPath = getScraperPath();
  if (!scriptPath) {
    return {
      error: 'script_not_found',
      message: 'scraper.py not found.\n\nOpen ⚙ Settings and set the scraper path to:\nD:\\[Downloads]\\files (3)\\scraper.py'
    };
  }

  return new Promise((resolve) => {
    const args = python.cmd === 'py' ? ['-3', scriptPath, url] : [scriptPath, url];
    const proc = spawn(python.cmd, args, {
      timeout: 30000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
    proc.on('error', err => resolve({
      error: 'spawn_error',
      message: `Failed to run Python: ${err.message}`
    }));
    proc.on('close', (code) => {
      const raw = stdout.trim();
      const errOut = stderr.trim();

      if (!raw) {
        let msg = errOut || `Python exited (code ${code}) with no output.\nPython: ${python.cmd}\nScript: ${scriptPath}`;
        if (msg.includes('No module named')) {
          const match = msg.match(/No module named '?([^\s']+)'?/);
          const pkg = match ? match[1] : 'a required package';
          msg = `Missing package: "${pkg}". Open ⚙ Settings → Install missing packages.`;
        }
        resolve({ error: 'no_output', message: msg.slice(0, 700) });
        return;
      }

      try { resolve(JSON.parse(raw)); }
      catch { resolve({ error: 'parse_error', message: `Bad output:\n${raw.slice(0, 300)}` }); }
    });
  });
});

ipcMain.handle('check-packages', async () => {
  const python = getPython();
  if (!python) return { ok: false, missing: ['beautifulsoup4', 'requests'] };
  return new Promise((resolve) => {
    const script = `import importlib,json\nm=[]\nfor p,i in[('beautifulsoup4','bs4'),('requests','requests')]:\n try:importlib.import_module(i)\n except ImportError:m.append(p)\nprint(json.dumps(m))`;
    const args = python.cmd === 'py' ? ['-3', '-c', script] : ['-c', script];
    const proc = spawn(python.cmd, args, { timeout: 8000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.on('close', () => {
      try { const missing = JSON.parse(out.trim()); resolve({ ok: missing.length === 0, missing, pythonCmd: python.cmd }); }
      catch { resolve({ ok: false, missing: ['beautifulsoup4', 'requests'], pythonCmd: python.cmd }); }
    });
    proc.on('error', () => resolve({ ok: false, missing: ['beautifulsoup4', 'requests'] }));
  });
});

ipcMain.handle('install-packages', async (_, packages) => {
  const python = getPython();
  if (!python) return { success: false, error: 'Python not found' };
  return new Promise((resolve) => {
    const pipArgs = python.cmd === 'py'
      ? ['-3', '-m', 'pip', 'install', '--upgrade', ...packages]
      : ['-m', 'pip', 'install', '--upgrade', ...packages];
    const proc = spawn(python.cmd, pipArgs, { timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { out += d; });
    proc.on('close', code => resolve({ success: code === 0, output: out.slice(-500) }));
    proc.on('error', err => resolve({ success: false, error: err.message }));
  });
});

ipcMain.handle('save-json', async (_, data) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Blog Data', defaultPath: `blog-${Date.now()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!r.canceled && r.filePath) {
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, path: r.filePath };
  }
  return { success: false };
});

ipcMain.handle('open-external', async (_, url) => { await shell.openExternal(url); });
