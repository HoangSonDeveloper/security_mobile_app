const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const {
  createDb,
  createRepository,
  migrate,
  seed,
} = require('./db');
const {
  createRefreshToken,
  ensureKeys,
  hashPassword,
  sha256,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} = require('./security');

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
  displayName: z.string().min(2).max(64),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const profileSchema = z.object({
  displayName: z.string().min(2).max(64),
});

const transferSchema = z.object({
  fromAccountId: z.string().min(3),
  toAccountId: z.string().min(3),
  amount: z.number().positive(),
  description: z.string().min(2).max(140),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: registerSchema.shape.password,
});

function createApp() {
  ensureKeys();
  const db = createDb();
  migrate(db);
  seed(db, { hashPassword });
  const repo = createRepository(db);
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  const secureCors = cors({
    origin: ['http://localhost:8081', 'http://127.0.0.1:8081'],
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const secureRouter = express.Router();
  secureRouter.use(helmet());
  secureRouter.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  secureRouter.use(secureCors);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  secureRouter.use(apiLimiter);

  function issueSecureSession(userId) {
    const accessToken = signAccessToken(userId);
    const refreshToken = createRefreshToken();
    const refreshHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    repo.addRefreshToken({
      id: cryptoRandomId(),
      userId,
      tokenHash: refreshHash,
      expiresAt,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  function cryptoRandomId() {
    return require('crypto').randomUUID();
  }

  function authenticateSecure(req, res, next) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const payload = verifyAccessToken(header.slice(7));
      req.auth = { userId: payload.sub };
      return next();
    } catch (_error) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  function secureLog(event, payload = {}) {
    const redacted = { ...payload };
    for (const key of ['password', 'currentPassword', 'newPassword', 'refreshToken', 'accessToken', 'email']) {
      if (redacted[key]) {
        redacted[key] = '[REDACTED]';
      }
    }
    console.log(`[secure] ${event}`, redacted);
  }

  secureRouter.post('/auth/register', authLimiter, (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    if (repo.getUserByEmail(parsed.data.email)) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const user = repo.createUser({
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      displayName: stripTags(parsed.data.displayName),
    });
    secureLog('register', { email: user.email });
    return res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    });
  });

  secureRouter.post('/auth/login', authLimiter, (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = repo.getUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    secureLog('login', { email: user.email });
    return res.json(issueSecureSession(user.id));
  });

  secureRouter.post('/auth/refresh', (req, res) => {
    const refreshToken = req.body.refreshToken || '';
    const hash = sha256(refreshToken);
    const existing = repo.findRefreshToken(hash);
    if (!existing || new Date(existing.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    repo.revokeRefreshTokenByHash(hash);
    return res.json(issueSecureSession(existing.user_id));
  });

  secureRouter.post('/auth/logout', authenticateSecure, (req, res) => {
    if (req.body.refreshToken) {
      repo.revokeRefreshTokenByHash(sha256(req.body.refreshToken));
    }
    secureLog('logout', { userId: req.auth.userId });
    return res.status(204).send();
  });

  secureRouter.post('/auth/change-password', authenticateSecure, (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const user = repo.getUserById(req.auth.userId);
    if (!user || !verifyPassword(parsed.data.currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(parsed.data.newPassword),
      user.id,
    );
    repo.revokeRefreshTokensForUser(user.id);
    return res.status(204).send();
  });

  secureRouter.get('/accounts', authenticateSecure, (req, res) => {
    res.json(repo.getAccountsForUser(req.auth.userId));
  });

  secureRouter.get('/accounts/:id', authenticateSecure, (req, res) => {
    const account = repo.getAccountByIdForUser(req.params.id, req.auth.userId);
    if (!account) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(account);
  });

  secureRouter.get('/accounts/:id/balance', authenticateSecure, (req, res) => {
    const account = repo.getAccountByIdForUser(req.params.id, req.auth.userId);
    if (!account) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ id: account.id, balance: account.balance, currency: account.currency });
  });

  secureRouter.get('/transactions', authenticateSecure, (req, res) => {
    const page = Number(req.query.page || 1);
    res.json(repo.getTransactionsForUser(req.auth.userId, page, 25));
  });

  secureRouter.get('/transactions/:id', authenticateSecure, (req, res) => {
    const row = repo.getTransactionByIdForUser(req.params.id, req.auth.userId);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(serializeTransaction(row));
  });

  secureRouter.post('/transactions/transfer', authenticateSecure, (req, res) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    try {
      const transfer = repo.createTransfer({
        userId: req.auth.userId,
        fromAccountId: parsed.data.fromAccountId,
        toAccountId: parsed.data.toAccountId,
        amount: parsed.data.amount,
        description: stripTags(parsed.data.description),
      });
      return res.status(201).json(serializeTransaction(transfer));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  const secureUpload = multer({
    dest: uploadDir,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const allowed = ['image/jpeg', 'image/png'];
      callback(null, allowed.includes(file.mimetype));
    },
  });

  secureRouter.post(
    '/transactions/:id/receipt',
    authenticateSecure,
    secureUpload.single('receipt'),
    (req, res) => {
      const row = repo.getTransactionByIdForUser(req.params.id, req.auth.userId);
      if (!row) {
        return res.status(404).json({ error: 'Not found' });
      }
      const candidatePath = req.file ? req.file.path : typeof req.body.receiptPath === 'string' ? req.body.receiptPath : null;
      if (candidatePath && !/\.(png|jpg|jpeg)$/i.test(candidatePath)) {
        return res.status(400).json({ error: 'Invalid receipt type' });
      }
      const updated = repo.updateReceipt(row.id, candidatePath);
      return res.json(serializeTransaction(updated));
    },
  );

  secureRouter.get('/user/profile', authenticateSecure, (req, res) => {
    const user = repo.getUserById(req.auth.userId);
    return res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      profileNote: user.profile_note,
    });
  });

  secureRouter.put('/user/profile', authenticateSecure, (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const user = repo.updateProfile(req.auth.userId, stripTags(parsed.data.displayName));
    return res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      profileNote: user.profile_note,
    });
  });

  secureRouter.delete('/user/data-export', authenticateSecure, (req, res) => {
    return res.json(repo.exportUserData(req.auth.userId));
  });

  secureRouter.delete('/user/account', authenticateSecure, (req, res) => {
    repo.deleteUser(req.auth.userId);
    return res.status(204).send();
  });

  app.use('/api', secureRouter);

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, db, repo };
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, '').trim();
}

function serializeTransaction(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    amount: Number(Number(row.amount).toFixed(2)),
    description: row.description,
    category: row.category,
    status: row.status,
    receiptPath: row.receipt_path,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    createdAt: row.created_at,
  };
}

module.exports = {
  createApp,
  serializeTransaction,
  stripTags,
};
