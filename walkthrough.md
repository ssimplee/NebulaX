# 17 Aug: Restructure the Web App into a Mobile Interface

A complete summary of updates to ensure the SGRail Singapore MRT Companion web application strictly follows the mobile-first scope and is optimized for real-world commuter conditions.

---

## 1. Executive Summary & Scope Alignment

- **Target Audience:** MRT Commuters (not an operator dashboard).
- **Target Platform:** Mobile-First Web Application opened in mobile phone browsers (No native build, no app store required).
- **Primary Design Target:** Designed specifically for real mobile phone conditions—small screen, single-thumb operation, moving train readability, bright sunlight contrast, dynamic browser address bars, soft virtual keyboard viewport shifts, and zero signal / underground offline access.

---

## 2. Interface Restructuring & Real Mobile Conditions

### Mobile Shell & One-Thumb Navigation
- **Bottom Navigation Bar ([BottomNav.tsx](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/src/components/common/BottomNav.tsx)):** On mobile viewports (< 768px), primary navigation controls (Map, Routes, Assistant, Community, Profile) remain within easy single-thumb reach at the bottom of the screen.
- **Responsive Drawer Panels ([ResponsivePanel.tsx](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/src/components/common/ResponsivePanel.tsx)):** Displays station details, journey routes, and incident reporting forms inside mobile bottom sheets (`vaul` drawer) for fluid single-thumb interactions.

### Address Bar & Dynamic Viewport Height
- **[index.html](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/index.html):** Configured viewport meta tag with `viewport-fit=cover` and dynamic viewport units (`100dvh` in `globals.css` and `App.tsx`) to ensure page layout does not jump or clip when browser address bars expand or collapse while scrolling.

### Soft Keyboard Viewport Adaptation
- **[index.html](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/index.html):** Added `interactive-widget=resizes-content` so when virtual keyboards open on iOS/Android devices (e.g., searching stations, filing incident reports, AI chat), active input fields and submit buttons stay visible in the resized viewport.

### Bright Sunlight & High-Contrast Mode
- **Theme Color & Contrast:** Set `<meta name="theme-color" content="#c0392b">` and maintained `.high-contrast` styling support in [globals.css](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/src/styles/globals.css) for outdoor sunlight legibility.

### Underground / Zero Signal Offline Capability
- **Web App Manifest ([manifest.json](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/public/manifest.json)):** Enables standalone mobile web app installation ("Add to Home Screen").
- **Offline Service Worker ([sw.js](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/public/sw.js) & [main.tsx](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/src/main.tsx)):** Caches core web assets and station dataset so commuters underground without mobile data signal can continue navigating the MRT system and looking up route details.

---

## 3. Expo Go Compatibility & Mobile Phone Testing Guide

### Technical Note: Web Application vs Expo Go
The competition scope specifies:
> *"Build a web app, designed mobile-first. No native build, no app store — a web application a commuter opens in their phone's browser."*

**Expo Go** is built specifically for native **React Native** applications. Standard HTML/DOM web applications (React DOM + Vite) run directly in mobile browsers (Safari, Chrome, Samsung Internet).

### How to Test and Emulate on Mobile Phones

1. **Start the Dev Server with Network Access:**
   ```bash
   cd frontend
   npm run dev
   ```
   With `server.host: true` configured in [vite.config.ts](file:///c:/Users/Na%20Ying/Desktop/NebulaX/nebulax-17aug/frontend/vite.config.ts), Vite will print a local Network URL:
   ```text
   VITE v6.3.5 ready

   ➜ Local: http://localhost:5173/
   ➜ Network: http://192.168.x.x:5173/
   ```

2. **Open in Mobile Browser:**
   - Connect your mobile phone to the same Wi-Fi network.
   - Open Chrome or Safari on your phone and navigate to `http://192.168.x.x:5173/`.
   - Optionally scan the Network URL QR code with your phone camera.

3. **Standalone Mobile App (PWA):**
   - On iOS Safari: Tap **Share** → **Add to Home Screen**.
   - On Android Chrome: Tap **Menu (⋮)** → **Add to Home Screen** / **Install App**.

---

## 4. Verification & Validation

- **Automated Tests (`npx vitest --run`):** 84 / 84 unit tests passed across 12 test files.
- **Production Build (`npm run build`):** Clean TypeScript compilation (`tsc -b`) and Vite production bundle generation (`vite build`).

