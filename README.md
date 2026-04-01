# OWASP Mobile Demo Suite

This repository contains fully separated secure and insecure mobile banking stacks for comparing behavior against the OWASP Mobile Top 10 2024 list.

## Projects

- `secure-backend/`: Express + SQLite API that exposes only secure behavior on `/api/*`.
- `insecure-backend/`: Express + SQLite API that exposes only intentionally insecure behavior on `/api/*`.
- `secure-app/`: Bare React Native demo that uses native secure storage and safer UX patterns.
- `insecure-app/`: Bare React Native demo that intentionally stores secrets in plaintext and leaks data.
- `docs/`: lab setup notes and the OWASP test guide.

## Quick Start

1. `npm --prefix secure-backend install`
2. `npm --prefix insecure-backend install`
3. `npm --prefix secure-app install`
4. `npm --prefix insecure-app install`
5. `npm run reset:secure-backend`
6. `npm run reset:insecure-backend`
7. `npm run start:secure-backend`
8. `npm run start:insecure-backend`
9. Run each mobile app from its own folder with the standard React Native community CLI flow.

## Seed Accounts

- `alice@example.com` / `Str0ng!Pass`
- `bob@example.com` / `Banking!123`

## Notes

- The insecure app and insecure backend are intended for local demonstration only.
- Each app/backend stack is independent and should be installed from its own folder instead of relying on a root workspace install.
- See `docs/owasp-test-guide.md` for criterion-by-criterion testing steps.
