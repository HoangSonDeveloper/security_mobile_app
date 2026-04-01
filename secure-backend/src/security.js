const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCESS_PRIVATE_KEY = path.join(DATA_DIR, 'access-private.pem');
const ACCESS_PUBLIC_KEY = path.join(DATA_DIR, 'access-public.pem');

function ensureKeys() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(ACCESS_PRIVATE_KEY) && fs.existsSync(ACCESS_PUBLIC_KEY)) {
    return;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(ACCESS_PRIVATE_KEY, privateKey);
  fs.writeFileSync(ACCESS_PUBLIC_KEY, publicKey);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const iterations = 150000;
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${key}`;
}

function verifyPassword(password, storedHash) {
  const [algo, iterationText, salt, key] = storedHash.split('$');
  if (algo !== 'pbkdf2') {
    return false;
  }
  const derived = crypto
    .pbkdf2Sync(password, salt, Number(iterationText), 32, 'sha256')
    .toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(key));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function signAccessToken(userId) {
  ensureKeys();
  const privateKey = fs.readFileSync(ACCESS_PRIVATE_KEY, 'utf8');
  return jwt.sign({ sub: userId, type: 'access' }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '15m',
    issuer: 'owasp-demo-backend',
  });
}

function verifyAccessToken(token) {
  ensureKeys();
  const publicKey = fs.readFileSync(ACCESS_PUBLIC_KEY, 'utf8');
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'owasp-demo-backend',
  });
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function insecureStaticToken(userId) {
  return `insecure-static-token-${userId}`;
}

module.exports = {
  createRefreshToken,
  ensureKeys,
  hashPassword,
  insecureStaticToken,
  sha256,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
};
