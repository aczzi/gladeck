# Gladeck

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
# Start Firestore emulator
firebase emulators:start --only firestore
# Start Vite development server
npm run dev
# Lint and format code
npm run prettier
```

## GitHub Firebase Workflow

```sh
npm install -g firebase-tools
firebase login
firebase init
firebase init hosting:github
firebase apps:create
firebase apps:sdkconfig WEB
```

## Scripts Local Configuration

```sh
node scripts/bootstrap.js <USERNAME> <LEVEL>
```

Creates a dev player and the `admin/configuration` document against the
local Firestore emulator.
