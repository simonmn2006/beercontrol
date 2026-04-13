#!/bin/bash

# KegHero Dashboard - Raspberry Pi 4 Kiosk Mode Setup
# Designed for 720x1560 vertical display with hardware acceleration
# Optimized for Raspberry Pi OS Bookworm (KMS/DRM)

echo "🚀 Starting KegHero Dashboard Kiosk Setup..."

# 1. Update & Install Dependencies
sudo apt update
sudo apt install -y libgl1-mesa-dri libgles2-mesa-dev pkg-config

# 2. Permissions Fix
# Ensure the 'pi' user (or current user) has access to graphics hardware
sudo usermod -a -G render,video $USER

# 3. Create the Launcher Script
# We use /home/$USER/ to avoid issues when running this script with sudo
LAUNCHER_PATH="/home/$USER/start_dashboard.sh"

cat <<EOF > "$LAUNCHER_PATH"
#!/bin/bash

# Start Flutter Dashboard in fullscreen on KMS
# --vulkan: Use Vulkan backend for better shader performance on RPi 4
# --enable-impeller: Experimental rendering engine for smoother animations
# Note: Root/Sudo is often required for direct KMS access
sudo /usr/local/bin/flutter-pi \\
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
echo "3. Engine: If you haven't installed flutter-pi yet, run:"
echo "   sudo wget https://github.com/ardera/flutter-pi/releases/latest/download/flutter-pi -O /usr/local/bin/flutter-pi"
echo "   sudo chmod +x /usr/local/bin/flutter-pi"
echo ""
echo "👉 After rebooting, run with: $LAUNCHER_PATH"
