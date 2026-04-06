'use strict';

// ─── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const homeScreen    = $('homeScreen');
const loadingScreen = $('loadingScreen');
const resultsScreen = $('resultsScreen');
const urlInput      = $('urlInput');
const analyzeBtn    = $('analyzeBtn');
const backBtn       = $('backBtn');
const darkToggle    = $('darkToggle');
const loadingUrl    = $('loadingUrl');
const toast         = $('toast');
const toastMsg      = $('toastMsg');
const toastSuccess  = $('toastSuccess');
const toastSuccessMsg = $('toastSuccessMsg');
const pyBanner      = $('pyBanner');
const pyBannerIcon  = $('pyBannerIcon');
const pyBannerText  = $('pyBannerText');
const pyBannerBtn   = $('pyBannerBtn');

// Settings modal refs
const settingsModal  = $('settingsModal');
const settingsBtn    = $('settingsBtn');
const settingsClose  = $('settingsClose');
const pyStatusDot    = $('pyStatusDot');
const pyStatusText   = $('pyStatusText');
const redetectBtn    = $('redetectBtn');
const pkgStatus      = $('pkgStatus');
const pkgChips       = $('pkgChips');
const installPkgBtn  = $('installPkgBtn');
const pkgLog         = $('pkgLog');
const customPathInput = $('customPathInput');
const browseBtn      = $('browseBtn');
const applyPathBtn   = $('applyPathBtn');
const pythonOrgBtn   = $('pythonOrgBtn');

// ─── State ─────────────────────────────────────────────────────────────────
let currentData = null;
let currentUrl  = '';
let pythonReady = false;
let missingPackages = [];

// ─── Dark mode ─────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
darkToggle.addEventListener('click', () => {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ─── Screens ───────────────────────────────────────────────────────────────
function showScreen(id) {
  [homeScreen, loadingScreen, resultsScreen].forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ─── Toasts ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'error') {
  const el  = type === 'success' ? toastSuccess : toast;
  const mel = type === 'success' ? toastSuccessMsg : toastMsg;
  mel.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── Python Status ─────────────────────────────────────────────────────────
async function checkPython() {
  // Show banner as checking
  pyBanner.style.display = 'flex';
  pyBanner.className = 'py-banner';
  pyBannerIcon.textContent = '⏳';
  pyBannerText.textContent = 'Checking Python installation...';
  pyBannerBtn.style.display = 'none';

  if (!window.electronAPI) return;

  try {
    const pyResult = await window.electronAPI.detectPython();

    if (!pyResult.found) {
      pythonReady = false;
      pyBanner.className = 'py-banner error';
      pyBannerIcon.textContent = '✗';
      pyBannerText.textContent = 'Python 3 not found. Click to configure.';
      pyBannerBtn.textContent = 'Fix →';
      pyBannerBtn.style.display = 'flex';
      return;
    }

    // Python found — check packages
    const pkgResult = await window.electronAPI.checkPackages();
    missingPackages = pkgResult.missing || [];

    if (missingPackages.length > 0) {
      pythonReady = false;
      pyBanner.className = 'py-banner warn';
      pyBannerIcon.textContent = '⚠';
      pyBannerText.textContent = `Python ${pyResult.version} found, but missing: ${missingPackages.join(', ')}`;
      pyBannerBtn.textContent = 'Fix →';
      pyBannerBtn.style.display = 'flex';
    } else {
      pythonReady = true;
      pyBanner.className = 'py-banner ok';
      pyBannerIcon.textContent = '✓';
      pyBannerText.textContent = `Python ${pyResult.version} ready  ·  ${pyResult.cmd}`;
      pyBannerBtn.style.display = 'none';
      // Auto-hide after 4s if all good
      setTimeout(() => { if (pyBanner.classList.contains('ok')) pyBanner.style.display = 'none'; }, 4000);
    }
  } catch (e) {
    pyBanner.className = 'py-banner error';
    pyBannerIcon.textContent = '✗';
    pyBannerText.textContent = 'Could not check Python.';
    pyBannerBtn.textContent = 'Fix →';
    pyBannerBtn.style.display = 'flex';
  }
}

pyBannerBtn.addEventListener('click', openSettings);

// ─── Settings Modal ─────────────────────────────────────────────────────────
function openSettings() {
  settingsModal.classList.add('open');
  runPythonDetect();
  loadScraperPath();
}
function closeSettings() {
  settingsModal.classList.remove('open');
}
settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

async function runPythonDetect() {
  pyStatusDot.className = 'py-status-indicator checking';
  pyStatusText.textContent = 'Scanning for Python...';
  pkgStatus.style.display = 'none';

  const r = await window.electronAPI.detectPython();

  if (r.found) {
    pyStatusDot.className = 'py-status-indicator ok';
    pyStatusText.textContent = `Python ${r.version}  ·  ${r.cmd}`;
    checkModalPackages(r);
  } else {
    pyStatusDot.className = 'py-status-indicator error';
    pyStatusText.textContent = 'Python 3 not found in any standard location.';
    pkgStatus.style.display = 'none';
  }
}

async function checkModalPackages(pyInfo) {
  pkgStatus.style.display = 'flex';
  pkgChips.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">Checking packages...</span>';
  installPkgBtn.style.display = 'none';
  pkgLog.style.display = 'none';

  const r = await window.electronAPI.checkPackages();
  pkgChips.innerHTML = '';

  [['beautifulsoup4','bs4'], ['requests','requests']].forEach(([pkg]) => {
    const missing = (r.missing || []).includes(pkg);
    const chip = document.createElement('div');
    chip.className = `pkg-chip ${missing ? 'missing' : 'ok'}`;
    chip.innerHTML = `<span>${missing ? '✗' : '✓'}</span> ${pkg}`;
    pkgChips.appendChild(chip);
  });

  missingPackages = r.missing || [];
  if (missingPackages.length > 0) {
    installPkgBtn.style.display = 'block';
    installPkgBtn.textContent = `Install ${missingPackages.join(', ')} via pip`;
  }
}

redetectBtn.addEventListener('click', async () => {
  await runPythonDetect();
  await checkPython(); // Also refresh home banner
});

installPkgBtn.addEventListener('click', async () => {
  if (!missingPackages.length) return;
  installPkgBtn.disabled = true;
  installPkgBtn.textContent = 'Installing...';
  pkgLog.style.display = 'block';
  pkgLog.textContent = 'Running pip install...\n';

  const r = await window.electronAPI.installPackages(missingPackages);
  pkgLog.textContent = r.output || '';

  if (r.success) {
    showToast('Packages installed successfully!', 'success');
    await runPythonDetect();
    await checkPython();
  } else {
    pkgLog.textContent = `Failed:\n${r.output || r.error}`;
    installPkgBtn.disabled = false;
    installPkgBtn.textContent = `Retry install`;
  }
});

browseBtn.addEventListener('click', async () => {
  const r = await window.electronAPI.browsePython();
  if (!r.canceled) customPathInput.value = r.filePath;
});

applyPathBtn.addEventListener('click', async () => {
  const p = customPathInput.value.trim();
  if (!p) { showToast('Please enter or browse for a Python path.'); return; }
  applyPathBtn.disabled = true;
  applyPathBtn.textContent = 'Testing...';

  const r = await window.electronAPI.setPythonPath(p);
  applyPathBtn.disabled = false;
  applyPathBtn.textContent = 'Apply & Test';

  if (r.success) {
    showToast(`Python ${r.version} set successfully!`, 'success');
    await runPythonDetect();
    await checkPython();
  } else {
    showToast(r.error || 'Invalid Python executable.');
  }
});

pythonOrgBtn.addEventListener('click', () => {
  window.electronAPI.openExternal('https://www.python.org/downloads/');
});

// ─── Scraper Path ───────────────────────────────────────────────────────────
const scraperPathInput   = $('scraperPathInput');
const browseScraperBtn   = $('browseScraperBtn');
const applyScraperPathBtn = $('applyScraperPathBtn');

// Load current scraper path when settings opens
async function loadScraperPath() {
  if (!window.electronAPI.getScraperPath) return;
  const r = await window.electronAPI.getScraperPath();
  if (r && r.path && scraperPathInput) scraperPathInput.value = r.path;
}

browseScraperBtn && browseScraperBtn.addEventListener('click', async () => {
  const r = await window.electronAPI.browsePython(); // reuse file browser
  if (!r.canceled) scraperPathInput.value = r.filePath;
});

applyScraperPathBtn && applyScraperPathBtn.addEventListener('click', async () => {
  const p = scraperPathInput.value.trim();
  if (!p) { showToast('Please enter or browse for scraper.py path.'); return; }
  const r = await window.electronAPI.setScraperPath(p);
  if (r.success) {
    showToast('scraper.py path saved!', 'success');
  } else {
    showToast(r.error || 'File not found at that path.');
  }
});

// ─── URL Validation ─────────────────────────────────────────────────────────
function isValidUrl(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

// ─── Analyze ───────────────────────────────────────────────────────────────
async function analyze(url) {
  url = url.trim();
  if (!url) { showToast('Please enter a URL.'); urlInput.focus(); return; }
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  if (!isValidUrl(url)) { showToast('Invalid URL — must start with http:// or https://'); return; }

  currentUrl = url;
  loadingUrl.textContent = url;
  showScreen('loadingScreen');

  try {
    const data = await window.electronAPI.scrapeUrl(url);

    // Handle python_not_found specially
    if (data.error === 'python_not_found') {
      showScreen('homeScreen');
      showToast(data.message || 'Python not found.');
      setTimeout(openSettings, 600);
      return;
    }

    if (data.error) {
      showScreen('homeScreen');
      showToast(data.message || data.error);
      return;
    }

    currentData = data;
    renderResults(data);
    showScreen('resultsScreen');
  } catch (err) {
    showScreen('homeScreen');
    showToast(err.message || 'Something went wrong.');
  }
}

// ─── Render results ─────────────────────────────────────────────────────────
function renderResults(data) {
  $('metaDomain').textContent = data.domain || '';
  $('metaTitle').textContent  = data.title || 'Untitled';
  $('metaDesc').textContent   = data.description || '';
  $('metaAuthor').textContent = data.author || '—';
  $('metaDate').textContent   = formatDate(data.date) || '—';

  const pCount = (data.content||[]).filter(b => b.type === 'p').length;
  const hCount = (data.content||[]).filter(b => ['h1','h2','h3','h4'].includes(b.type)).length;
  const words  = (data.content||[]).filter(b => b.type==='p').reduce((a,b) => a + b.text.split(/\s+/).length, 0);
  const imgs   = (data.images||[]).length;

  $('metaCount').textContent    = `${pCount} paragraphs`;
  $('metaImgCount').textContent = `${imgs} found`;

  const chips = $('statChips');
  chips.innerHTML = '';
  [
    { label: `~${words} words`, cls: 'blue' },
    { label: `${hCount} headings` },
    { label: `${imgs} images`, cls: 'yellow' },
  ].forEach(({ label, cls }) => {
    const c = document.createElement('div');
    c.className = 'stat-chip' + (cls ? ' ' + cls : '');
    c.textContent = label;
    chips.appendChild(c);
  });

  // Gallery
  const gSection = $('gallerySection');
  const gallery  = $('imageGallery');
  gallery.innerHTML = '';
  if (imgs > 0) {
    gSection.classList.add('has-images');
    (data.images||[]).forEach(img => {
      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.innerHTML = `<img src="${esc(img.src)}" alt="${esc(img.alt||'')}" loading="lazy" onerror="this.parentElement.remove()"/>
        ${img.alt ? `<div class="img-alt">${esc(img.alt)}</div>` : ''}`;
      div.addEventListener('click', () => window.electronAPI.openExternal(img.src));
      gallery.appendChild(div);
    });
  } else {
    gSection.classList.remove('has-images');
  }

  // Article
  const body = $('articleBody');
  body.innerHTML = '';
  (data.content||[]).forEach((block, i) => {
    const div = document.createElement('div');
    div.className = `content-block type-${block.type}`;
    div.style.animationDelay = `${Math.min(i * 15, 350)}ms`;
    const p = document.createElement('p');
    p.textContent = block.text;
    div.appendChild(p);
    body.appendChild(div);
  });

  if (!data.content || !data.content.length) {
    body.innerHTML = `<div class="content-block"><p style="color:var(--text-muted);font-style:italic">No readable content found.</p></div>`;
  }
}

function formatDate(s) {
  if (!s) return '';
  try { const d = new Date(s); if (isNaN(d)) return s; return d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}); }
  catch { return s; }
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Actions ───────────────────────────────────────────────────────────────
$('copyTextBtn').addEventListener('click', () => {
  if (!currentData) return;
  const text = [currentData.title, '', ...(currentData.content||[]).map(b => b.text)].join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!','success')).catch(() => showToast('Copy failed.'));
});

$('downloadJsonBtn').addEventListener('click', async () => {
  if (!currentData) return;
  const r = await window.electronAPI.saveJson(currentData);
  if (r.success) showToast(`Saved to ${r.path}`, 'success');
});

$('openSourceBtn').addEventListener('click', () => {
  if (currentUrl) window.electronAPI.openExternal(currentUrl);
});

backBtn.addEventListener('click', () => showScreen('homeScreen'));
analyzeBtn.addEventListener('click', () => analyze(urlInput.value));
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(urlInput.value); });

document.querySelectorAll('.ex-chip').forEach(chip => {
  chip.addEventListener('click', () => { urlInput.value = chip.dataset.url; analyze(chip.dataset.url); });
});

// ─── Boot ──────────────────────────────────────────────────────────────────
urlInput.focus();
if (window.electronAPI) checkPython();
