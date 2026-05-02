<div align="center">
  <h1>TooBee PDF Studio</h1>
</div>

---

TooBee PDF Studio is a modern, high-performance desktop application built to handle all your PDF needs securely and locally. Crafted with **React**, **Vite**, and **Electron**, it features an elegant glassmorphism UI and a powerful precision markup engine.

## 🚀 Features

- **Blazing Fast Compression:** Shrink PDF file sizes instantly by removing metadata and optimizing streams.
- **Precision Markup Engine:** Overlay text, custom typography, and shapes with pixel-perfect accuracy.
- **128-bit RC4 Encryption:** Secure your sensitive documents and restrict who can view or edit them.
- **Complete Utility Suite:** Merge, Split, Rotate, Extract Pages/Text, Convert, and Unlock PDFs.

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

## 📦 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/TooBeeOfficial/TooBee-PDF-Studio.git
   cd TooBee-PDF-Studio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## 💻 Development

To start the application in development mode with Hot-Module Replacement (HMR):

```bash
npm run dev
```

This will spin up the Vite development server and launch the Electron application locally.

## 🏗️ Building for Production

To package the application for production and generate installers, run the following commands:

**Build for Windows (NSIS Installer):**
```bash
npm run build:win
```

**Build for macOS:**
```bash
npm run build:mac
```

**Build for Linux:**
```bash
npm run build:linux
```

**Build for current platform:**
```bash
npm run build
```

The compiled binaries and the setup installer (e.g., `TooBee PDF Studio Setup 1.0.0.exe`) will be generated inside the `dist/` directory.

## 🧪 Other Commands

- **Generate Icons:** Automatically converts `icon.png` to `icon.ico` required for Windows builds.
  ```bash
  npm run gen:icon
  ```
- **Lint Code:**
  ```bash
  npm run lint
  ```

---
