<div align="center">
  <p>
    <img src="branding/app.svg" width="120" height="120" alt="LGCEdit" />
  </p>

  <h1>LGCEdit</h1>

  <p>
    LGCEdit (Local Git Commit Editor) is a cross-platform desktop app for reviewing and rewriting messages and dates of commits in local Git repositories.<br>
    Built with Tauri 2 and Angular 20.<br>
    <sub>Everything runs on your machine: it never pushes, fetches or contacts any remote. See <a href="#safety-and-local-data">Safety and Local Data</a>.</sub>
  </p>

  <p>
    <a href="https://github.com/gabrielgriffo/local-git-commit-editor/actions/workflows/release.yml">
      <img
        src="https://img.shields.io/github/actions/workflow/status/gabrielgriffo/local-git-commit-editor/release.yml?label=CI&style=flat-square"
        alt="CI" /></a>
    <a href="https://github.com/gabrielgriffo/local-git-commit-editor/releases/latest">
      <img
        src="https://img.shields.io/github/v/release/gabrielgriffo/local-git-commit-editor?label=release&style=flat-square&color=2563eb"
        alt="Release" /></a>
    <a href="LICENSE">
      <img
        src="https://img.shields.io/github/license/gabrielgriffo/local-git-commit-editor?label=license&style=flat-square&color=6b7280"
        alt="License" /></a>
  </p>
  <p>
    <a href="https://github.com/gabrielgriffo/local-git-commit-editor/releases">
      <img src="https://img.shields.io/badge/Download-Windows_·_Linux-16a34a?style=for-the-badge&logo=github&logoColor=white" alt="Download LGCEdit" /></a>
  </p>
</div>

## Features

- **Commit browser:** paginated history of the current branch, with search and a clear separation between pushed and unpushed commits
- **Message editing:** rewrite the title and body of a commit that has not been pushed yet
- **Date editing:** set an absolute author date for a single commit, or shift the dates of several commits at once
- **Batch operations:** select multiple commits and apply the same date shift to all of them, with a preview of the result before applying
- **Backups:** snapshot of the branch tip before a rewrite, with one-click restore

## Tech Stack

- **Interface:** Angular 20 and TypeScript
- **Desktop app:** Rust and Tauri 2
- **Git integration:** [`git2`](https://crates.io/crates/git2), the Rust binding for libgit2
- **Date handling:** [`chrono`](https://crates.io/crates/chrono) on the backend and [`date-fns`](https://date-fns.org/) on the frontend
- **Window position and size:** [`tauri-plugin-window-state`](https://crates.io/crates/tauri-plugin-window-state)

## Running Locally

Prerequisites:

- [Node.js](https://nodejs.org/) 20 or newer
- [Rust](https://www.rust-lang.org/tools/install) with the `stable` toolchain
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system
- On Linux: `pkg-config` and `libssl-dev`, required to build `git2`

```bash
# Install the dependencies
npm install

# Start the development environment (Angular + Tauri)
npm run tauri dev

# Start only the Angular frontend (http://localhost:1420)
npm run start

# Generate the production build
npm run tauri build
```

The distribution files are generated in `src-tauri/target/release/bundle/`.

## Project Structure

```
├── src/                              # Angular application
│   └── app/
│       ├── core/
│       │   ├── models/               # Commit, repository and edit operation types
│       │   ├── pipes/                # Date, relative time and short hash formatting
│       │   └── services/             # Git, backup, settings and edit state services
│       ├── layout/
│       │   ├── repo-layout/          # Shell for the repository screens
│       │   └── sidebar/              # Navigation and repository indicators
│       ├── pages/
│       │   ├── welcome/              # Repository selection and recent repositories
│       │   ├── commits/              # Commit list with search and filters
│       │   ├── commit-detail/        # Message and date editing of a single commit
│       │   ├── date-editor/          # Absolute date editing across commits
│       │   ├── batch/                # Date shift applied to a selection of commits
│       │   ├── backups/              # Backup listing, restore and removal
│       │   └── settings/             # Application preferences
│       ├── shared/                   # Icon component and confirmation dialog
│       ├── app.config.ts             # Application configuration
│       └── app.routes.ts             # Route configuration
│
└── src-tauri/                        # Rust/Tauri application
    ├── src/
    │   ├── git_ops.rs                # Reading and rewriting of commits via libgit2
    │   ├── backup.rs                 # Creation, listing and restore of backups
    │   ├── lib.rs                    # Tauri command registration
    │   └── main.rs                   # Entry point
    │
    └── tauri.conf.json               # Configuration and packaging
```

## Safety and Local Data

LGCEdit is a locally executed application. It has no servers of its own, no intermediate backends, no telemetry and no data collection mechanisms.

* The app **never pushes, fetches or contacts any remote**. Every operation happens against the repository already on your disk.
* Only **unpushed commits** can be edited. Commits that already exist on a remote are read-only in the interface.
* Before a rewrite, a backup records the branch and its tip commit in `.git/lge-backups/`. Restoring a backup points the branch back to that commit.
* Preferences (commit limit, edit confirmation and automatic backup) are stored in the webview `localStorage` and never leave your machine.

## History Rewriting

Editing the message or the date of a commit rewrites history: the edited commit and every commit after it receive new SHAs.

> [!WARNING]
> Rewriting commits that have already been shared requires a force push and affects everyone working on the branch. Use LGCEdit on commits that have not been pushed yet, and keep the automatic backup enabled.


## Credits

This project uses icons from the [Solar Icons](https://icon-sets.iconify.design/solar/) set. The corresponding credits and licensing information are in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## License

Distributed under the MIT license.

MIT © [Gabriel Griffo](https://github.com/gabrielgriffo)
