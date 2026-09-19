# Listening Room

**Listening Room** is a spatial music listening room, digital vinyl archive, and tactile audio workstation built for desktop. Powered by **Tauri 2**, **Rust**, and **React 19**, it seamlessly bridges live **Spotify Connect** streaming with an offline **Local MP3 Studio**, backed by a 60 FPS system audio spectrum visualizer, animated live video wallpapers, physical dual-deck turntables, and 3D vinyl shelf browsing.

---

## Feature Bundles

### 1. Spatial Themes & Dual-Deck DJ Rig
Experience music across 5 immersive visual themes: **Warm Room** for cozy minimalist listening, **Midnight Mix** for a neon lounge vibe with a floating vinyl record, **Visualizer Stand** for a focused studio rack display, **Archive Room** for crate-digging through 3D records, and the flagship **DJ Setup** featuring a dual-deck battle workstation. The DJ setup includes physical spinning record physics, realistic vinyl surface grooving vs. classic gloss wax, tonearm tracking with interchangeable stylus styles (Technics Classic vs. Modern), customizable slipmats, and 4 turntable chassis finishes (Classic, Dark, Silver, Gold). Its intelligent **Battle-Style Auto-Rotation** detects narrow or vertically snapped windows, automatically rotating the decks 90° (CW/CCW) into a stacked battle rig with responsive jacket placement and record flight animations.

-----SS_(DJ Setup dual-deck battle mode with spinning vinyl, glowing visualizer, and custom slipmats)--------

### 2. Dual Audio Engine: Spotify Connect & Local MP3 Studio
Listening Room operates as an autonomous Spotify Connect endpoint via an integrated `librespot` daemon—no Spotify developer account, client IDs, or API keys required. Alongside streaming, the built-in **Local MP3 Studio** lets you craft custom digital vinyl records from local audio files with automatic ID3 tag extraction and high-resolution artwork storage in IndexedDB. Fine-tune any album with the integrated **MP3 Tracklist Editor** to reorder tracks, adjust timings, and edit song metadata. Both playback engines share unified hardware audio output routing, allowing seamless device switching and real-time synchronized system volume control.

-----SS_(MP3 Record Creator and Tracklist Editor dialog showing custom record assembly)--------

### 3. Real-Time WASAPI Loopback Spectrum Visualizer
A high-precision, 12-band audio spectrum analyzer captures system audio loopback via Windows WASAPI and RustFFT, rendering responsive, low-latency visualizer bars at a locked 60 FPS across themes. An advanced **saturation-first color extraction engine** analyzes the active album cover art to isolate vibrant primary and accent tones—eliminating dull or muddy fallback colors—and applies glowing ambient lighting to the scene. Visualizer colors can automatically adapt to the album artwork, match the current live wallpaper, or be assigned a custom RGB hex code on a per-record basis.

-----SS_(Midnight Mix and Visualizer Stand themes showing the 12-band real-time audio spectrum analyzer in action)--------

### 4. Live Video Wallpapers & Bespoke Customization
Transform your listening room into a living canvas with full support for animated **Live Wallpapers**, including high-definition animated GIFs, MP4, and WebM video files. Videos feature intelligent 60-second loop truncation, dynamic 5-second ambient color schedule generation, and pause-with-music synchronization. The interactive **Background Framing Dialog** provides precise Pan (X/Y) and Zoom (100%–200%) controls in Cover or Contain modes. Beyond global backgrounds, configure **Per-Album Customization** to assign unique video/image wallpapers, choose from 12+ collector vinyl wax colors (Ruby, Emerald, Cobalt, Gold, Marble, Clear), set dedicated visualizer hues, or override jacket artwork via Discogs.

-----SS_(Custom Background Framing Dialog with live video wallpaper preview and position controls)--------

### 5. 3D Spine Shelf & Zero-Quota Full System Backup
Browse your collection naturally with the **3D Spine Shelf**, an authentic wooden or frosted glassy vinyl rack displaying realistic spine typography, album widths, and jacket wear. Queue entire albums sequentially with automated queue progression, watching records smoothly fly from the shelf onto the turntable platter (with mixed hybrid queueing slated for v1.1). Your entire library—including gigabytes of local MP3 audio tracks, high-res artwork, video live wallpapers, custom colors, and collections—can be exported and restored through a single **Zero-Quota Backup JSON file** that safely restores all media into IndexedDB with zero browser storage limitations.

-----SS_(3D Spine Shelf view displaying a collector's vinyl library with realistic spine typography)--------

---

## Tech Stack

- **Desktop Framework**: [Tauri 2](https://tauri.app/) (Rust 2024 backend + Windows WebView2)
- **Frontend UI**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 7](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide Icons](https://lucide.dev/)
- **Streaming Engine**: `librespot` (Spotify Connect daemon over Rust async runtime)
- **Audio Analysis**: Windows WASAPI loopback capture + `RustFFT` (12-band spectrum processing)
- **Local Media Storage**: IndexedDB (`listening-room-assets`) for large audio blobs, video wallpapers, and artwork; `localStorage` for lightweight preferences

---

## Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Runtime**: Microsoft Edge WebView2 Runtime (pre-installed on modern Windows)
- **Spotify Streaming**: A Spotify Premium account is required for Spotify Connect playback (Local MP3 playback does not require Spotify)

---

## First Run Guide

1. **Install & Launch**: Download and run `Listening Room_1.0.0_x64-setup.exe` from the latest release.
2. **Connect Spotify (Optional)**: Click **Connect Spotify**, complete authorization in the browser popup, and select **Listening Room** as your target device from any official Spotify app.
3. **Import Local MP3s**: Click the **Library** button, select **Create MP3 Record**, and drop your audio files and cover art to build digital records.
4. **Choose a Theme**: Use the theme switcher in the header to jump between *Warm Room*, *Midnight Mix*, *Visualizer Stand*, *Archive Room*, and *DJ Setup*.
5. **Set a Live Wallpaper**: Click the Settings gear, navigate to **Background**, upload an image, GIF, or MP4 video, and frame it to your liking.

---

## Development & Building

### Prerequisites
- [Node.js 20+](https://nodejs.org/)
- [Rust Toolchain (stable)](https://rustup.rs/)
- Microsoft C++ Build Tools & Windows SDK

### Setup & Run
```powershell
# Install frontend dependencies
npm install

# Run application in development mode
npm run tauri dev
```

### Production Build
```powershell
# Compile frontend and generate Windows NSIS installer
npm run tauri build
```
The compiled installer will be located in `target/release/bundle/nsis/`.

---

## License

Private & Proprietary. All rights reserved.
