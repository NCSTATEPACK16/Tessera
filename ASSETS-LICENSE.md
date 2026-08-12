# Licence for the curated photographs

`LICENSE` (MIT) covers the source code in this repository. It does **not** cover the photographs
under `assets/curated/`. This file exists because that distinction is easy to miss and expensive to
get wrong — a contributor who assumes the code licence also covers the images is the specific risk
this document is here to remove.

## What licence the photos are under

Every photograph in `assets/curated/` is published under the
[**Unsplash License**](https://unsplash.com/license). Per-photo attribution and source links are
in `assets/curated/manifest.json`, and the same attribution is rendered on the Puzzle Card when a
player completes a puzzle cut from that photo.

`src/play/curated.ts`'s `validateManifest` fails the build if any entry is missing a licence name,
attribution string, or source URL — but it only checks the fields are *non-empty*, not that they
are accurate. If you add a photo, verify its licence and attribution yourself before opening a PR;
see `.github/ISSUE_TEMPLATE/photo-suggestion.md` for the process.

## What the Unsplash License actually permits

**It is not CC0, and it is not the MIT licence above.** In summary — the
[full text](https://unsplash.com/license) governs:

- **Permitted:** free use, including commercial use, without asking permission or crediting the
  photographer (though this project credits them anyway — see the manifest).
- **Not permitted:** selling unaltered copies of a photo (as a print, a poster, a stock-photo
  download, etc.), and compiling Unsplash photos to replicate a substantially similar service (a
  photo-hosting or stock-photo site).

A puzzle game that cuts a photo into pieces and reassembles it on screen is squarely inside what
the licence permits — it is neither of the two prohibited uses. But that headroom does not transfer
to every use a contributor might imagine (bundling the raw source images as a separate download,
for instance), so when in doubt, ask in an issue before building on top of an assumption.

## If you're adding a photo

1. Confirm it is actually published under the Unsplash License (not merely hosted on Unsplash —
   check the photo's own licence badge).
2. Add a manifest entry with `licence.name`, `licence.attribution`, and `licence.sourceUrl` filled
   in for real — not placeholder text. `npm run curated:manifest` regenerates
   `src/play/curated-manifest.ts` from `assets/curated/manifest.json` and fails loudly if a field is
   empty, but it cannot verify the licence claim itself.
3. A maintainer merges photo additions; see `.github/CODEOWNERS`. This is a deliberate gate, not
   friction for its own sake — a bad licence claim on a merged photo is a legal problem for
   everyone who ships a build containing it.
