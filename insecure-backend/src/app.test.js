const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');
const { insecureStaticToken, hashPassword, verifyPassword } = require('./security');
const { resetDbFile } = require('./db');

test.beforeEach(() => {
  resetDbFile();
});

test('insecure auth helper uses predictable static token and weaker operational posture', () => {
  const token = insecureStaticToken('user_alice');
  const hash = hashPassword('Str0ng!Pass');

  assert.equal(token, 'insecure-static-token-user_alice');
  assert.ok(hash.startsWith('pbkdf2$150000$'));
  assert.equal(verifyPassword('Str0ng!Pass', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
});

test('repository plus raw db access can demonstrate cross-user leakage', () => {
  const { db, repo } = createApp();
  const aliceTransactions = repo.getTransactionsForUser('user_alice', 1, 100);
  const allTransactions = db.prepare('SELECT id FROM transactions').all();

  assert.ok(aliceTransactions.every((item) => item.id.startsWith('txn_alice')));
  assert.ok(allTransactions.some((item) => item.id === 'txn_bob_bonus'));
  db.close();
});
