# Chinese Learning Studio

Static client-side web app for studying Chinese with:

- JSON-backed flashcard decks
- JSON-backed reading texts or song lyrics
- CC-CEDICT-backed dictionary lookup generated at build time
- Reader visibility modes for characters only, characters with pinyin, or full text with translation

## Build for GitHub Pages

This project is now set up so you edit source content and generate a static `dist/` folder.

```bash
npm run build
```

Then publish `dist/` to GitHub Pages.

The build uses the npm package `@tykok/cedict-dictionary` as the default
dictionary source and writes the final static files into `dist/`.
Because the full dictionary is large, the app loads it lazily on first dictionary search
instead of during the initial page load.

## Run locally

Because the app uses `fetch()` to load local JSON files, serve the folder over HTTP instead of opening `index.html` directly.

Examples:

```bash
npm run build
python3 -m http.server 4173 -d dist
```

Then open `http://localhost:4173`.

## Project structure

```text
.
├── app.js
├── CC-CEDICT-ATTRIBUTION.md
├── content
│   ├── dictionary
│   ├── flashcards
│   ├── lyrics
│   └── texts
├── data
│   ├── dictionary.json
│   ├── flashcards.json
│   └── texts.json
├── dist
├── index.html
├── README.md
├── scripts
│   └── build.mjs
└── styles.css
```

## Add flashcards

Author flashcards in `content/flashcards/*.json`. Each file can contain one or more decks.

Example:

```json
{
  "decks": [
    {
      "id": "deck-id",
      "name": "Deck name",
      "cards": [
        {
          "hanzi": "你好",
          "pinyin": "ni hao",
          "translation": "hello",
          "notes": "optional"
        }
      ]
    }
  ]
}
```

Run `npm run build` to generate `dist/data/flashcards.json`.

## Add lyrics

Author lyrics in `content/lyrics/*.json`. Use one file per lyric.

Example:

```json
{
  "texts": [
    {
      "id": "song-id",
      "title": "Song title",
      "description": "Optional description",
      "tags": ["lyrics"],
      "lines": [
        {
          "hanzi": "月亮代表我的心",
          "pinyin": "yue liang dai biao wo de xin",
          "translation": "The moon represents my heart"
        }
      ]
    }
  ]
}
```

Suggested workflow for lyrics:

1. Duplicate `content/lyrics/_template-song.json`.
2. Rename it to something like `04-jay-chou-qing-tian.json`.
3. Update the `id`, `title`, `tags`, and `lines`.
4. Run `npm run build`.

Files starting with `_` are ignored by the build, so you can safely keep templates around.

## Add reading texts

Author non-lyric reading texts in `content/texts/*.json`.

Example:

```json
{
  "texts": [
    {
      "id": "song-id",
      "title": "Song title",
      "description": "Optional description",
      "tags": ["lyrics"],
      "lines": [
        {
          "hanzi": "月亮代表我的心",
          "pinyin": "yue liang dai biao wo de xin",
          "translation": "The moon represents my heart"
        }
      ]
    }
  ]
}
```

Each item in `lines` is rendered as one row in the reading view, which works well for lyrics and sentence-based texts.
After editing or adding files, run `npm run build`.

## Add dictionary entries

The app reads dictionary data from:

1. `content/dictionary/dictionary.json` if that file exists, as a full override.
2. Otherwise the build starts from the npm package `@tykok/cedict-dictionary`.
3. Then it merges in `content/dictionary/custom-entries.json` if that file exists.
4. If the package is unavailable, it falls back to `data/dictionary.json`.

Expected format:

```json
{
  "entries": [
    {
      "traditional": "學習",
      "simplified": "学习",
      "pinyin": "xue xi",
      "pinyinNumbered": "xue2 xi2",
      "definitions": ["to learn", "to study"],
      "hsk": 1
    }
  ]
}
```

The dictionary search matches against simplified, traditional, pinyin, numbered pinyin, and English definitions.

The generated site also includes `CC-CEDICT-ATTRIBUTION.md` so the deployed `dist/`
output carries source attribution.

If the full generated dictionary is larger than you want for your site, create
`content/dictionary/dictionary.json` with a curated subset and it will replace the
package-generated dictionary completely.

## CC-CEDICT-style data

The build now uses `CC-CEDICT` automatically from npm. If you want to add or override
entries manually, use `content/dictionary/custom-entries.json` or a full
`content/dictionary/dictionary.json` override with entries shaped like:

```json
{
  "traditional": "中國",
  "simplified": "中国",
  "pinyin": "zhong guo",
  "pinyinNumbered": "Zhong1 guo2",
  "definitions": ["China"],
  "hsk": 1
}
```

`definitions` should stay as an array so one entry can hold multiple senses.

The browser app stays static. The npm package is only used during build time, so
`gh-pages` still serves plain files.
