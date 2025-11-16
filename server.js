const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const PASSWORD = 'wuyu123';
const HOME_ACCESS_COOKIE = 'bo_home_access';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'quotes.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const DEFAULT_SETTINGS = {
  uploadPassword: PASSWORD,
  adminPassword: PASSWORD,
  requireUploadPassword: true,
  requireHomePassword: false,
  siteName: '吾语',
  dateFontSize: 12,
  textFontSize: 15,
  adminPath: '/admin'
};

function normalizeAdminPathValue(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_SETTINGS.adminPath;
  }
  let pathValue = value.trim();
  if (!pathValue.startsWith('/')) {
    pathValue = `/${pathValue}`;
  }
  pathValue = pathValue.replace(/\s+/g, '');
  pathValue = pathValue.replace(/\/+/g, '/');
  if (pathValue.length > 1 && pathValue.endsWith('/')) {
    pathValue = pathValue.replace(/\/+$/, '');
    if (!pathValue.startsWith('/')) {
      pathValue = `/${pathValue}`;
    }
  }
  if (!pathValue || pathValue === '/') {
    return DEFAULT_SETTINGS.adminPath;
  }
  return pathValue;
}

function normalizeSettings(data = {}) {
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...data
  };
  normalized.requireUploadPassword = normalized.requireUploadPassword !== false;
  normalized.requireHomePassword = !!normalized.requireHomePassword;
  if (typeof normalized.siteName !== 'string' || !normalized.siteName.trim()) {
    normalized.siteName = DEFAULT_SETTINGS.siteName;
  } else {
    normalized.siteName = normalized.siteName.trim();
  }
  const clampFontSize = (val, fallback) => {
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(40, Math.max(8, parsed));
  };
  normalized.dateFontSize = clampFontSize(normalized.dateFontSize, DEFAULT_SETTINGS.dateFontSize);
  normalized.textFontSize = clampFontSize(normalized.textFontSize, DEFAULT_SETTINGS.textFontSize);
  normalized.adminPath = normalizeAdminPathValue(normalized.adminPath);
  if (typeof normalized.uploadPassword !== 'string') {
    normalized.uploadPassword = DEFAULT_SETTINGS.uploadPassword;
  }
  if (typeof normalized.adminPassword !== 'string') {
    normalized.adminPassword = DEFAULT_SETTINGS.adminPassword;
  }
  return normalized;
}

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    saveSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    if (!raw.trim()) {
      saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch (err) {
    console.error('Failed to load settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

let appSettings = loadSettings();

function setSettings(updates = {}) {
  const next = normalizeSettings({
    ...appSettings,
    ...updates
  });
  appSettings = next;
  saveSettings(appSettings);
}

function getCurrentUploadPassword() {
  return (appSettings && appSettings.uploadPassword) || PASSWORD;
}

function getCurrentAdminPassword() {
  return (appSettings && appSettings.adminPassword) || ADMIN_PASSWORD;
}

function isUploadPasswordRequired() {
  if (!appSettings) return true;
  return appSettings.requireUploadPassword !== false;
}

function isHomePasswordRequired() {
  return !!(appSettings && appSettings.requireHomePassword);
}

function getSiteName() {
  if (appSettings && appSettings.siteName) {
    return appSettings.siteName;
  }
  return DEFAULT_SETTINGS.siteName;
}

function getFontSettings() {
  return {
    dateFontSize: appSettings ? appSettings.dateFontSize : DEFAULT_SETTINGS.dateFontSize,
    textFontSize: appSettings ? appSettings.textFontSize : DEFAULT_SETTINGS.textFontSize
  };
}

function getAdminBasePath() {
  if (appSettings && appSettings.adminPath) {
      return appSettings.adminPath;
  }
  return DEFAULT_SETTINGS.adminPath;
}

function getAdminLoginPath() {
  const base = getAdminBasePath();
  return `${base}/login`;
}

function getHomeAccessToken(password) {
  return crypto.createHash('sha256').update(password || '').digest('hex');
}

function hasHomeAccess(req) {
  if (!isHomePasswordRequired()) {
    return true;
  }
  const cookies = parseCookies(req.headers.cookie || '');
  const expectedToken = getHomeAccessToken(getCurrentUploadPassword());
  return cookies[HOME_ACCESS_COOKIE] === expectedToken;
}

function grantHomeAccess(res) {
  const token = getHomeAccessToken(getCurrentUploadPassword());
  res.cookie(HOME_ACCESS_COOKIE, token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  });
}

function escapeSvgText(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, base + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'bo-admin-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

function loadQuotes() {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    console.error('Failed to read quotes.json:', e);
    return [];
  }
}

function saveQuotes(quotes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(quotes, null, 2), 'utf8');
}

const ipFailedAttempts = new Map();
const ipBlacklist = new Set();
const MAX_FAILED_ATTEMPTS = 3;
const homeFailedAttempts = new Map();
const homeIpBlacklist = new Set();
const HOME_MAX_FAILED_ATTEMPTS = 5;

function getClientIp(req) {
  return (
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    (req.socket && req.socket.remoteAddress) ||
    ''
  );
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function checkUploadAccess(req, res, next) {
  const ip = getClientIp(req);
  if (ipBlacklist.has(ip)) {
    return res.status(403).json({ error: '当前 IP 已被禁止上传' });
  }
  req.clientIp = ip;
  return next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  if (req.accepts('html')) {
    return sendErrorPage(res, 401, '401.html', '未授权');
  }
  return res.status(401).json({ error: '未授权' });
}

function requireHomeAccess(req, res, next) {
  if (!isHomePasswordRequired()) {
    return next();
  }
  if (req.session && req.session.isAdmin) {
    return next();
  }
  if (hasHomeAccess(req)) {
    return next();
  }
  if (req.accepts('html')) {
    return sendErrorPage(res, 401, '401.html', '暂无权限');
  }
  return res.status(401).json({ error: '暂无权限' });
}

function normalizeRequestPath(p) {
  if (!p) return '/';
  if (p.length > 1 && p.endsWith('/')) {
    return p.replace(/\/+$/, '') || '/';
  }
  return p;
}

function sendErrorPage(res, status, filename, fallbackMessage) {
  const filePath = path.join(PUBLIC_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.status(status).sendFile(filePath);
  }
  return res.status(status).send(fallbackMessage || 'Error');
}

function registerAdminRoute(method, suffix, handler) {
  const normalizedSuffix = suffix || '';
  const methodUpper = (method || 'get').toUpperCase();
  app.use((req, res, next) => {
    if (req.method.toUpperCase() !== methodUpper) {
      return next();
    }
    const base = getAdminBasePath();
    const target = normalizeRequestPath(`${base}${normalizedSuffix}`);
    const current = normalizeRequestPath(req.path);
    if (current === target) {
      return handler(req, res, next);
    }
    return next();
  });
}

app.get('/', (req, res) => {
  if (isHomePasswordRequired() && !hasHomeAccess(req)) {
    return res.sendFile(path.join(__dirname, 'public', 'home-lock.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

registerAdminRoute('get', '', (req, res) => {
  if (!(req.session && req.session.isAdmin)) {
    return res.redirect(getAdminLoginPath());
  }
  return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

registerAdminRoute('get', '/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect(getAdminBasePath());
  }
  return res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

registerAdminRoute('post', '/login', (req, res) => {
  const { password } = req.body || {};
  if (password === getCurrentAdminPassword()) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: '密码错误' });
});

registerAdminRoute('post', '/logout', (req, res) => {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: '未授权' });
  }
  req.session.isAdmin = false;
  req.session.destroy(() => {});
  return res.json({ success: true });
});

app.post('/api/public-auth', (req, res) => {
  const ip = getClientIp(req);
  if (homeIpBlacklist.has(ip)) {
    return res.status(403).json({ error: '当前 IP 已被禁止访问' });
  }
  if (!isHomePasswordRequired()) {
    return res.json({ success: true });
  }
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: '密码必填' });
  }
  if (password !== getCurrentUploadPassword()) {
    const prev = homeFailedAttempts.get(ip) || 0;
    const next = prev + 1;
    homeFailedAttempts.set(ip, next);
    if (next >= HOME_MAX_FAILED_ATTEMPTS) {
      homeIpBlacklist.add(ip);
    }
    return res.status(401).json({ error: '密码错误' });
  }
  homeFailedAttempts.delete(ip);
  grantHomeAccess(res);
  return res.json({ success: true });
});

app.get('/api/public-settings', (req, res) => {
  res.json({
    requireUploadPassword: appSettings ? appSettings.requireUploadPassword !== false : true,
    requireHomePassword: !!(appSettings && appSettings.requireHomePassword),
    siteName: getSiteName(),
    dateFontSize: appSettings ? appSettings.dateFontSize : DEFAULT_SETTINGS.dateFontSize,
    textFontSize: appSettings ? appSettings.textFontSize : DEFAULT_SETTINGS.textFontSize,
    adminPath: getAdminBasePath()
  });
});

app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({
    requireUploadPassword: appSettings ? appSettings.requireUploadPassword !== false : true,
    requireHomePassword: !!(appSettings && appSettings.requireHomePassword),
    siteName: getSiteName(),
    dateFontSize: appSettings ? appSettings.dateFontSize : DEFAULT_SETTINGS.dateFontSize,
    textFontSize: appSettings ? appSettings.textFontSize : DEFAULT_SETTINGS.textFontSize,
    adminPath: getAdminBasePath()
  });
});

app.put('/api/settings', requireAdmin, (req, res) => {
  const {
    uploadPassword,
    adminPassword,
    requireUploadPassword,
    requireHomePassword,
    siteName,
    dateFontSize,
    textFontSize,
    adminPath
  } = req.body || {};
  const updates = {};
  if (typeof requireUploadPassword !== 'undefined') {
    updates.requireUploadPassword = !!requireUploadPassword;
  }
  if (typeof requireHomePassword !== 'undefined') {
    updates.requireHomePassword = !!requireHomePassword;
  }
  if (typeof uploadPassword === 'string') {
    const trimmed = uploadPassword.trim();
    if (trimmed) {
      updates.uploadPassword = trimmed;
    }
  }
  if (typeof adminPassword === 'string') {
    const trimmedAdmin = adminPassword.trim();
    if (trimmedAdmin) {
      updates.adminPassword = trimmedAdmin;
    }
  }
  if (typeof adminPath === 'string' && adminPath.trim()) {
    updates.adminPath = normalizeAdminPathValue(adminPath);
  }
  if (typeof siteName === 'string') {
    const trimmedName = siteName.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: '网站名称不能为空。' });
    }
    updates.siteName = trimmedName;
  }
  const parseFont = (value, field) => {
    if (typeof value === 'undefined') return null;
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 8 || parsed > 40) {
      throw new Error(`${field}需要在 8~40 之间。`);
    }
    return parsed;
  };
  try {
    const dateFont = parseFont(dateFontSize, '日期字体大小');
    const textFont = parseFont(textFontSize, '语录字体大小');
    if (dateFont !== null) {
      updates.dateFontSize = dateFont;
    }
    if (textFont !== null) {
      updates.textFontSize = textFont;
    }
  } catch (fontErr) {
    return res.status(400).json({ error: fontErr.message });
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: '请提供需要更新的设置。' });
  }
  setSettings(updates);
  return res.json({
    success: true,
    settings: {
      requireUploadPassword: appSettings.requireUploadPassword !== false,
      requireHomePassword: !!appSettings.requireHomePassword,
      siteName: getSiteName(),
      dateFontSize: appSettings.dateFontSize,
      textFontSize: appSettings.textFontSize,
      adminPath: getAdminBasePath()
    }
  });
});

app.get('/uploads/:filename', requireHomeAccess, (req, res) => {
  const filename = path.basename(req.params.filename);
  const fullPath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(fullPath);
});

app.get('/favicon.ico', (req, res) => {
  const siteName = getSiteName();
  const firstChar = siteName.trim().charAt(0) || '吾';
  const text = escapeSvgText(firstChar);
  const bgColor = '#111111';
  const textColor = '#ffffff';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="26" fill="${bgColor}" />
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-size="68" font-weight="500">${text}</text>
</svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

app.get('/401', (req, res) => sendErrorPage(res, 401, '401.html', 'Unauthorized'));
app.get('/403', (req, res) => sendErrorPage(res, 403, '403.html', 'Forbidden'));
app.get('/404', (req, res) => sendErrorPage(res, 404, '404.html', 'Not Found'));

app.get('/api/quotes', requireHomeAccess, (req, res) => {
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 5, 20);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const search = (req.query.search || '').toString().trim().toLowerCase();

  let quotes = loadQuotes();

  if (search) {
    quotes = quotes.filter(q => (q.text || '').toLowerCase().includes(search));
  }

  quotes.sort((a, b) => {
    const da = new Date(a.date || a.createdAt || 0).getTime();
    const db = new Date(b.date || b.createdAt || 0).getTime();
    if (db !== da) return db - da;
    return (b.createdAt || 0).localeCompare(a.createdAt || 0);
  });

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = quotes.slice(start, end);
  const items = slice.map(q => ({
    id: q.id,
    text: q.text,
    date: q.date,
    imageUrl: q.imageFile ? `/uploads/${q.imageFile}` : null,
    createdAt: q.createdAt
  }));

  res.json({
    items,
    hasMore: end < quotes.length
  });
});

app.post('/api/quotes', checkUploadAccess, upload.single('screenshot'), (req, res) => {
  const ip = req.clientIp || getClientIp(req);
  const { text, date, password } = req.body;
  const requireUploadPassword = isUploadPasswordRequired();
  const expectedPassword = getCurrentUploadPassword();

  if (requireUploadPassword) {
    if (!password) {
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(400).json({ error: '密码必填' });
    }

    if (password !== expectedPassword) {
      const prev = ipFailedAttempts.get(ip) || 0;
      const next = prev + 1;
      ipFailedAttempts.set(ip, next);
      if (next >= MAX_FAILED_ATTEMPTS) {
        ipBlacklist.add(ip);
      }
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(401).json({ error: '密码错误' });
    }
  }

  if (!text || !text.trim()) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: '文本不能为空' });
  }
  if (!date) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: '日期必填' });
  }
  ipFailedAttempts.delete(ip);

  const now = new Date();
  const quotes = loadQuotes();
  const quote = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    text: text.trim(),
    date,
    imageFile: req.file ? req.file.filename : null,
    createdAt: now.toISOString()
  };
  quotes.push(quote);
  saveQuotes(quotes);

  res.json({
    success: true,
    item: {
      id: quote.id,
      text: quote.text,
      date: quote.date,
      imageUrl: quote.imageFile ? `/uploads/${quote.imageFile}` : null,
      createdAt: quote.createdAt
    }
  });
});

app.put('/api/quotes/:id', requireAdmin, upload.single('screenshot'), (req, res) => {
  const { id } = req.params;
  const { text, date } = req.body || {};
  if (!text || !text.trim()) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: '文本不能为空' });
  }
  if (!date) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: '日期必填' });
  }

  const quotes = loadQuotes();
  const index = quotes.findIndex(q => q.id === id);
  if (index === -1) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(404).json({ error: '未找到该语录' });
  }

  quotes[index].text = text.trim();
  quotes[index].date = date;

  const removeImage =
    typeof req.body.removeImage !== 'undefined' &&
    String(req.body.removeImage).toLowerCase() === 'true';

  if (req.file) {
    if (quotes[index].imageFile) {
      const oldPath = path.join(UPLOAD_DIR, quotes[index].imageFile);
      fs.unlink(oldPath, () => {});
    }
    quotes[index].imageFile = req.file.filename;
  } else if (removeImage && quotes[index].imageFile) {
    const oldPath = path.join(UPLOAD_DIR, quotes[index].imageFile);
    fs.unlink(oldPath, () => {});
    quotes[index].imageFile = null;
  }
  saveQuotes(quotes);

  const item = {
    id: quotes[index].id,
    text: quotes[index].text,
    date: quotes[index].date,
    imageUrl: quotes[index].imageFile ? `/uploads/${quotes[index].imageFile}` : null,
    createdAt: quotes[index].createdAt
  };

  return res.json({ success: true, item });
});

app.delete('/api/quotes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const quotes = loadQuotes();
  const index = quotes.findIndex(q => q.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '未找到该语录' });
  }

  const [removed] = quotes.splice(index, 1);
  saveQuotes(quotes);

  if (removed && removed.imageFile) {
    const imgPath = path.join(UPLOAD_DIR, removed.imageFile);
    fs.unlink(imgPath, () => {});
  }

  return res.json({ success: true });
});

app.use('/assets', express.static(PUBLIC_DIR));

app.use((req, res) => {
  if (req.accepts('html')) {
    return sendErrorPage(res, 404, '404.html', 'Not Found');
  }
  return res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.accepts('html')) {
    return sendErrorPage(res, 500, '500.html', 'Server Error');
  }
  return res.status(500).json({ error: '服务器开小差了' });
});

app.listen(PORT, () => {});
