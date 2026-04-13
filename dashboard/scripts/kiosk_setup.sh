#!/bin/bash

# KegHero Dashboard - Raspberry Pi 4 Kiosk Mode Setup
# Designed for 720x1560 vertical display with hardware acceleration
# Optimized for Raspberry Pi OS Bookworm (KMS/DRM)

echo "🚀 Starting KegHero Dashboard Kiosk Setup..."

# 1. Update & Install Dependencies
sudo apt update
sudo apt install -y cmake build-essential libsystemd-dev libinput-dev libudev-dev libgbm-dev libdrm-dev libegl-mesa0 libgles2-mesa-dev pkg-config

# 2. Build flutter-pi from Source (Recommended for stability)
echo "📦 Building flutter-pi engine..."
cd ~
if [ ! -d "flutter-pi" ]; then
    git clone https://github.com/ardera/flutter-pi.git
fi
cd flutter-pi
mkdir -p build && cd build
cmake ..
make -j$(nproc)
sudo make install

# 3. Permissions Fix
# Ensure the 'pi' user (or current user) has access to graphics hardware
sudo usermod -a -G render,video $USER

# 4. Create the Launcher Script
LAUNCHER_PATH="/home/$USER/start_dashboard.sh"

# Find flutter-pi binary
if [ -f "/home/$USER/flutter-pi" ]; then
    FLUTTER_PI_BIN="/home/$USER/flutter-pi"
else
    FLUTTER_PI_BIN="/usr/local/bin/flutter-pi"
fi

cat <<EOF > "$LAUNCHER_PATH"
#!/bin/bash

# Start Flutter Dashboard in fullscreen on KMS
# --vulkan: Use Vulkan backend for better shader performance on RPi 4
# --enable-impeller: Experimental rendering engine for smoother animations
# Note: Root/Sudo is often required for direct KMS access
sudo $FLUTTER_PI_BIN \\
    --release \\
    --vulkan \\
    --enable-impeller \\
    /home/$USER/dashboard/asset_bundle
EOF

# Make launcher executable
chmod +x "$LAUNCHER_PATH"
# Ensure it's owned by the user
chown $USER:$USER "$LAUNCHER_PATH"

echo "✅ Kiosk launcher created at $LAUNCHER_PATH"
echo ""
echo "🚀 Performance Tips for Bookworm + KMS:"
echo "1. GPU Memory: In /boot/firmware/config.txt, set 'gpu_mem=256' or higher."
echo "2. Permissions: You MUST reboot for hardware acceleration groups to take effect."
echo ""
echo "👉 After rebooting, run with: $LAUNCHER_PATH"
