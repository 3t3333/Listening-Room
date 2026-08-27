# Listening Room

Listening Room is an experimental Spotify desktop player built around tactile vinyl interfaces, spatial listening-room themes, and live system-audio visualization. It uses librespot for playback and Spotify Connect, so installing the application does not require a Spotify developer application or API credentials.

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
- librespot and Spotify Connect
- Windows WASAPI and RustFFT

## Requirements

- Windows 10 or 11
- Microsoft Edge WebView2 Runtime
- A Spotify Premium account

## First Run

1. Install and open Listening Room.
2. Select **Connect Spotify**.
3. Complete Spotify sign-in in the browser window.
4. Return to Listening Room and select it as the active device from another Spotify client if playback has not transferred automatically.

The authenticated session is cached in the application data directory and restored on future launches. Listening Room appears as a Spotify Connect device and synchronizes the active device's upcoming queue.

Select the record icon in the top-left corner to open Settings. **Audio output** can follow the Windows default or target a specific connected device; changing it briefly reconnects Listening Room to Spotify.

## Development

Development requires Node.js 20 or newer, the stable Rust toolchain, Microsoft C++ Build Tools, and the Windows SDK.

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
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
```

Build the Windows installer:

```powershell
npm run tauri build
```

The NSIS installer is written to `target/release/bundle/nsis/`.

## Local Data

- Collections and lightweight preferences use browser local storage.
- Uploaded custom backgrounds are stored as Blobs in IndexedDB.
- Librespot credentials, volume, audio output selection, audio cache, and the generated device ID are stored under the application data directory.
- Build artifacts and downloaded design references are not tracked.

## Legacy Web API

The retired RSpotify implementation is archived behind the non-default `legacy-web-api` Cargo feature so it continues to type-check without entering normal builds. Its commands are not registered in the current runtime; it is retained as migration reference and is not required for playback, metadata, collections, or queue synchronization.

## Branches

- `main`: stable project history
- `develop`: active integration work

Create feature branches from `develop` and merge tested work back through pull requests.

## Status

This project is under active development. Interface behavior, storage formats, and branding may change before the first release.
