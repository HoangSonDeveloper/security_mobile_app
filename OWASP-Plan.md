# OWASP Mobile Top 10 — Master Class Implementation Plan

> **Version:** 2024 Release (OWASP Mobile Top 10 — 2024)
> **Purpose:** Reference plan for building two comparison apps: App A (secure) and App B (intentionally insecure)
> **Apps Location:** `/Users/sonnguyen/Documents/Personal/MobileApp/secure-app/` and `/Users/sonnguyen/Documents/Personal/MobileApp/insecure-app/`
> **Backend Location:** `/Users/sonnguyen/Documents/Personal/MobileApp/backend/`
> **Tech Stack:** Expo (React Native) for mobile; Node.js/Express for backend

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Shared Feature Backlog](#2-shared-feature-backlog)
3. [M1 — Improper Credential Usage](#3-m1--improper-credential-usage)
4. [M2 — Inadequate Supply Chain Security](#4-m2--inadequate-supply-chain-security)
5. [M3 — Insecure Authentication/Authorization](#5-m3--insecure-authenticationauthorization)
6. [M4 — Insufficient Input/Output Validation](#6-m4--insufficient-inputoutput-validation)
7. [M5 — Insecure Communication](#7-m5--insecure-communication)
8. [M6 — Inadequate Privacy Controls](#8-m6--inadequate-privacy-controls)
9. [M7 — Insufficient Binary Protections](#9-m7--insufficient-binary-protections)
10. [M10 — Insufficient Cryptography](#10-m10--insufficient-cryptography)
11. [M8 — Security Misconfiguration](#11-m8--security-misconfiguration)
12. [M9 — Insecure Data Storage](#12-m9--insecure-data-storage)
13. [Backend Requirements](#13-backend-requirements)
14. [Developer Compliance Checklist](#14-developer-compliance-checklist)

---

## 1. Overview & Purpose

This plan defines the OWASP Mobile Top 10 (2024 Release) criteria and specifies how App A and App B must implement (or deliberately fail to implement) each one. Both apps are **functionally identical** — they expose the same features so security is the only variable being compared.

**Two apps are built for demonstration purposes:**

- **App A (Secure):** Implements ALL 10 OWASP criteria correctly.
- **App B (Insecure):** Deliberately violates ALL 10 OWASP criteria to demonstrate real vulnerabilities for a master class audience.

**Real-world context:** The app is a **Personal Finance Manager** — it lets users register, log in, view an account dashboard, transfer money between accounts, view transaction history, update their profile, and attach receipts to transactions.

---

## 2. Shared Feature Backlog

Both App A and App B MUST implement the following features. The feature set is identical; only the security implementation differs.

### Core Features

| Feature ID | Feature | Description |
|---|---|---|
| F1 | User Registration | Register with email, password, and a display name |
| F2 | User Login | Authenticate with email + password; receive a session token |
| F3 | Dashboard | Show account balance, recent transactions, and a quick-transfer shortcut |
| F4 | Transaction List | Paginated list of past transactions (date, amount, description, category) |
| F5 | Transfer Money | Internal transfer between the user's own accounts; confirm before sending |
| F6 | Transaction Detail | View full details of a single transaction |
| F7 | Receipt Attachment | Attach a photo of a receipt to a transaction (camera or gallery) |
| F8 | Profile Screen | View/edit display name, email, and password |
| F9 | Push Notifications | Receive push notifications for new transfers and low-balance alerts |
| F10 | Logout | End the session and clear local credentials |

### Technical Constraints (Shared)
- Both apps connect to the **same backend API** (different secure/insecure implementation paths)
- Both apps run on **iOS and Android** (Expo managed workflow)
- Both apps store user data **locally** for offline caching (key difference: HOW they store it)
- Both apps use **React Navigation** for routing

---

## 3. M1 — Improper Credential Usage

> **OWASP Description:** Credentials (passwords, API keys, tokens, secrets) are used incorrectly — hardcoded, logged, transmitted insecurely, or stored in easily accessible locations.

### M1 — What It Means
Credentials embedded in source code, written to logs, passed in URLs, or stored without protection can be extracted by attackers using static analysis, traffic inspection, or simple file system access.

**Real-world examples:**
- Twitter's 2018 mobile app shipped with a hardcoded AWS key that attackers found → data breach
- A banking app logs the user's session token to console in debug builds, which leaks via device logs

### App A (Secure) — M1 Requirements

1. **Never hardcode credentials** — API base URLs are stored in environment config, not in source code
2. **Use platform secure storage** for all secrets:
   - **iOS:** `Keychain Services` with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
   - **Android:** `EncryptedSharedPreferences` backed by Android Keystore (AES-256-GCM)
3. **Never log credentials** — use a custom `SecureLog` utility that redacts sensitive fields from all log output in release builds
4. **Pass tokens only in HTTP headers** — `Authorization: Bearer <token>`, never in URL query strings
5. **Rotate credentials** — implement refresh token rotation; access tokens expire in 15 minutes
6. **Use certificate pinning** — pin the backend TLS certificate to prevent MITM credential interception

### App B (Insecure) — M1 Violations

1. **Hardcode a mock API key** in source code: `const API_KEY = "pk_live_1234567890abcdef"` — visible in JS bundle
2. **Log credentials to console** — `console.log("Login attempt:", email, password)` in the login handler
3. **Store credentials in AsyncStorage/SharedPreferences in plaintext**: `await AsyncStorage.setItem("token", response.token)` — no encryption
4. **Pass session token in URL query string**: `GET /api/transactions?token=abc123` — visible in server logs and browser history
5. **Never expire tokens** — server issues a static token that never rotates
6. **No certificate pinning** — any MITM proxy (e.g., Charles Proxy, mitmproxy) can intercept all traffic

---

## 4. M2 — Inadequate Supply Chain Security

> **OWASP Description:** Using unvetted third-party SDKs, libraries, or components that introduce malicious code, privacy violations, or unpatched vulnerabilities into the app.

### M2 — What It Means
Supply chain attacks target the development ecosystem. A compromised npm package, a malicious advertising SDK, or an unpatched library can exfiltrate data or grant attackers access — without the developer's knowledge.

**Real-world examples:**
- 2021: `ua-parser-js` npm package was compromised and distributed cryptocurrency miners via infected builds
- 2019: Several iOS apps were found to contain a malicious SDK (YOUAPP) that secretly harvested user data

### App A (Secure) — M2 Requirements

1. **Maintain a Software Bill of Materials (SBOM)** — list every npm package, Expo package, and native module with version numbers
2. **Pin all dependency versions** using `package-lock.json` / `yarn.lock` — never use ranges like `^1.2.3`
3. **Vet all third-party SDKs** before integration — review privacy policies, data collection practices, and security history
4. **Use automated dependency scanning** — run `npm audit` and integrate Snyk/Dependabot in CI
5. **Audit CI/CD build environments** — build servers use ephemeral, isolated containers; signing keys stored in a vault (e.g., GitHub Actions secrets, AWS KMS)
6. **Use GitHub Actions with pinned action versions** — `@actions/checkout@v4` not `@actions/checkout@main`
7. **Verify build artifact integrity** — generate and publish checksums of built APKs/IPAs; verify before distribution

### App B (Insecure) — M2 Violations

1. **Use `*` (wildcard) versions** in `package.json` — `expo: "*"` — always pulls the latest, unvetted version
2. **Include a known-vulnerable package** — e.g., `request@2.79.0` with known SSRF/callback vulnerabilities
3. **Install packages without auditing** — no `npm audit` in the build pipeline
4. **No SBOM** — no inventory of what's included in the app
5. **Hardcode signing keys** in the repository — `android keystore password: "android123"` in a CI script
6. **Use a mock analytics SDK** that silently logs all user input (email, password, account numbers) to a remote endpoint

---

## 5. M3 — Insecure Authentication/Authorization

> **OWASP Description:** Flaws in how the app authenticates users and authorizes access to data or actions — both client-side and server-side. Includes broken object-level authorization (BOLA/IDOR).

### M3 — What It Means
If authentication logic lives on the client, it's trivially bypassed. If authorization isn't enforced on the backend, any user can access any account. Many data breaches result from IDOR (Insecure Direct Object Reference) vulnerabilities.

**Real-world examples:**
- 2019: Toyota's mobile app allowed attackers to access other users' vehicle information via predictable account IDs (IDOR)
- 2020: A popular banking app checked account ownership client-side only → account takeover

### App A (Secure) — M3 Requirements

1. **All auth decisions enforced on the backend** — the mobile app never makes authorization decisions
2. **Implement OAuth 2.0 / OIDC flow** with short-lived JWT access tokens (15-min expiry) + refresh token rotation
3. **Secure token storage** (see M1 and M9)
4. **Implement BOLA/IDOR protection** — every API request for user data must include the authenticated user's ID in a server-validated session; the backend MUST check that `resource.owner_id == session.user_id`
5. **Rate-limit auth endpoints** — lock accounts after 5 failed login attempts; use exponential backoff
6. **Biometric authentication** with proper fallback policy — use `LocalAuthentication` (iOS) / `BiometricPrompt` (Android) with a server-verified challenge
7. **Session invalidation** — on password change, revoke all refresh tokens for that user
8. **HTTPS only** for all auth endpoints (see M5)

### App B (Insecure) — M3 Violations

1. **Client-side role check** — `const isAdmin = localStorage.getItem("role") === "admin"` — bypassable via JS console
2. **No server-side authorization** — API `GET /api/transactions` returns ALL users' transactions for ANY authenticated caller (no `WHERE user_id = ?`)
3. **No rate limiting** on login — unlimited brute-force attempts
4. **Static session tokens** that never expire and are never rotated
5. **No token revocation** — logging out only removes the token from the device; the backend doesn't invalidate it
6. **IDOR vulnerability** — `GET /api/transactions/123` returns transaction 123 for ANY user, not just their own
7. **No biometric verification** — just check if a boolean flag `biometricEnabled` is true locally

---

## 6. M4 — Insufficient Input/Output Validation

> **OWASP Description:** Insufficient validation of data received from external sources (network, user input, files) and insufficient sanitization of data sent out (logs, display, storage). Allows injection attacks, XSS, command injection.

### M4 — What It Means
Mobile apps are the bridge between untrusted user input / network data and the app's logic. Without validation, attackers can inject malicious payloads via APIs, QR codes, NFC, deep links, or files that are then processed unsafely.

**Real-world examples:**
- 2020: A food delivery app was vulnerable to SQL injection via the order ID parameter in its API
- 2018: Slack's mobile app had a vulnerability where specially crafted deep links could execute arbitrary code

### App A (Secure) — M4 Requirements

1. **Validate all input on the backend** — never trust the mobile client:
   - Enforce strict type checking (amounts must be numeric, email must match RFC 5322 regex)
   - Enforce range constraints (transfer amount > 0, < account balance)
   - Sanitize and escape all user-supplied strings before database storage
2. **Validate input on the client** for UX — reject obviously invalid data before sending:
   - Email format validation
   - Amount validation (no negative numbers, max 2 decimal places for currency)
   - String length limits
3. **Sanitize all output** before displaying:
   - Use SafeAreaView / content escaping in React Native to prevent rendering of injected scripts
   - Strip HTML tags from user-supplied text before storing or displaying
4. **Validate file types and sizes** for receipt uploads — only allow JPEG/PNG, max 10MB
5. **Validate deep link URLs** — only accept scheme + host from allowlist; reject query parameters that could inject code
6. **Log sanitization** — all user input logged server-side must be escaped to prevent log injection

### App B (Insecure) — M4 Violations

1. **No server-side input validation** — backend stores raw SQL: `db.query("SELECT * FROM transactions WHERE id = " + req.params.id)` — classic SQL injection
2. **No client-side validation** — accept any input, including negative transfer amounts, invalid emails, extremely long strings
3. **Reflect user input in UI without sanitization** — display raw user-supplied descriptions, allowing label spoofing
4. **Accept any file type for receipt** — allows uploading `.js`, `.html`, or `.exe` files
5. **No deep link validation** — accepts arbitrary URL schemes like `javascript:alert(1)` in deep links
6. **No output encoding** — logs raw user input without escaping, enabling log injection attacks

---

## 7. M5 — Insecure Communication

> **OWASP Description:** Transmitting data over networks without proper encryption or integrity checks. Includes using insecure protocols, missing TLS, accepting invalid certificates, or not verifying certificates.

### M5 — What It Means
Mobile apps frequently switch between Wi-Fi and cellular networks, many of them untrusted. Without proper TLS enforcement, attackers on the same network (e.g., public Wi-Fi) can intercept, modify, or inject traffic.

**Real-world examples:**
- 2015: Many banking apps were found to accept invalid SSL certificates, enabling MITM attacks on public Wi-Fi
- 2018: The "DragonBlood" vulnerability in WPA3 affected mobile clients that used weak TLS configurations

### App A (Secure) — M5 Requirements

1. **Use TLS 1.2 or higher** — disable SSL v3, TLS 1.0, and TLS 1.1 on the backend
2. **Enforce HTTPS** — backend redirects all HTTP to HTTPS; mobile app only connects via HTTPS
3. **Certificate pinning** — pin the backend's TLS certificate or public key in the app using `pinning` library or native APIs; reject connections that don't match
4. **Validate certificates on the client** — reject self-signed certificates
5. **Use HSTS (HTTP Strict Transport Security)** header on the backend — `Strict-Transport-Security: max-age=31536000; includeSubDomains`
6. **Encrypt all headers and body** — no sensitive data (tokens, PII) in URL query strings or unencrypted headers
7. **No fallback to HTTP** — app must refuse to connect over plain HTTP even if the server offers it
8. **Verify TLS configuration** using SSL Labs or similar tools before deployment

### App B (Insecure) — M5 Violations

1. **Allow HTTP connections** — app connects to `http://api.example.com` with no encryption
2. **Accept invalid/self-signed certificates** — use a custom `TrustManager` (Android) that accepts all certificates
3. **No certificate pinning** — any proxy tool (Charles Proxy, Burp Suite) can intercept HTTPS traffic
4. **Send session token in URL** — `GET /api/user?token=abc123` — token visible in server logs, browser history, and referrer headers
5. **Disable TLS certificate validation** in the HTTP client to "make testing easier"
6. **Use TLS 1.0** — backend supports outdated TLS versions with known vulnerabilities
7. **Trust invalid certificates** in the app's network configuration for "development mode"

---

## 8. M6 — Inadequate Privacy Controls

> **OWASP Description:** Failing to protect user privacy by over-collecting data, sharing it with third parties without consent, or failing to give users control over their data. Non-compliance with GDPR, CCPA, and similar regulations.

### M6 — What It Means
Privacy is not just a legal obligation — it's a security discipline. Excessive data collection expands the attack surface. When a breach occurs, the damage is proportional to how much data was collected unnecessarily.

**Real-world examples:**
- 2018: Google Maps was found to be collecting user location data even when the app was closed — class-action lawsuit followed
- 2019: Several apps using the Facebook SDK were found sharing user data (including PII) with Facebook without proper consent

### App A (Secure) — M6 Requirements

1. **Collect only necessary data** — every data field must have a documented business justification
2. **Display a clear, legible privacy policy** before registration — user must actively consent before any data is collected
3. **Request permissions with justification** — use iOS `NSPrivacyAccessedDescription` keys and Android `android:permission" strings that explain WHY each permission is needed
4. **Minimize analytics** — only collect anonymized, aggregated metrics; never send PII to analytics services
5. **Allow users to export and delete their data** — implement a "Download My Data" and "Delete My Account" feature
6. **Vet third-party SDKs for privacy compliance** (see M2) — ensure no SDK silently harvests contacts, location, or device IDs
7. **Mask sensitive data in UI** — show only last 4 digits of account numbers, mask CVV fields
8. **Redact PII from logs** — never log email addresses, names, or account numbers in production
9. **Comply with GDPR/CCPA** — provide clear consent checkboxes, data retention policies, and opt-out mechanisms

### App B (Insecure) — M6 Violations

1. **Collect excessive data** — silently collect device IDs, contact lists, call logs, and location on app launch
2. **No privacy policy** — or one buried in an obscure Settings menu, not shown at signup
3. **Request unnecessary permissions** — camera access for "setting a profile photo" but actually used to scan the device's photo library continuously
4. **Share data with third parties without consent** — send user email and transaction data to a "marketing partner" API with no disclosure
5. **No data deletion capability** — users cannot delete their account or data
6. **Log PII in plaintext** — write all user emails, names, and account details to server logs
7. **Show full account numbers** in the UI — expose the entire routing and account number

---

## 9. M7 — Insufficient Binary Protections

> **OWASP Description:** Failing to protect the app binary from reverse engineering, code tampering, or intellectual property theft. Attackers decompile the app, extract secrets, and create malicious clones.

### M7 — What It Means
A published mobile app binary is in the hands of an attacker. Without hardening, they can decompile it in minutes, extract hardcoded keys, understand the business logic, and repackage a malicious clone.

**Real-world examples:**
- 2016: Several Pokemon Go clones were found on third-party app stores with malware embedded
- 2020: Banking trojans like Anatsa were distributed as repackaged versions of legitimate banking apps

### App A (Secure) — M7 Requirements

1. **Obfuscate code** — use code minification and obfuscation:
   - **Android:** ProGuard / DexGuard for JavaScript and native code
   - **iOS:** Use `xcodebuild CONFIGURATION_BUILD_DIR` with stripping enabled; consider SwiftShield for sensitive modules
2. **Remove debugging symbols** from release builds — `android:debuggable="false"`, iOS strip debug symbols
3. **Use native code for critical logic** — sensitive operations (cryptography, key derivation) use native (C/C++) modules via React Native's NDK — harder to reverse engineer than JS
4. **Detect and respond to tampering**:
   - Check APK signature matches expected value at runtime (Android)
   - Detect if the app is running on a rooted/jailbroken device and warn/block
   - Verify the app bundle hasn't been modified using a runtime integrity check
5. **No sensitive data in the binary** — all secrets fetched from the backend at runtime (see M1)
6. **Monitor for repackaged clones** — use app reputation services, monitor app store for clones

### App B (Insecure) — M7 Violations

1. **No code obfuscation** — JS bundle shipped as-is, readable with any unzip tool
2. **Include debug symbols** in the release build — `android:debuggable="true"` or iOS build without stripping
3. **Hardcode API keys and secrets in source code** — `const STRIPE_KEY = "sk_live_..."` — trivially extractable from the JS bundle
4. **No root/jailbreak detection** — app runs normally on a rooted device, enabling Frida, Xposed, and other analysis tools
5. **No integrity verification** — no APK signature check; attackers can repackage the app without detection
6. **Include verbose comments** in production code explaining security logic — comments shipped in JS bundle explaining how auth works

---

## 10. M10 — Insufficient Cryptography

> **OWASP Description:** Using weak, broken, or misapplied cryptographic algorithms — or using correct algorithms incorrectly. Includes hardcoded keys, weak PRNGs, deprecated algorithms, and improper key management.

### M10 — What It Means
Cryptography is notoriously easy to misuse. Weak algorithms like MD5, SHA1, or DES provide a false sense of security while being trivial to break. Improper key management defeats the entire purpose of encryption.

**Real-world examples:**
- 2017: Several health apps were found using MD5 to hash patient IDs — rainbow tables could reverse them in seconds
- 2020: A popular dating app stored user location data encrypted with a hardcoded key visible in the binary

### App A (Secure) — M10 Requirements

1. **Use strong, modern algorithms**:
   - **Encryption:** AES-256-GCM or ChaCha20-Poly1305 for data at rest
   - **Hashing:** SHA-256 or SHA-384 (never MD5, SHA1) for checksums
   - **Password hashing:** Argon2id or PBKDF2 with ≥ 128-bit salt and ≥ 100,000 iterations
   - **JWT signing:** RS256 (RSA + SHA-256) with minimum 2048-bit keys
2. **Never hardcode cryptographic keys** — generate per-device keys using Android Keystore / iOS Keychain
3. **Use platform-native secure key storage**:
   - **Android:** `Android Keystore` with `setBlockModes(GCM)` and `setUserAuthenticationRequired(true)`
   - **iOS:** `Keychain Services` with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
4. **Use a proper CSPRNG** (Cryptographically Secure Pseudo-Random Number Generator) — on both client and server
5. **Verify HMAC tags** before using decrypted data — prevent padding oracle attacks
6. **Key rotation** — support re-encryption of data when keys rotate
7. **No ECB mode** — always use authenticated encryption (GCM, ChaCha20-Poly1305) which includes integrity protection

### App B (Insecure) — M10 Violations

1. **Use MD5 for password hashing** — `crypto.createHash('md5').update(password)` — trivial rainbow table attack
2. **Hardcode encryption key in source** — `const ENCRYPTION_KEY = "abcd1234"` — extractable from JS bundle
3. **Use DES/3DES** — `crypto.createCipher('des', key)` — broken in minutes
4. **Store passwords in Base64** — `Buffer.from(password).toString('base64')` — not encryption, not hashing
5. **Use ECB mode for AES** — identical plaintext blocks produce identical ciphertext blocks — patterns are visible
6. **No salt in password hashing** — identical passwords produce identical hashes → rainbow table attack
7. **Use Math.random() for token generation** — predictable, not cryptographically secure

---

## 11. M8 — Security Misconfiguration

> **OWASP Description:** Security misconfigurations at the application, platform, or infrastructure layer. Includes insecure defaults, overly verbose errors, unnecessary features, and misconfigured access controls.

### M8 — What It Means
Most security failures aren't zero-day exploits — they're known misconfigurations that were never fixed. Default passwords, debug endpoints left open, and verbose error messages give attackers a roadmap.

**Real-world examples:**
- 2019: McDonald's mobile app exposed an internal API that allowed anyone to view and modify user orders
- 2021: A major airline's app exposed a staging environment API that returned full PII of all users

### App A (Secure) — M8 Requirements

1. **Disable debug endpoints in production** — no `/api/debug`, `/api/status`, or `/api/reset` in the production backend
2. **Remove default credentials** — all backend services use unique, strong passwords; no `admin/admin`
3. **Serve generic error pages** — never expose stack traces, database errors, or internal paths in HTTP responses
4. **Apply principle of least privilege** to API keys and database users — each service account has only the permissions it needs
5. **Configure WebViews securely** (if used):
   - `setJavaScriptEnabled(false)` unless required
   - No loading of untrusted content
6. **Disable Android `allowBackup`** — `android:allowBackup="false"` in manifest to prevent app data from leaking via ADB backup
7. **Set iOS data protection** — `NSFileProtectionComplete` for all sensitive files
8. **Use a strict Content Security Policy** if serving web content
9. **Regularly scan** with OWASP ZAP, MobSF, or similar tools to catch misconfigurations
10. **Enable backend security headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`

### App B (Insecure) — M8 Violations

1. **Leave debug endpoints active** — `GET /api/debug/database` returns full DB schema and connection info
2. **Show verbose error messages** — `{"error": "SQL syntax error near 'DROP TABLE users' at line 1"}` — full SQL error exposed
3. **Expose stack traces** in API responses — Java/Python stack traces showing internal file paths and function names
4. **Enable `android:allowBackup="true"`** — app data easily extracted via `adb backup`
5. **Use default ports and services** — Redis on default port 6379 without a password; MongoDB without auth
6. **No security headers** — backend doesn't set any `X-*` headers
7. **Enable verbose iOS logging** — `NSLog` statements in production exposing internal app state
8. **WebView with JavaScript enabled** loading content from unvalidated URLs

---

## 12. M9 — Insecure Data Storage

> **OWASP Description:** Storing sensitive data in insecure locations on the device — unencrypted files, world-readable storage, SQLite databases without encryption, or logs that include sensitive information.

### M9 — What It Means
Mobile devices are frequently lost or stolen. An attacker with physical access or a malicious app with read permissions can extract sensitive data from poorly stored app files.

**Real-world examples:**
- 2013: Syrian opposition activists' Android phones were compromised; chat messages were extracted from insecurely stored SQLite databases
- 2019: A popular period-tracking app stored user health data in an unencrypted SQLite database accessible to any app on the device

### App A (Secure) — M9 Requirements

1. **Use EncryptedSharedPreferences (Android)** or **Keychain (iOS)** for ALL sensitive data — auth tokens, account numbers, personal data
2. **Never store sensitive data in AsyncStorage, Redux Persist, or plain files** — these are unencrypted on most devices
3. **Encrypt local databases** — if using SQLite, use `sqlcipher` (Android/iOS) to encrypt the database file with a key from the platform keystore
4. **Disable app data backups**:
   - Android: `android:allowBackup="false"` in manifest; also set `android:fullBackupContent="none"`
   - iOS: Use `NSFileProtectionComplete`; exclude sensitive files from iCloud backup
5. **Clear sensitive data from memory** after use — overwrite variables containing tokens or PII once they're no longer needed
6. **Mask data in UI** — show `****1234` for account numbers, never the full number
7. **No sensitive data in logs** — use filtered logging that redacts tokens, emails, and account numbers (see M1)
8. **Vet third-party SDK caching** — ensure no SDK writes sensitive data to unencrypted local storage

### App B (Insecure) — M9 Violations

1. **Store auth token in AsyncStorage plaintext** — `await AsyncStorage.setItem("token", token)` — readable by any app with storage permissions
2. **Store user profile in a plain JSON file** in the app's documents directory — no encryption
3. **Store transaction history in an unencrypted SQLite database** — readable via `adb shell` on Android or any file browsing tool on a jailbroken device
4. **Save full credit card numbers** to local storage for "convenience" — `await AsyncStorage.setItem("card_number", "4111111111111111")`
5. **Enable `android:allowBackup="true"`** — attacker extracts all app data via `adb backup`
6. **Include sensitive data in iCloud backup** — iOS Keychain items with `kSecAttrAccessibleAfterFirstUnlock` included in iCloud backup
7. **Cache API responses** in an unencrypted local database — full transaction history and account details cached locally
8. **Log sensitive data to console** — `console.log("User logged in:", user.email, user.accountNumber)` in production

---

## 13. Backend Requirements

The backend serves both App A and App B. The backend itself must implement the secure practices. App B demonstrates vulnerabilities that exist because the app is insecure — but the backend still implements proper security so App A works correctly.

### Technology Stack
- **Runtime:** Node.js 20+ with Express.js
- **Database:** SQLite (via `better-sqlite3`) for simplicity and portability — easily auditable
- **Authentication:** JWT (RS256) with access tokens (15-min expiry) + refresh token rotation
- **API Format:** RESTful JSON API

### API Endpoints

#### Auth Endpoints

| Method | Path | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new user | No |
| `POST` | `/api/auth/login` | Authenticate and receive tokens | No |
| `POST` | `/api/auth/refresh` | Refresh access token | Refresh token |
| `POST` | `/api/auth/logout` | Revoke refresh token | Yes |
| `POST` | `/api/auth/change-password` | Change password (revokes all sessions) | Yes |

**Register Request:**
```json
{
  "email": "user@example.com",
  "password": "Str0ng!Pass",
  "displayName": "Jane Doe"
}
```

**Login Response:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "expiresIn": 900
}
```

#### Account Endpoints

| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/accounts` | List current user's accounts | Yes |
| `GET` | `/api/accounts/:id` | Get account details (BOLA check required) | Yes |
| `GET` | `/api/accounts/:id/balance` | Get account balance | Yes |

**Response:**
```json
{
  "id": "acc_123",
  "type": "checking",
  "balance": 5432.10,
  "currency": "USD",
  "accountNumberMasked": "****4521"
}
```

#### Transaction Endpoints

| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/transactions` | List user's transactions (paginated) | Yes |
| `GET` | `/api/transactions/:id` | Get transaction detail (BOLA check required) | Yes |
| `POST` | `/api/transactions/transfer` | Initiate internal transfer | Yes |
| `POST` | `/api/transactions/:id/receipt` | Upload receipt image | Yes |

**Transfer Request:**
```json
{
  "fromAccountId": "acc_123",
  "toAccountId": "acc_456",
  "amount": 100.00,
  "description": "Rent payment"
}
```

#### User Profile Endpoints

| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/user/profile` | Get current user's profile | Yes |
| `PUT` | `/api/user/profile` | Update display name | Yes |
| `DELETE` | `/api/user/data-export` | Export all user data (GDPR) | Yes |
| `DELETE` | `/api/user/account` | Delete user account and all data | Yes |

### Backend Security Requirements (enforced for App A; bypassed/exposed for App B demonstration)

| Requirement | App A Behavior | App B Behavior |
|---|---|---|
| **Input validation** | Strict schema validation (Joi/Zod) on all endpoints | No validation — SQL injection possible |
| **Authorization (BOLA)** | Every resource query checks `resource.user_id == session.user_id` | No ownership check — any user can access any resource |
| **Rate limiting** | 5 login attempts per IP per 15 minutes; 100 API req/min per user | No rate limiting — brute-force possible |
| **Token security** | Short-lived JWT (15 min) + refresh rotation + revocation on logout/password change | Static tokens — never expire, never revoked |
| **Error messages** | Generic: `"Invalid credentials"` | Verbose: includes SQL error details, stack traces |
| **HTTPS** | TLS 1.2+ enforced; HSTS header set | HTTP accepted; TLS not enforced |
| **CORS** | Strict allowlist of mobile app origins | `*` (allow all origins) |
| **Security headers** | `X-Content-Type-Options`, `X-Frame-Options`, CSP | No security headers |
| **Logging** | Redacts PII; logs only structural events | Logs full request bodies including tokens and passwords |
| **Database** | Parameterized queries only (SQL injection-proof) | String concatenation in SQL queries |

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- Argon2id
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME                  -- Soft delete for GDPR
);

-- Accounts table
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                  -- 'checking' | 'savings'
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  account_number_last4 TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),  -- MUST be checked on every query
  from_account_id TEXT REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  amount REAL NOT NULL,
  description TEXT,
  category TEXT,
  receipt_path TEXT,
  status TEXT DEFAULT 'completed',      -- 'pending' | 'completed' | 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,            -- Hash of the refresh token
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 14. Developer Compliance Checklist

Use this checklist during development and before every release to verify OWASP Mobile Top 10 compliance.

### M1 — Improper Credential Usage

- [ ] No credentials (API keys, passwords, tokens, secrets) exist in source code
- [ ] All secrets stored in platform secure storage (iOS Keychain / Android EncryptedSharedPreferences)
- [ ] No credentials logged in console or server logs
- [ ] Tokens passed only in HTTP headers (`Authorization: Bearer`), never in URLs
- [ ] Access tokens expire in ≤ 15 minutes; refresh token rotation implemented
- [ ] Certificate pinning enabled for all HTTPS connections to backend
- [ ] Custom `SecureLog` utility filters sensitive fields from all log output in release builds

### M2 — Inadequate Supply Chain Security

- [ ] All npm/Expo dependencies pinned in `package-lock.json` or `yarn.lock`
- [ ] No wildcard version ranges (`*`) in `package.json`
- [ ] `npm audit` run and all high/critical vulnerabilities resolved
- [ ] Third-party SDKs reviewed for privacy policy and data collection practices
- [ ] SBOM (Software Bill of Materials) generated for the release build
- [ ] CI/CD uses ephemeral build environments; signing keys in vault, not in repo
- [ ] GitHub Actions / CI use pinned action versions (`@v4`, not `@main`)

### M3 — Insecure Authentication/Authorization

- [ ] All authentication and authorization decisions enforced on the backend
- [ ] No role or permission checks implemented client-side only
- [ ] Every API resource query verifies `resource.user_id == session.user_id` (BOLA/IDOR protection)
- [ ] Login endpoint rate-limited: max 5 attempts per IP per 15 minutes
- [ ] Failed login returns generic message (`"Invalid credentials"`), never reveals which field is wrong
- [ ] Biometric auth (if used) includes a server-verified challenge; not bypassable via flag
- [ ] Refresh tokens revoked on logout and password change
- [ ] JWT access tokens signed with RS256, 2048-bit minimum key

### M4 — Insufficient Input/Output Validation

- [ ] All user input validated server-side with strict type, range, and format checks
- [ ] No SQL query string concatenation — parameterized queries only
- [ ] All strings sanitized before database storage (no raw HTML stored)
- [ ] Client-side validation for UX (email format, amount range, string length)
- [ ] User-supplied content escaped before display in UI
- [ ] File upload validates type (JPEG/PNG only) and size (max 10MB)
- [ ] Deep link URLs validated against an allowlist before use
- [ ] Server-side log output sanitized to prevent log injection

### M5 — Insecure Communication

- [ ] All API endpoints require HTTPS (TLS 1.2+)
- [ ] Backend sends `Strict-Transport-Security` header (HSTS)
- [ ] Certificate pinning configured in the mobile app
- [ ] App rejects self-signed and invalid certificates
- [ ] No sensitive data (tokens, account numbers) in URL query strings
- [ ] No HTTP fallback — app refuses plain HTTP connections
- [ ] Backend TLS configuration verified with SSL Labs (Grade A or above)

### M6 — Inadequate Privacy Controls

- [ ] Privacy policy displayed and consent obtained before data collection
- [ ] Each permission request (camera, location, contacts) includes a clear justification string
- [ ] Only data strictly necessary for the feature is collected
- [ ] Third-party SDKs audited — none collect data beyond what's declared
- [ ] Users can export their data (`DELETE /api/user/data-export`)
- [ ] Users can permanently delete their account and all data (`DELETE /api/user/account`)
- [ ] PII masked in UI (show only last 4 digits of account numbers)
- [ ] Analytics uses anonymized, aggregated data — no PII transmitted

### M7 — Insufficient Binary Protections

- [ ] Code obfuscation enabled in release builds (ProGuard/DexGuard for Android; stripping for iOS)
- [ ] `android:debuggable="false"` in release builds (Android)
- [ ] Debug symbols stripped from iOS release IPA
- [ ] Root/jailbreak detection implemented (warns or blocks access on compromised devices)
- [ ] APK signature verified at runtime (Android); bundle integrity checked (iOS)
- [ ] No sensitive data (API keys, secrets, credentials) embedded in the binary — fetched at runtime only
- [ ] Verbose comments explaining security logic NOT included in production JS bundle

### M8 — Security Misconfiguration

- [ ] Debug endpoints (`/api/debug`, `/api/status`) disabled in production
- [ ] Default credentials changed; no `admin/admin` or similar defaults
- [ ] Generic error messages — no stack traces, SQL errors, or internal paths in API responses
- [ ] Backend security headers set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- [ ] Principle of least privilege applied to database users and API keys
- [ ] WebViews (if used) have `JavaScript` disabled unless required, and only load allowlisted content
- [ ] `android:allowBackup="false"` set in Android manifest
- [ ] iOS `NSFileProtectionComplete` applied to sensitive files

### M9 — Insecure Data Storage

- [ ] Auth tokens stored in iOS Keychain or Android EncryptedSharedPreferences — never in AsyncStorage, plain files, or plain SQLite
- [ ] Account numbers and PII stored encrypted at rest
- [ ] No sensitive data (passwords, full account numbers, tokens) in React state that gets persisted
- [ ] Sensitive data cleared from memory after use (overwrite variables)
- [ ] `android:allowBackup="false"` prevents data extraction via `adb backup`
- [ ] iOS Keychain items use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (not `AfterFirstUnlock` which allows iCloud backup)
- [ ] No third-party SDK writes sensitive data to unencrypted storage
- [ ] Account numbers displayed masked: `****4521`, never full number

### M10 — Insufficient Cryptography

- [ ] Passwords hashed with Argon2id or PBKDF2 (≥ 128-bit salt, ≥ 100,000 iterations)
- [ ] Data at rest encrypted with AES-256-GCM or ChaCha20-Poly1305
- [ ] No MD5, SHA1, DES, or 3DES used anywhere in the application
- [ ] No ECB mode used for block ciphers
- [ ] Cryptographic keys generated and stored in iOS Keychain / Android Keystore — never hardcoded
- [ ] Tokens generated using `crypto.randomBytes()` or equivalent CSPRNG — never `Math.random()`
- [ ] All cryptographic operations use audited, maintained libraries (Node.js `crypto`, iOS CryptoKit, Android Keystore)
- [ ] JWT signing uses RS256 with ≥ 2048-bit RSA key

---

## Sources

- [OWASP Mobile Top 10 — Official Project Page](https://owasp.org/www-project-mobile-top-10/)
- [OWASP MASVS — Mobile Application Security Verification Standard](https://github.com/OWASP/owasp-masvs)
- [OWASP MSTG — Mobile Security Testing Guide](https://github.com/OWASP/owasp-mstg)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation.html)
- [OWASP Software Component Verification Standard (SCVS)](https://owasp.org/www-project-software-component-verification-standard/)
- [Android Security-Crypto Library (EncryptedSharedPreferences)](https://developer.android.com/training/articles/keystore)
- [iOS CryptoKit Documentation](https://developer.apple.com/documentation/cryptokit)
- [MobSF — Mobile Security Framework](https://github.com/MobSF/MobSF)
