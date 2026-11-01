# KURO NAMI — CodeRabbit Code Review Setup Guide

This guide explains how to connect the KURO NAMI GitHub repository to **CodeRabbit** for automated AI-powered pull-request reviews.

---

## 📌 Important Context

- **What CodeRabbit Is**: An automated AI code-review assistant layer for GitHub pull requests. It analyzes code changes, identifies TypeScript/React bugs, checks security practices, and validates API integrations.
- **What CodeRabbit Is Not**: CodeRabbit is **NOT** a video streaming server, anime metadata API, or database backend. It runs as an independent review layer on GitHub.

---

## 🚀 Step-by-Step Connection Instructions

### 1. Push Repository to GitHub
Ensure the KURO NAMI project is pushed to your GitHub repository (e.g. `https://github.com/YOUR_ORGANIZATION/kuro-nami`).

```bash
git remote add origin https://github.com/YOUR_ORGANIZATION/kuro-nami.git
git branch -M main
git push -u origin main
```

### 2. Authorize CodeRabbit GitHub App
1. Visit [https://coderabbit.ai](https://coderabbit.ai) or the GitHub Marketplace page for CodeRabbit.
2. Click **Sign in with GitHub**.
3. Select the GitHub organization or account where `kuro-nami` is hosted.
4. Grant repository access to `kuro-nami`.

### 3. Verify Repository Configuration
CodeRabbit will automatically detect the `.coderabbit.yaml` file in the root of the repository.

Configuration focus areas included in `.coderabbit.yaml`:
- **Canonical Anime ID Resolution**: Enforces strict separation between AniList IDs, MyAnimeList IDs, Kitsu IDs, and TMDB IDs.
- **Artwork Integrity**: Prevents posters and banners from being overwritten by unrelated third-party provider artwork.
- **Playback & Provider Security**: Validates iframe sandbox permissions, watchdog timeouts, and SUB/DUB language switching.
- **Admin Authorization & Secrets**: Audits Express server middleware (`requireAdmin`), password hashing, and ensures private keys are never exposed.

### 4. Create a Pull Request
1. Create a new branch:
   ```bash
   git checkout -b feature/streaming-enhancement
   ```
2. Make code edits and commit:
   ```bash
   git commit -m "feat: enhance streaming diagnostics"
   git push origin feature/streaming-enhancement
   ```
3. Open a Pull Request on GitHub targeting `main`.
4. CodeRabbit will post an inline review summary, code walkthrough, and suggestions directly on the PR!

---

## 🔍 Configured Focus Areas Summary

| Component | CodeRabbit Review Rule |
| :--- | :--- |
| `src/services/canonicalAnimeResolver.ts` | Verify strict ID isolation & artwork verification logic |
| `src/services/streamingProvidersRegistry.ts` | Validate provider URLs & sandbox attributes |
| `server.ts` | Check Express routes, `requireAdmin` checks, and key security |
| `src/components/VideoPlayer.tsx` | Ensure HLS lifecycle, watchdog timers & language switching safety |
