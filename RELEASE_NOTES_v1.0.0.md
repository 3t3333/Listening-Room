# Listening Room v1.0.0 Release Notes 🎉

Welcome to the official **v1.0.0 milestone release** of **Listening Room**! What began as an experimental desktop concept has evolved into a full-fledged spatial music workstation, digital vinyl archive, and high-fidelity visualizer.

This release consolidates months of architectural enhancements, performance optimizations, and tactile audio features into our first major production release.

---

## What's New in v1.0.0

### 🎧 1. Spatial Listening Themes & Dual-Deck DJ Rig
- **5 Complete Visual Themes**: *Warm Room*, *Midnight Mix*, *Visualizer Stand*, *Archive Room*, and the flagship *DJ Setup*.
- **Physical Turntable Mechanics**: Dual spinning decks with needle tracking, Technics Classic vs. Modern tonearm styles, realistic surface grooving vs. classic wax, customizable slipmats, and 4 chassis finishes (Classic, Dark, Silver, Gold).
- **Battle-Style Auto-Rotation**: Automatically rotates decks 90° into a stacked vertical battle rig when snapping the window to the side of your monitor.
- **Physical Animations**: Smooth record flight animations when queuing albums onto the deck.

### 💿 2. Dual Audio Engine: Spotify Connect & Local MP3 Studio
- **Native Spotify Connect**: Embedded `librespot` daemon runs autonomously without requiring Spotify developer accounts or API keys.
- **Local MP3 Studio**: Create custom records from local MP3 files with automatic ID3 tag parsing and high-resolution artwork extraction.
- **Integrated Tracklist Editor**: Reorder tracks, customize song titles, and adjust timings directly within the app.
- **Unified Hardware Routing**: Seamlessly route both Spotify and local MP3 playback to any connected Windows audio endpoint with synchronized volume control.

### 📊 3. 60 FPS Real-Time Audio Spectrum Visualizer
- **WASAPI Loopback Capture**: Low-latency 12-band audio spectrum analyzer powered by `RustFFT` streaming at a locked 60 FPS.
- **Vibrant Saturation-First Palette Extraction**: Intelligently samples vivid primary and accent colors from album artwork, eliminating muddy neutral fallbacks.
- **Per-Album Color Overrides**: Assign custom visualizer RGB lighting to individual records or adapt dynamically to your background.

### 🖼️ 4. Live Video Wallpapers & Bespoke Album Customization
- **Animated Live Wallpapers**: Full support for high-definition GIFs, MP4, and WebM video backgrounds with 60-second loop truncation and music pause sync.
- **Dynamic Ambient Color Engine**: Automatically samples live video color changes every 5 seconds to bathe the room in synchronized ambient light.
- **Pan & Zoom Framing**: Precise interactive positioning (Cover/Contain, 100%–200% zoom, X/Y offset).
- **Custom Album Overrides**: Assign unique wallpapers, 12+ collector vinyl wax colors (Ruby, Emerald, Cobalt, Gold, Marble, Clear), and custom Discogs artwork overrides to any album.

### 📚 5. 3D Spine Shelf & Zero-Quota Full System Backup
- **3D Vinyl Spine Shelf**: Browse your library like physical record crates with authentic spine typography, album widths, and an optional frosted glassy overlay.
- **Sequential Album Queuing**: Queue entire albums with automatic track-to-track and album-to-album progression (mixed hybrid queuing arriving in v1.1).
- **Zero-Quota Portable Backups**: Export and import your entire collection—including gigabytes of local MP3 audio, artwork, video wallpapers, and settings—via a single JSON backup file safely managed in IndexedDB.

---

## Performance & Stability Highlights
- **Eliminated UI Thrashing**: Replaced legacy storage polling with pure synchronous getters and single-run startup initialization.
- **Optimized Video Decoding**: Hardened multi-video transitions and memoized orientation measurement to deliver silky, stutter-free 60 FPS playback.
- **Robust Storage Handshake**: Multi-version IndexedDB safety preventing storage errors and ensuring reliable offline asset loading.

---

## Installation & Upgrading
Download and run the installer:
- **`Listening Room_1.0.0_x64-setup.exe`**

*Requires 64-bit Windows 10 or Windows 11. Spotify Premium required for Spotify Connect playback; local MP3 playback requires no account.*
