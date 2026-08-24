# Listening Room

Listening Room is an experimental Spotify desktop player built around tactile vinyl interfaces, spatial listening-room themes, and live system-audio visualization. The project currently targets Windows and is hosted in the `spotify-player` repository until its final name is chosen.

## Features

- Spotify playback controls and current-track metadata
- Warm Room and Midnight Mix visual themes
- Live 12-band WASAPI loopback visualizer
- Local record collections and a 10-track recently played history
- Interactive 3D record sleeves and carousel browsing
- Artwork-derived ambient and visualizer colors
- Persistent custom backgrounds with opacity and adaptive color extraction
- Local-first collection and appearance storage

## Stack

- Tauri 2
- Rust 2024
- React 19 and TypeScript
- Vite 7
- RSpotify
- Windows WASAPI and RustFFT

## Requirements

- Windows 10 or 11
- Node.js 20 or newer
- Rust stable toolchain
- Microsoft C++ Build Tools and the Windows SDK
- Microsoft Edge WebView2 Runtime
- A Spotify developer application and Spotify account with playback support

## Spotify Setup

1. Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Register `http://127.0.0.1:8888/callback` as a redirect URI.
3. Copy `.env.example` to `.env`.
4. Fill in your Spotify client ID and client secret.

Never commit `.env` or real Spotify credentials. Desktop-distributed client secrets cannot be treated as private; rotate any credential that has previously been exposed.

## Development

Install dependencies:

```powershell
npm install
```

Run the desktop application:

```powershell
npm run tauri dev
```

Build the frontend:

```powershell
npm run build
```

Run Rust verification:

```powershell
cargo test --locked
cargo clippy --all-targets --all-features --locked -- -D warnings
```

## Local Data

- Collections and lightweight preferences use browser local storage.
- Uploaded custom backgrounds are stored as Blobs in IndexedDB.
- Spotify credentials remain in the ignored `.env` file.
- Build artifacts and downloaded design references are not tracked.

## Branches

- `main`: stable project history
- `develop`: active integration work

Create feature branches from `develop` and merge tested work back through pull requests.

## Status

This project is under active development. Interface behavior, storage formats, and branding may change before the first release.
