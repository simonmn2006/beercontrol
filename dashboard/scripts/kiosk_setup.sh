#!/bin/bash

# KegHero Dashboard - Raspberry Pi 4 Kiosk Mode Setup
# Designed for 720x1560 vertical display with hardware acceleration

echo "🚀 Starting KegHero Dashboard Kiosk Setup..."

# 1. Update & Install Dependencies
sudo apt update
sudo apt install -i xserver-xorg xinit x11-xserver-utils lightdm \
     libgl1-mesa-dri libgles2-mesa-dev pkg-config -y

# 2. Build/Install flutter-pi (Native Embedder for RPi)
# Note: This assumes you have the dashboard project on the Pi
# git clone https://github.com/ardera/flutter-pi.git
# cd flutter-pi && mkdir build && cd build
# cmake .. && make -j$(nproc) && sudo make install

# 3. Configure Display Rotation (Vertical 720x1560)
# Edit /boot/config.txt
# display_hdmi_rotate=1 # 90 degrees
# dtoverlay=vc4-kms-v3d # Ensure HW acceleration is on

# 4. Create Kiosk Script
cat <<EOF > ~/start_dashboard.sh
#!/bin/bash
# Disable screen sleep
xset s off
xset s noblank
xset -dpms

# Start Flutter Dashboard in fullscreen (using flutter-pi optimized for KMS)
# --vulkan: Use Vulkan backend for better shader performance on RPi 4
# --enable-impeller: Experimental rendering engine for smoother animations
/usr/local/bin/flutter-pi \
    --release \
    --vulkan \
    --enable-impeller \
    /home/pi/dashboard/asset_bundle
EOF

chmod +x ~/start_dashboard.sh

# 5. Enable Auto-Login & Auto-Start
# Note: Use raspi-config to enable Console Auto-login
# Add start_dashboard.sh to .bash_profile or create a systemd service

echo "✅ Kiosk script created at ~/start_dashboard.sh"
echo "🚀 Performance Tips for Bookworm + KMS:"
echo "1. GPU Memory: In /boot/firmware/config.txt, set 'gpu_mem=256' or higher for shader heavy apps."
echo "2. Monitor Load: Use 'vcgencmd measure_temp' and 'top' to check for thermal throttling."
echo "3. Impeller: If you notice glitches, remove '--enable-impeller' to fallback to Vulkan Skia."
echo "👉 Run with '~/start_dashboard.sh' from the console."
