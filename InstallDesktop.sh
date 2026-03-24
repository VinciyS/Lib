#!/usr/bin/env bash
# =============================================================
# Uygulama menüsüne .desktop girişi ekler
# Kullanım: chmod +x install-desktop.sh && ./install-desktop.sh
# =============================================================
set -e

APP_NAME="oyun-kutuphanesi"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons"
BINARY="$(pwd)/dist/$APP_NAME"

# Binary var mı?
if [ ! -f "$BINARY" ]; then
    echo "❌ Binary bulunamadı: $BINARY"
    echo "   Önce build.sh çalıştır."
    exit 1
fi

echo "📂 Dizinler hazırlanıyor…"
mkdir -p "$INSTALL_DIR" "$DESKTOP_DIR" "$ICON_DIR"

# Binary'yi bin'e kopyala
echo "📦 Binary kopyalanıyor → $INSTALL_DIR/$APP_NAME"
cp "$BINARY" "$INSTALL_DIR/$APP_NAME"
chmod +x "$INSTALL_DIR/$APP_NAME"

# .desktop dosyası oluştur
DESKTOP_FILE="$DESKTOP_DIR/$APP_NAME.desktop"
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Oyun Kütüphanem
GenericName=Game Library
Comment=Steam, Epic, GOG ve Amazon oyunlarını tek ekranda yönet
Exec=$INSTALL_DIR/$APP_NAME
Icon=applications-games
Terminal=false
Categories=Game;
Keywords=steam;epic;gog;games;library;
StartupWMClass=oyun-kutuphanesi
EOF

chmod +x "$DESKTOP_FILE"

# .desktop veritabanını güncelle
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Kurulum tamamlandı!"
echo ""
echo "  Uygulama menüsünde 'Oyun Kütüphanem' arayabilirsin."
echo "  Ya da terminalde: oyun-kutuphanesi"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"