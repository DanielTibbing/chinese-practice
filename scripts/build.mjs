import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const contentDir = path.join(rootDir, "content");
const dataDir = path.join(rootDir, "data");
const cedictPackageDataPath = path.join(
  rootDir,
  "node_modules",
  "@tykok",
  "cedict-dictionary",
  "data",
  "cedict.json",
);
const englishStopwords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "sb",
  "sth",
  "the",
  "to",
  "used",
  "variant",
]);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function readJsonFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        !entry.name.startsWith("_"),
    )
    .map((entry) => path.join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(files.map(readJson));
}

function normalizeDeckFiles(files) {
  return {
    decks: files.flatMap((file) => file.decks ?? []),
  };
}

function normalizeTextFiles(files) {
  return {
    texts: files.flatMap((file) => file.texts ?? []),
  };
}

function normalizePinyinNumbered(pinyin) {
  return String(pinyin ?? "").replace(/\s+/g, " ").trim();
}

function normalizePinyinDisplay(pinyin) {
  return normalizePinyinNumbered(pinyin)
    .replace(/[1-5]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCedictEntry(entry) {
  return {
    traditional: entry.traditional,
    simplified: entry.simplified,
    pinyin: normalizePinyinDisplay(entry.pinyin),
    pinyinNumbered: normalizePinyinNumbered(entry.pinyin),
    definitions: Array.isArray(entry.english)
      ? entry.english
      : entry.definitions ?? [],
  };
}

function normalizeLatinBucketValue(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[1-5]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getLatinBucketPrefixes(value) {
  const normalized = normalizeLatinBucketValue(value);
  if (normalized.length < 2) {
    return [];
  }
  return [normalized.slice(0, 2)];
}

function getHanziBucketPrefixes(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return [];
  }
  const firstCharacter = Array.from(normalized)[0];
  const firstCodePoint = firstCharacter.codePointAt(0).toString(16).padStart(4, "0");
  return [`u${firstCodePoint.slice(0, 2)}`];
}

function getEnglishTokens(definitions) {
  return (String(definitions ?? "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length >= 3 && !englishStopwords.has(token));
}

function bucketKeyToFilename(bucketKey) {
  return Array.from(bucketKey, (character) =>
    character.codePointAt(0).toString(16).padStart(4, "0"),
  ).join("-");
}

function mergeDictionaryEntries(entries) {
  const uniqueEntries = new Map();

  for (const entry of entries) {
    const normalizedEntry = {
      ...entry,
      pinyin: normalizePinyinDisplay(entry.pinyin ?? entry.pinyinNumbered),
      pinyinNumbered: normalizePinyinNumbered(
        entry.pinyinNumbered ?? entry.pinyin,
      ),
      definitions: entry.definitions ?? [],
    };

    const entryKey = [
      normalizedEntry.traditional,
      normalizedEntry.simplified,
      normalizedEntry.pinyinNumbered,
    ].join("::");

    uniqueEntries.set(entryKey, normalizedEntry);
  }

  return [...uniqueEntries.values()];
}

async function loadDictionaryEntries() {
  const fullOverridePath = path.join(contentDir, "dictionary", "dictionary.json");
  const customEntriesPath = path.join(
    contentDir,
    "dictionary",
    "custom-entries.json",
  );

  const fullOverride = await readJsonIfExists(fullOverridePath);
  if (fullOverride) {
    return { entries: mergeDictionaryEntries(fullOverride.entries ?? []) };
  }

  const packageData = await readJsonIfExists(cedictPackageDataPath);
  const fallbackData = await readJson(path.join(dataDir, "dictionary.json"));
  const customEntries = (await readJsonIfExists(customEntriesPath))?.entries ?? [];

  const baseEntries = packageData
    ? packageData.map(normalizeCedictEntry)
    : fallbackData.entries ?? [];

  return {
    entries: mergeDictionaryEntries([...baseEntries, ...customEntries]),
  };
}

async function buildData() {
  const [deckFiles, textFiles, lyricFiles, dictionaryData] = await Promise.all([
    readJsonFiles(path.join(contentDir, "flashcards")),
    readJsonFiles(path.join(contentDir, "texts")),
    readJsonFiles(path.join(contentDir, "lyrics")),
    loadDictionaryEntries(),
  ]);

  const builtDataDir = path.join(distDir, "data");
  await mkdir(builtDataDir, { recursive: true });

  const dictionaryEntries = dictionaryData.entries.map((entry, id) => ({ id, ...entry }));
  const dictionaryChunkSize = 750;
  const dictionaryChunkDir = path.join(builtDataDir, "dictionary", "entries");
  const dictionaryBucketDir = path.join(builtDataDir, "dictionary", "buckets");
  const bucketMap = new Map();

  await mkdir(dictionaryChunkDir, { recursive: true });
  await mkdir(dictionaryBucketDir, { recursive: true });

  for (const entry of dictionaryEntries) {
    const bucketKeys = new Set();
    const definitionTokens = getEnglishTokens((entry.definitions ?? []).join(" "));

    for (const prefix of getHanziBucketPrefixes(entry.simplified)) {
      bucketKeys.add(`hanzi:${prefix}`);
    }

    for (const prefix of getHanziBucketPrefixes(entry.traditional)) {
      bucketKeys.add(`hanzi:${prefix}`);
    }

    for (const prefix of getLatinBucketPrefixes(entry.pinyin)) {
      bucketKeys.add(`latin:${prefix}`);
    }

    for (const prefix of getLatinBucketPrefixes(entry.pinyinNumbered)) {
      bucketKeys.add(`latin:${prefix}`);
    }

    for (const token of definitionTokens) {
      for (const prefix of getLatinBucketPrefixes(token)) {
        bucketKeys.add(`latin:${prefix}`);
      }
    }

    for (const bucketKey of bucketKeys) {
      const existingBucket = bucketMap.get(bucketKey) ?? [];
      existingBucket.push(entry.id);
      bucketMap.set(bucketKey, existingBucket);
    }
  }

  const dictionaryChunkCount = Math.ceil(
    dictionaryEntries.length / dictionaryChunkSize,
  );

  await Promise.all([
    writeFile(
      path.join(builtDataDir, "flashcards.json"),
      `${JSON.stringify(normalizeDeckFiles(deckFiles), null, 2)}\n`,
    ),
    writeFile(
      path.join(builtDataDir, "texts.json"),
      `${JSON.stringify(normalizeTextFiles([...textFiles, ...lyricFiles]), null, 2)}\n`,
    ),
    writeFile(
      path.join(builtDataDir, "dictionary", "manifest.json"),
      `${JSON.stringify({
        totalEntries: dictionaryEntries.length,
        chunkSize: dictionaryChunkSize,
        chunkCount: dictionaryChunkCount,
      })}\n`,
    ),
  ]);

  for (let chunkIndex = 0; chunkIndex < dictionaryChunkCount; chunkIndex += 1) {
    const start = chunkIndex * dictionaryChunkSize;
    const end = start + dictionaryChunkSize;
    await writeFile(
      path.join(dictionaryChunkDir, `${chunkIndex}.json`),
      `${JSON.stringify(dictionaryEntries.slice(start, end))}\n`,
    );
  }

  for (const [bucketKey, ids] of bucketMap.entries()) {
    await writeFile(
      path.join(dictionaryBucketDir, `${bucketKeyToFilename(bucketKey)}.json`),
      `${JSON.stringify(ids)}\n`,
    );
  }
}

async function buildStaticFiles() {
  await Promise.all([
    cp(path.join(rootDir, "index.html"), path.join(distDir, "index.html")),
    cp(path.join(rootDir, "styles.css"), path.join(distDir, "styles.css")),
    cp(path.join(rootDir, "app.js"), path.join(distDir, "app.js")),
    cp(
      path.join(rootDir, "CC-CEDICT-ATTRIBUTION.md"),
      path.join(distDir, "CC-CEDICT-ATTRIBUTION.md"),
    ),
  ]);
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await buildStaticFiles();
  await buildData();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
