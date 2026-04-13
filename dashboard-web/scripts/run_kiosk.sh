#!/bin/bash

# KegHero Dashboard - Chromium Kiosk Launcher
# Designed for Raspberry Pi OS Bookworm (Wayland/Wayfire)

# Wait for display and network to be ready
sleep 5

# Set working directory to the dashboard folder
cd "$(dirname "$0")/.."

# Path to the local index.html
DASHBOARD_PATH="file://$(pwd)/index.html"

echo "🚀 Launching KegHero Dashboard in Kiosk Mode..."
echo "📍 Dashboard: $DASHBOARD_PATH"

# Launch Chromium with flags for low-latency and fullscreen
# --ozone-platform=wayland: Ensures hardware acceleration on Wayland
# --autoplay-policy=no-user-gesture-required: Allow audio/animations to start
chromium-browser \
    --kiosk \
    --no-first-run \
    --noerrdialogs \
    --disable-infobars \
    --disable-translate \
    --disable-features=Translate \
    --disable-session-crashed-bubble \
    --overscroll-history-navigation=0 \
    --ozone-platform=wayland \
    --autoplay-policy=no-user-gesture-required \
    "$DASHBOARD_PATH"
