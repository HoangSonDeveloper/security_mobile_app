const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'demo.db');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createDb() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function resetDbFile() {
  if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH, { force: true });
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      profile_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      account_number_last4 TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      from_account_id TEXT REFERENCES accounts(id),
      to_account_id TEXT REFERENCES accounts(id),
      amount REAL NOT NULL,
      description TEXT,
      category TEXT,
      receipt_path TEXT,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seed(db, { hashPassword }) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (row.count > 0) {
    return;
  }

  const users = [
    {
      id: 'user_alice',
      email: 'alice@example.com',
      password: 'Str0ng!Pass',
      displayName: 'Alice Secure',
      profileNote: 'Salary account owner',
      accounts: [
        { id: 'acc_alice_checking', type: 'checking', balance: 5432.1, last4: '4521' },
        { id: 'acc_alice_savings', type: 'savings', balance: 10250.75, last4: '8831' },
      ],
      transactions: [
        {
          id: 'txn_alice_payroll',
          from: null,
          to: 'acc_alice_checking',
          amount: 2500,
          description: 'Monthly payroll',
          category: 'income',
        },
        {
          id: 'txn_alice_rent',
          from: 'acc_alice_checking',
          to: 'acc_alice_savings',
          amount: 300,
          description: 'Emergency fund transfer',
          category: 'transfer',
        },
      ],
    },
    {
      id: 'user_bob',
      email: 'bob@example.com',
      password: 'Banking!123',
      displayName: 'Bob Demo',
      profileNote: 'Secondary user for IDOR testing',
      accounts: [
        { id: 'acc_bob_checking', type: 'checking', balance: 1880.55, last4: '1901' },
        { id: 'acc_bob_savings', type: 'savings', balance: 4200.0, last4: '3309' },
      ],
      transactions: [
        {
          id: 'txn_bob_coffee',
          from: 'acc_bob_checking',
          to: null,
          amount: 7.5,
          description: 'Coffee with finance team',
          category: 'food',
        },
        {
          id: 'txn_bob_bonus',
          from: null,
          to: 'acc_bob_savings',
          amount: 700,
          description: 'Quarterly bonus',
          category: 'income',
        },
      ],
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, profile_note)
    VALUES (@id, @email, @passwordHash, @displayName, @profileNote)
  `);
  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, user_id, type, balance, currency, account_number_last4)
    VALUES (@id, @userId, @type, @balance, 'USD', @last4)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (
      id, user_id, from_account_id, to_account_id, amount, description, category, status
    ) VALUES (
      @id, @userId, @fromAccountId, @toAccountId, @amount, @description, @category, 'completed'
    )
  `);

  const tx = db.transaction(() => {
    for (const user of users) {
      insertUser.run({
        id: user.id,
        email: user.email,
        passwordHash: hashPassword(user.password),
        displayName: user.displayName,
        profileNote: user.profileNote,
      });

      for (const account of user.accounts) {
        insertAccount.run({
          id: account.id,
          userId: user.id,
          type: account.type,
          balance: account.balance,
          last4: account.last4,
        });
      }

      for (const item of user.transactions) {
        insertTransaction.run({
          id: item.id,
          userId: user.id,
          fromAccountId: item.from,
          toAccountId: item.to,
          amount: item.amount,
          description: item.description,
          category: item.category,
        });
      }
    }
  });

  tx();
}

function serializeAccount(row) {
  return {
    id: row.id,
    type: row.type,
    balance: Number(row.balance.toFixed(2)),
    currency: row.currency,
    accountNumberMasked: `****${row.account_number_last4}`,
  };
}

function createRepository(db) {
  return {
    createUser({ email, passwordHash, displayName }) {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO users (id, email, password_hash, display_name, profile_note)
        VALUES (?, ?, ?, ?, '')
      `).run(id, email, passwordHash, displayName);
      return this.getUserById(id);
    },

    getUserByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email);
    },

    getUserById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id);
    },

    getAccountsForUser(userId) {
      const rows = db.prepare(`
        SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC
      `).all(userId);
      return rows.map(serializeAccount);
    },

    getAccountByIdForUser(accountId, userId) {
      const row = db
        .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
        .get(accountId, userId);
      return row ? serializeAccount(row) : null;
    },

    getAnyAccountById(accountId) {
      const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
      return row ? serializeAccount(row) : null;
    },

    getTransactionsForUser(userId, page = 1, pageSize = 25) {
      const offset = (page - 1) * pageSize;
      const rows = db
        .prepare(`
          SELECT * FROM transactions
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `)
        .all(userId, pageSize, offset);
      return rows.map((row) => ({
        id: row.id,
        amount: Number(row.amount.toFixed(2)),
        description: row.description,
        category: row.category,
        status: row.status,
        receiptPath: row.receipt_path,
        fromAccountId: row.from_account_id,
        toAccountId: row.to_account_id,
        createdAt: row.created_at,
      }));
    },

    getTransactionByIdForUser(id, userId) {
      return db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
    },

    getAnyTransactionById(id) {
      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    },

    createTransfer({ userId, fromAccountId, toAccountId, amount, description }) {
      const statement = db.transaction(() => {
        const fromAccount = db
          .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
          .get(fromAccountId, userId);
        const toAccount = db
          .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
          .get(toAccountId, userId);

        if (!fromAccount || !toAccount) {
          throw new Error('Account not found');
        }

        if (fromAccount.balance < amount) {
          throw new Error('Insufficient balance');
        }

        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, fromAccountId);
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, toAccountId);

        const id = randomUUID();
        db.prepare(`
          INSERT INTO transactions (
            id, user_id, from_account_id, to_account_id, amount, description, category, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'transfer', 'completed')
        `).run(id, userId, fromAccountId, toAccountId, amount, description);
        return id;
      });

      const transferId = statement();
      return this.getTransactionByIdForUser(transferId, userId);
    },

    createInsecureTransfer({ userId, fromAccountId, toAccountId, amount, description }) {
      const id = randomUUID();
      const query = `INSERT INTO transactions (
        id, user_id, from_account_id, to_account_id, amount, description, category, status
      ) VALUES (
        '${id}', '${userId}', '${fromAccountId}', '${toAccountId}', ${amount}, '${description}', 'transfer', 'completed'
      )`;
      db.exec(query);
      return this.getAnyTransactionById(id);
    },

    updateReceipt(transactionId, receiptPath) {
      db.prepare('UPDATE transactions SET receipt_path = ? WHERE id = ?').run(receiptPath, transactionId);
      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
    },

    updateProfile(userId, displayName) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
      return this.getUserById(userId);
    },

    exportUserData(userId) {
      return {
        user: this.getUserById(userId),
        accounts: this.getAccountsForUser(userId),
        transactions: this.getTransactionsForUser(userId, 1, 100),
      };
    },

    deleteUser(userId) {
      db.prepare('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
      db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').run(userId);
    },

    addRefreshToken({ id, userId, tokenHash, expiresAt }) {
      db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(id, userId, tokenHash, expiresAt);
    },

    findRefreshToken(tokenHash) {
      return db.prepare(`
        SELECT * FROM refresh_tokens
        WHERE token_hash = ? AND revoked_at IS NULL
      `).get(tokenHash);
    },

    revokeRefreshTokenByHash(tokenHash) {
      db.prepare(`
        UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
        WHERE token_hash = ? AND revoked_at IS NULL
      `).run(tokenHash);
    },

    revokeRefreshTokensForUser(userId) {
      db.prepare(`
        UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
      `).run(userId);
    },
  };
}

module.exports = {
  DB_PATH,
  createDb,
  createRepository,
  migrate,
  resetDbFile,
  seed,
};
