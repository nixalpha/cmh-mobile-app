#!/bin/sh
# Rebuild the production artwork and downloadable press kit from the master.
set -eu
cd "$(dirname "$0")/../.."
node scripts/branding/prepare-logo.cjs
swift scripts/branding/generate-icons.swift
cp assets/brand/glyph-white.svg assets/expo.icon/Assets/travi-glyph.svg
cp assets/images/icon.png public/press-kit/icons/travi-app-icon-1024.png
sips -z 180 180 assets/images/icon.png --out public/press-kit/icons/apple-touch-icon.png > /dev/null
cp assets/images/android-icon-foreground.png public/press-kit/icons/travi-android-foreground.png
cp assets/images/android-icon-monochrome.png public/press-kit/icons/travi-android-monochrome.png
cp assets/images/android-icon-background.png public/press-kit/icons/travi-android-background.png
cp assets/brand/tokens.json public/press-kit/brand-tokens.json
mkdir -p public/press-kit/fonts
cp node_modules/@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf public/press-kit/fonts/Nunito-Regular.ttf
cp node_modules/@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf public/press-kit/fonts/Nunito-Medium.ttf
cp node_modules/@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf public/press-kit/fonts/Nunito-SemiBold.ttf
cp node_modules/@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf public/press-kit/fonts/Nunito-Bold.ttf
cp node_modules/@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf public/press-kit/fonts/Nunito-ExtraBold.ttf
cp node_modules/@expo-google-fonts/nunito/LICENSE_FONT public/press-kit/fonts/OFL.txt
node scripts/branding/build-press-kit.cjs
