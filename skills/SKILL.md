---
name: chinese-lyrics-creator
description: >
  Creates a new Chinese lyric JSON file for the chinese-practice app from the content/lyrics/ directory.
  Use this skill whenever the user provides Chinese song lyrics and wants them added to the app,
  OR when the user gives a song name and/or artist and wants the lyrics looked up and added.
  Triggers on: "add this song", "create a lyrics file", "add lyrics for", "add [song name] by [artist]",
  pasting Chinese text and asking to add it, any request to add a new song to the app.
  Always use this skill — don't try to wing the file format without it.
---

## Goal

Create a properly structured lyric JSON file in `content/lyrics/` for the chinese-practice app.

## Two input modes

### Mode A — User provides the Chinese lyrics

The user pastes raw Chinese text (hanzi). Your job:
1. Split into lines (use the original line breaks, or split on punctuation like 。？！ if there are no line breaks — aim for natural sung phrases, not individual words)
2. Generate pinyin for every line (see format rules below)
3. Generate an English translation for every line
4. Infer title (Chinese), artist, and description from context or ask briefly

### Mode B — User provides song name / artist only

The user gives you something like "蒲公英的約定 by Jay Chou" or "Qianfuqin de hua zhao lei".
1. Use WebSearch to find the full Chinese lyrics (search for `{song name} {artist} 歌词` or `lyrics`)
2. Confirm with the user if you're uncertain you found the right song before proceeding
3. Then follow Mode A steps on the lyrics you found

If searching, prefer sources that have the original Chinese characters (not just pinyin or translation). Search in multiple queries if needed to find a complete set of lyrics.

## Pinyin rules

- Lowercase only, syllable-by-syllable, space-separated: `wo ai ni` not `wǒ àinǐ`
- No tone numbers or tone marks
- One line of pinyin per line of hanzi — they must correspond exactly
- Each syllable gets its own space, including particles: `de`, `le`, `ne`, `ba`, `ma`
- Compound words are still space-separated: `pu gong ying` not `pugongying`

## Translation rules

- Natural English — prioritise how a native speaker would phrase it, not word-for-word
- Preserve poetic feeling where possible without being obscure
- One translation per line of hanzi

## File structure

```json
{
  "texts": [
    {
      "id": "{artist-pinyin}-{song-pinyin}",
      "title": "{Chinese title characters}",
      "description": "{Artist Name} - {Romanized song title}",
      "tags": ["lyrics", "mandarin", "{artist name in lowercase}"],
      "lines": [
        {
          "hanzi": "第一行歌词",
          "pinyin": "di yi hang ge ci",
          "translation": "First lyric line"
        }
      ]
    }
  ]
}
```

**id format**: kebab-case, artist pinyin first, then song pinyin. Example: `jay-chou-pu-gong-ying-de-yue-ding`. Use the full pinyin of the song title (not a shortened version). If no artist is known, use just the song pinyin.

**tags**: always include `"lyrics"` and `"mandarin"`. Add the artist's name as a third tag (lowercase, e.g. `"jay chou"`, `"zhao lei"`).

## File naming and numbering

1. List the files in `content/lyrics/` to find the highest existing number
2. New file gets the next number, zero-padded to 2 digits
3. Filename: `{NN}-{song-pinyin-abbreviated}.json` — use a short readable version of the song title in pinyin (3-5 syllables is ideal, e.g. `pu-gong-ying-de-yue-ding` for 蒲公英的約定)

## Output

Write the completed JSON file directly to `content/lyrics/`. Then confirm to the user:
- The filename it was saved as
- How many lines were added
- A quick sanity check: show the first 2 lines as hanzi + pinyin so the user can spot-check the pinyin quality

Do not ask for confirmation before writing — just write the file and show the summary. If something is genuinely ambiguous (e.g. you found multiple songs that match), ask before writing.
