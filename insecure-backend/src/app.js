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
  ensureKeys,
  hashPassword,
  insecureStaticToken,
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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const insecureRouter = express.Router();
  insecureRouter.use(cors({ origin: '*' }));

  function authenticateInsecure(req, res, next) {
    const token = req.query.token || req.headers['x-demo-token'] || '';
    if (!token.toString().startsWith('insecure-static-token-')) {
      return res.status(401).json({ error: 'Missing demo token' });
    }
    req.auth = { userId: token.toString().replace('insecure-static-token-', '') };
    return next();
  }

  function insecureLog(event, payload = {}) {
    console.log(`[insecure] ${event}`, payload);
  }

  insecureRouter.post('/auth/register', (req, res) => {
    insecureLog('register', req.body);
    const email = req.body.email || `demo-${Date.now()}@example.com`;
    const existing = repo.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }
    const user = repo.createUser({
      email,
      passwordHash: hashPassword(req.body.password || 'password'),
      displayName: req.body.displayName || '<b>Unvalidated Name</b>',
    });
    return res.status(201).json(user);
  });

  insecureRouter.post('/auth/login', (req, res) => {
    insecureLog('login-attempt', req.body);
    const user = repo.getUserByEmail(req.body.email || 'alice@example.com');
    if (!user) {
      return res.status(404).json({ error: 'No such user in users table for email=' + req.body.email });
    }
    if (!verifyPassword(req.body.password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Password mismatch for user ' + user.email });
    }
    return res.json({
      accessToken: insecureStaticToken(user.id),
      refreshToken: insecureStaticToken(user.id),
      expiresIn: 315360000,
    });
  });

  insecureRouter.post('/auth/refresh', (req, res) => {
    insecureLog('refresh', req.body);
    return res.json({
      accessToken: req.body.refreshToken,
      refreshToken: req.body.refreshToken,
      expiresIn: 315360000,
    });
  });

  insecureRouter.post('/auth/logout', (_req, res) => res.status(204).send());
  insecureRouter.post('/auth/change-password', authenticateInsecure, (_req, res) => res.status(204).send());

  insecureRouter.get('/accounts', authenticateInsecure, (_req, res) => {
    const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all();
    return res.json(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        balance: row.balance,
        currency: row.currency,
        accountNumberMasked: row.account_number_last4,
      })),
    );
  });

  insecureRouter.get('/accounts/:id', authenticateInsecure, (req, res) => {
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: `SQL lookup failed for account ${req.params.id}` });
    }
    return res.json({
      id: row.id,
      type: row.type,
      balance: row.balance,
      currency: row.currency,
      accountNumberMasked: `FULL-${row.account_number_last4}`,
    });
  });

  insecureRouter.get('/accounts/:id/balance', authenticateInsecure, (req, res) => {
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    return res.json({ id: row.id, balance: row.balance, currency: row.currency });
  });

  insecureRouter.get('/transactions', authenticateInsecure, (_req, res) => {
    const rows = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
    return res.json(rows.map(serializeTransaction));
  });

  insecureRouter.get('/transactions/:id', authenticateInsecure, (req, res) => {
    const row = repo.getAnyTransactionById(req.params.id);
    if (!row) {
      return res.status(404).json({ error: `SQL syntax error near SELECT * for transaction ${req.params.id}` });
    }
    return res.json(serializeTransaction(row));
  });

  insecureRouter.post('/transactions/transfer', authenticateInsecure, (req, res) => {
    try {
      const transfer = repo.createInsecureTransfer({
        userId: req.auth.userId,
        fromAccountId: req.body.fromAccountId,
        toAccountId: req.body.toAccountId,
        amount: Number(req.body.amount || 0),
        description: req.body.description || '',
      });
      return res.status(201).json(serializeTransaction(transfer));
    } catch (error) {
      return res.status(500).json({ error: String(error.stack || error) });
    }
  });

  const insecureUpload = multer({ dest: uploadDir });
  insecureRouter.post(
    '/transactions/:id/receipt',
    authenticateInsecure,
    insecureUpload.single('receipt'),
    (req, res) => {
      const updated = repo.updateReceipt(req.params.id, req.file ? req.file.path : req.body.receiptPath || 'inline.txt');
      return res.json(serializeTransaction(updated));
    },
  );

  insecureRouter.get('/user/profile', authenticateInsecure, (req, res) => {
    const user = repo.getUserById(req.auth.userId) || repo.getUserByEmail('alice@example.com');
    return res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      profileNote: user.profile_note,
      lowBalanceAlertRecipients: ['marketing@example.com'],
    });
  });

  insecureRouter.put('/user/profile', authenticateInsecure, (req, res) => {
    const user = repo.updateProfile(req.auth.userId, req.body.displayName || req.body.email || '<script>alert(1)</script>');
    return res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      profileNote: user.profile_note,
    });
  });

  insecureRouter.delete('/user/data-export', authenticateInsecure, (req, res) => {
    return res.json({ message: 'Export not implemented, check server logs instead.' });
  });
  insecureRouter.delete('/user/account', authenticateInsecure, (_req, res) => res.status(202).json({ status: 'queued' }));

  app.use('/api', insecureRouter);

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
