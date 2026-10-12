#!/usr/bin/env bash
set -euo pipefail

echo "===================================================================="
echo " Listening Room - Linux Development & AppImage Toolchain Setup"
echo "===================================================================="

# Detect distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    DISTRO="unknown"
fi

echo "Detected OS: ${PRETTY_NAME:-$DISTRO}"

# Install native C libraries and build dependencies
if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ] || [ "${ID_LIKE:-}" = "debian" ]; then
    # Sanitize any corrupted third-party APT keyrings before running apt-get update
    if [ -f /etc/apt/keyrings/githubcli-archive-keyring.gpg ]; then
        if file /etc/apt/keyrings/githubcli-archive-keyring.gpg | grep -qi "HTML"; then
            echo "Detected corrupted HTML in /etc/apt/keyrings/githubcli-archive-keyring.gpg. Repairing..."
            sudo rm -f /etc/apt/keyrings/githubcli-archive-keyring.gpg
            sudo mkdir -p -m 755 /etc/apt/keyrings
            if ! curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null; then
                echo "Could not refresh githubcli keyring; disabling /etc/apt/sources.list.d/github-cli.list to prevent blocking apt-get..."
                sudo rm -f /etc/apt/sources.list.d/github-cli.list
            fi
        fi
    fi

    echo "Updating APT packages and installing system libraries..."
    sudo apt-get update || true
    sudo apt-get install -y \
        build-essential \
        curl \
        wget \
        file \
        pkg-config \
        libssl-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        libwebkit2gtk-4.1-dev \
        libasound2-dev \
        libasound2-plugins \
        alsa-utils \
        pulseaudio-utils \
        gstreamer1.0-plugins-base \
        gstreamer1.0-plugins-good \
        gstreamer1.0-plugins-bad \
        gstreamer1.0-plugins-ugly \
        gstreamer1.0-tools \
        x11-xserver-utils \
        patchelf \
        fuse \
        libfuse2t64 \
        squashfs-tools \
        nodejs \
        npm
elif [ "$DISTRO" = "fedora" ] || [ "${ID_LIKE:-}" = "fedora" ]; then
    echo "Installing Fedora DNF packages..."
    sudo dnf groupinstall -y "Development Tools"
    sudo dnf install -y \
        curl \
        wget \
        file \
        pkgconf-pkg-config \
        openssl-devel \
        gtk3-devel \
        libappindicator-gtk3-devel \
        librsvg2-devel \
        webkit2gtk4.1-devel \
        alsa-lib-devel \
        patchelf \
        fuse \
        fuse-libs \
        squashfs-tools \
        nodejs \
        npm
else
    echo "Warning: Unrecognized distribution '$DISTRO'. Please install WebKitGTK 4.1, GTK3, ALSA, and patchelf manually."
fi

# Ensure Rust is installed
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi

if ! command -v cargo &> /dev/null; then
    echo "Rust/Cargo not found. Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust is already installed: $(cargo --version)"
fi

echo "Node.js version: $(node --version 2>/dev/null || echo 'not installed')"
echo "NPM version: $(npm --version 2>/dev/null || echo 'not installed')"

# Ensure ALSA routes to PulseAudio in WSL
if [ -n "${PULSE_SERVER:-}" ] && [ ! -f /etc/asound.conf ]; then
    echo "Configuring ALSA to route to WSLg PulseAudio server..."
    sudo bash -c "cat << 'EOF' > /etc/asound.conf
pcm.!default {
    type pulse
}
ctl.!default {
    type pulse
}
EOF" || true
fi

echo "===================================================================="
echo " Setup complete! You are ready to build Linux AppImages."
echo " Run: ./scripts/build-linux.sh --bundle appimage"
echo "===================================================================="
