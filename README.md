<p align="center">
  <img src="branding/app.svg" width="200" height="200" alt="LGCEdit icon">
</p>

<h1 align="center">LGCEdit</h1>

<p align="center">
  <strong>LGCEdit</strong> (Local Git Commit Editor) is a cross-platform desktop app for editing and managing local Git commit messages.<br>
  Built with Tauri 2 and Angular 20.
</p>

<p align="center">
  <a href="https://github.com/gabrielgriffo/local-git-commit-editor">
    <img src="https://img.shields.io/badge/GitHub-gabrielgriffo%2Flocal--git--commit--editor-blue?logo=github" alt="GitHub">
  </a>
</p>

## Tech Stack

- **Frontend**: Angular 20 (TypeScript)
- **Backend**: Rust via Tauri 2
- **Git integration**: [`git2`](https://crates.io/crates/git2)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Getting Started

```bash
# Install dependencies
npm install

# Start the full dev environment (Angular + Tauri)
npm run tauri dev

# Start only the Angular frontend (http://localhost:1420)
npm run start
```

## Building

```bash
# Build only the Angular frontend
npm run build

# Build the production desktop app (generates installer)
npm run tauri build
```

The installer will be output to `src-tauri/target/release/bundle/`.

## Project Structure

```
├── src/                        # Angular frontend
│   └── app/
│       ├── app.component.ts    # Root component
│       ├── app.config.ts       # App bootstrap config
│       └── app.routes.ts       # Router config
└── src-tauri/                  # Rust/Tauri backend
    ├── src/
    │   ├── lib.rs              # Tauri command registration
    │   └── main.rs             # Entry point
    └── tauri.conf.json         # Window and bundle config
```

## License

MIT © [Gabriel Griffo](https://github.com/gabrielgriffo)
