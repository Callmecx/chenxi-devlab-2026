# V2 baseline — 2026-10-12

Repository: https://github.com/Callmecx/chenxi-devlab-2026

Baseline commit: `b62db8d0beb9d55c59649767a7281b500a07020d` (main). Development branch: `feat/chenxi-v2`. The original checkout was clean when inspected; development uses a separate working tree. Repository identity was verified from the Git root, remote, branch, status and history, not its directory name.

## Existing capabilities

- Vue 3 / TypeScript / Vite portfolio, hash routing, seven case records, contact, theme and responsive layout.
- Separate uni-app ShopPilot H5 and WeChat compiler target. SKU/cart/coupon/local order flows execute in the browser.
- Separate PulseCampaign H5. Selection, conflicting sessions, mock booking and cancellation execute in the browser.
- GitHub Pages assembles the three applications. The root and commerce application have separate lockfiles.
- Existing evidence records 35 unit tests and 17 browser tests at the baseline revision. These are historical results until V2 checks are actually run.

## Gaps confirmed from source

1. No Intelligence Lab runtime, path planner, world model, execution trace or deterministic replay.
2. Shop and Pulse persist authoritative business state locally; no trusted server quote, SQLite transaction, isolated server session or server recovery flow.
3. No Market Replay Lab or engineering experiments.
4. Case data loses some audited historical status/date information; one image description incorrectly generalizes all images as browser screenshots.
5. Main site lacks a writing route and the requested visitor/engineering/evidence navigation.
6. WeChat compiler output is not device validation or store release. Android signing, device access and model/backend hosting are not assumed available.

## Access contracts

- Main: https://callmecx.github.io/chenxi-devlab-2026/#/
- Commerce: https://callmecx.github.io/chenxi-devlab-2026/shop/#/
- Campaign: https://callmecx.github.io/chenxi-devlab-2026/pulse/#/

Existing hashes remain supported. The old portfolio repository remains private and unpublished. It is not a development or deployment target.

## V2 implementation boundary

Preserve the current framework. Implement a browser-local deterministic Intelligence Lab and recorded replay for static hosting, with explicit mode labels. Build a persistent local demo API for commerce and booking; public Pages cannot host that process, so a public server mode may only be enabled after a real approved backend deployment. Static offline samples remain clearly identified. No paid model or hosting purchase is included.
