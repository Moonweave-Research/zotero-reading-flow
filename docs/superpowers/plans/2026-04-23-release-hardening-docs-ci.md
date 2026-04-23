# Release Hardening Docs and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the documentation and CI needed to treat Zotero Reading Flow v1.1 as a stable release candidate.

**Architecture:** Keep runtime code unchanged unless verification exposes a defect. Add user-facing docs at the repository root and operational docs under `docs/`, then add a GitHub Actions workflow that runs the existing `npm run verify` release gate on pull requests and pushes.

**Tech Stack:** Markdown, GitHub Actions, Node.js 22, npm, existing `npm run verify` script.

---

### Task 1: User Documentation

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`

- [x] **Step 1: Document the current feature set**

Write `README.md` with the plugin purpose, compatibility, feature list, install steps, update behavior, debug steps, and known warnings. Keep the wording scoped to implemented behavior: Progress, Status, Last Read, item context menu, and Extra-field storage.

- [x] **Step 2: Document release history**

Write `CHANGELOG.md` with v1.1.0 changes and v1.0.0 as the initial private build baseline.

### Task 2: Release and Troubleshooting Documentation

**Files:**
- Create: `docs/RELEASE.md`
- Create: `docs/TROUBLESHOOTING.md`

- [x] **Step 1: Add the release checklist**

Document the exact release sequence: run `npm run verify`, inspect `updates.json`, merge PR, create GitHub release `v1.1.0`, upload `zotero-reading-flow.xpi` and `updates.json`, then verify the `latest/download` and versioned release URLs.

- [x] **Step 2: Add troubleshooting guidance**

Document how to diagnose install state, missing columns, non-updating progress, Zotero debug output, extension cache issues, and expected Zotero 9 warnings.

### Task 3: CI Verification

**Files:**
- Create: `.github/workflows/verify.yml`

- [x] **Step 1: Add GitHub Actions verify workflow**

Run on pull requests and pushes to `main` or `codex/**`, install with `npm ci`, and run `npm run verify`.

- [x] **Step 2: Validate locally**

Run `npm run verify` after adding docs and CI to confirm the release artifact and generated `updates.json` still pass the package validator.

### Task 4: Publish PR Update

**Files:**
- Modify: current Git branch `codex/release-reading-flow-v1-1`

- [x] **Step 1: Commit docs and CI**

Commit the documentation and CI workflow as `docs: add release docs and verify ci`.

- [x] **Step 2: Push to PR branch**

Push the branch so PR #1 includes the release-hardening changes.
