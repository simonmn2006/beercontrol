#!/bin/bash

# KegHero Dashboard - Raspberry Pi 4 Kiosk Mode Setup
# Designed for 720x1560 vertical display with hardware acceleration
# Optimized for Raspberry Pi OS Bookworm (KMS/DRM + VULKAN)

echo "🚀 Starting KegHero Dashboard Kiosk Setup..."

# 1. Update & Install Dependencies (including Vulkan Drivers)
sudo apt update
sudo apt install -y cmake build-essential libsystemd-dev libinput-dev libudev-dev libgbm-dev \
     libdrm-dev libegl-mesa0 libgles2-mesa-dev pkg-config \
     mesa-vulkan-drivers libvulkan-dev

# 2. Build flutter-pi from Source (Enabling VULKAN for best performance)
echo "📦 Building flutter-pi engine with Vulkan support..."
cd ~
if [ ! -d "flutter-pi" ]; then
    git clone https://github.com/ardera/flutter-pi.git
fi
# Ensure ownership is correct to avoid CMake permission errors
sudo chown -R $USER:$USER ~/flutter-pi
cd flutter-pi
mkdir -p build && cd build

# Configure with Vulkan enabled
cmake .. -DENABLE_VULKAN=On -DVULKAN_DEBUG=OFF

# Compile and Install
make -j$(nproc)
sudo make install

# 3. Permissions Fix
# Ensure the 'pi' user (or current user) has access to graphics hardware
sudo usermod -a -G render,video $USER

# 4. Create the Launcher Script
LAUNCHER_PATH="/home/$USER/start_dashboard.sh"

cat <<EOF > "$LAUNCHER_PATH"
#!/bin/bash

# Start Flutter Dashboard in fullscreen on KMS
# --vulkan: Use Vulkan backend for high-performance shader physics
# Note: Root/Sudo is required for direct KMS access
sudo /usr/local/bin/flutter-pi \\
    --release \\
    --vulkan \\
    /home/$USER/dashboard/asset_bundle
EOF

# Make launcher executable
chmod +x "$LAUNCHER_PATH"
# Ensure it's owned by the user
chown $USER:$USER "$LAUNCHER_PATH"

echo "✅ Kiosk launcher created at $LAUNCHER_PATH"
echo ""
echo "🚀 Performance Tips for Bookworm + KMS (Vulkan Mode):"
echo "1. GPU Memory: In /boot/firmware/config.txt, set 'gpu_mem=256' or higher."
echo "2. Permissions: You MUST reboot for hardware acceleration groups to take effect."
echo "3. Engine: Compiled with -DENABLE_VULKAN=On for maximum smoothness."
echo ""
echo "👉 After rebooting, run with: $LAUNCHER_PATH"
