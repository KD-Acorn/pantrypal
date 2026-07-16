# Changelog

All notable changes to My Pantry Club are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Fixed
- iOS Safari photo upload — gallery uploads failed silently due to
  hidden-input handling, capture attribute, and missing HEIC/HEIF
  support in the accept attribute (separate from the 3.0.1 fix below,
  which addressed Android/oversized-payload failures)

## [3.0.1] - 2026-07-16
### Fixed
- Photo scan reliability — photos are now compressed before upload,
  scan failures show a clear message instead of failing silently, and
  the upload size limit was raised as a safety margin

## [3.0.0] - 2026-07-14
### Added
- Drinks tab — AI-suggested smoothies, juices, milkshakes, and
  cocktails based on your pantry, backed by a growing drink catalog
- Installable app (PWA) — add My Pantry Club to your home screen with
  offline app-shell support

## [2.3.0] - 2026-07-02
### Added
- Affiliate shopping links on missing ingredients
- Shop List — one-tap shopping for your grocery list
### Changed
- Admin bug report inbox shows an unread count badge

## [2.2.0] - 2026-07-01
### Added
- Faster, richer recipe suggestions from an expanded recipe catalog
- My Creations — share your own recipes with the community, with
  comments
- Smarter barcode scanning backed by community-verified product data

## [2.1.0] - 2026-06-28
### Added
- Guided onboarding flow and in-app tour for new users
- Self-service account deletion with a 7-day grace period
- Privacy Policy and Terms of Service pages

## [2.0.0] - 2026-06-28
### Added
- Households — share your pantry, recipes, and meal plan with family
  members, with a shared activity feed

## [1.5.0] - 2026-06-27
### Changed
- Rebranded from PantryPal to My Pantry Club
- Recipe suggestions now blend multiple sources for better matches
### Added
- Admin panel for managing the app

## [1.4.0] - 2026-06-25
### Added
- Meal planner with calendar view and "use before it expires" mode
- Dietary preference filters
- Affiliate shopping links and ingredient substitution suggestions

## [1.3.0] - 2026-06-25
### Added
- Barcode scanner with expiry date tracking
- Grocery list with category grouping

## [1.2.0] - 2026-06-25
### Added
- Customize and share your own version of any recipe
- Community Feed of shared recipes

## [1.1.0] - 2026-06-24
### Added
- Account sign-in and cross-device sync via Firebase

## [1.0.0] - 2026-06-23
### Added
- Initial release — pantry scanning, pantry inventory, and AI recipe
  discovery
