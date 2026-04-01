# Local Lab Setup

## Secure backend

1. Run `npm --prefix secure-backend install`.
2. Run `npm run reset:secure-backend` to recreate the SQLite database and seed data.
3. Start the API with `npm run start:secure-backend`.
4. Verify the health endpoint at `http://localhost:4001/health`.

## Insecure backend

1. Run `npm --prefix insecure-backend install`.
2. Run `npm run reset:insecure-backend` to recreate the SQLite database and seed data.
3. Start the API with `npm run start:insecure-backend`.
4. Verify the health endpoint at `http://localhost:4002/health`.

## Secure app

1. Run `npm --prefix secure-app install`.
2. For iOS, run `bundle install` and `bundle exec pod install` inside `secure-app/ios` if CocoaPods has not been installed yet.
3. Start Metro with `npm run start:secure`.
4. Launch the app using the React Native community CLI flow for Android or iOS.

## Insecure app

1. Run `npm --prefix insecure-app install`.
2. For iOS, run `bundle install` and `bundle exec pod install` inside `insecure-app/ios` if CocoaPods has not been installed yet.
3. Start Metro with `npm run start:insecure`.
4. Launch the app using the React Native community CLI flow for Android or iOS.

## Environment defaults

- Secure backend: `http://localhost:4001/api`
- Insecure backend: `http://localhost:4002/api`
- Android emulator secure traffic: `http://10.0.2.2:4001/api`
- Android emulator insecure traffic: `http://10.0.2.2:4002/api`

## Seed identities

- Alice: `alice@example.com` / `Str0ng!Pass`
- Bob: `bob@example.com` / `Banking!123`
