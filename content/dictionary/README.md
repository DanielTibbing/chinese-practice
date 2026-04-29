By default the build uses the npm package `@tykok/cedict-dictionary` as the base
dictionary source.

You can customize dictionary data in two ways:

1. Add `content/dictionary/custom-entries.json` to append or override a few entries.
2. Add `content/dictionary/dictionary.json` to replace the generated dictionary completely.

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
