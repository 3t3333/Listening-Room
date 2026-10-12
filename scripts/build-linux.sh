#!/usr/bin/env bash
set -euo pipefail

# Ensure Cargo and Node are in PATH if installed in user profile
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

# Parse arguments
BUNDLE_TARGET="appimage"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --bundle|-b)
            BUNDLE_TARGET="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: ./scripts/build-linux.sh [--bundle appimage|deb|all]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "===================================================================="
echo " Building Listening Room for Linux (Target: $BUNDLE_TARGET)"
echo " Repository: $REPO_DIR"
echo "===================================================================="

# Ensure AppImage creation works in containerized/WSL environments
export APPIMAGE_EXTRACT_AND_RUN=1

# Ensure npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies (npm install)..."
    npm install
fi

# Build with Tauri CLI
echo "Executing Tauri build for bundles: $BUNDLE_TARGET..."
npx tauri build --bundles "$BUNDLE_TARGET"

echo "===================================================================="
echo " Build finished successfully!"
echo " Artifacts located in:"
if [ -d "src-tauri/target/release/bundle" ]; then
    find "src-tauri/target/release/bundle" -maxdepth 3 -type f \( -name "*.AppImage" -o -name "*.deb" \) -exec ls -lh {} +
elif [ -d "target/release/bundle" ]; then
    find "target/release/bundle" -maxdepth 3 -type f \( -name "*.AppImage" -o -name "*.deb" \) -exec ls -lh {} +
fi
echo "===================================================================="
