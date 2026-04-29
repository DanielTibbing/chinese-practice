const state = {
  decks: [],
  texts: [],
  dictionaryManifest: null,
  currentRoute: "flashcards",
  selectedDeckIndex: 0,
  selectedCardIndex: 0,
  cardFlipped: false,
  selectedTextIndex: 0,
  readerMode: "hanzi",
  dictionaryQuery: "",
  dictionaryResults: [],
  dictionaryStatus: "idle",
};

let dictionaryManifestPromise = null;
const dictionaryBucketCache = new Map();
const dictionaryChunkCache = new Map();
const dictionaryHoverCache = new Map();
let dictionarySearchRequestId = 0;
let glossaryHoverRequestId = 0;

const elements = {
  deckSelect: document.querySelector("#deck-select"),
  flashcard: document.querySelector("#flashcard"),
  flashcardFront: document.querySelector(".flashcard-front"),
  flashcardBack: document.querySelector(".flashcard-back"),
  flashcardMeta: document.querySelector("#flashcard-meta"),
  prevCard: document.querySelector("#prev-card"),
  nextCard: document.querySelector("#next-card"),
  flipCard: document.querySelector("#flip-card"),
  lookupCard: document.querySelector("#lookup-card"),
  shuffleCards: document.querySelector("#shuffle-cards"),
  textSelect: document.querySelector("#text-select"),
  textTitle: document.querySelector("#text-title"),
  textDescription: document.querySelector("#text-description"),
  textTags: document.querySelector("#text-tags"),
  textContent: document.querySelector("#text-content"),
  modeButtons: document.querySelectorAll(".toggle-button"),
  dictionarySearch: document.querySelector("#dictionary-search"),
  dictionaryMeta: document.querySelector("#dictionary-meta"),
  dictionaryResults: document.querySelector("#dictionary-results"),
  routeLinks: document.querySelectorAll("[data-route-link]"),
  routePanels: document.querySelectorAll("[data-route-panel]"),
  builderId: document.querySelector("#builder-id"),
  builderTitle: document.querySelector("#builder-title"),
  builderDescription: document.querySelector("#builder-description"),
  builderTags: document.querySelector("#builder-tags"),
  builderLines: document.querySelector("#builder-lines"),
  builderPreview: document.querySelector("#builder-preview"),
  builderStatus: document.querySelector("#builder-status"),
  builderDownload: document.querySelector("#builder-download"),
  builderFillSample: document.querySelector("#builder-fill-sample"),
  hoverGlossary: document.querySelector("#hover-glossary"),
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

async function loadJsonIfExists(path) {
  const response = await fetch(path);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function setStatusMessage(message) {
  elements.flashcardFront.textContent = message;
  elements.flashcardBack.textContent = "";
  elements.flashcardMeta.textContent = "";
}

function getSelectedDeck() {
  return state.decks[state.selectedDeckIndex] ?? null;
}

function getSelectedCard() {
  const deck = getSelectedDeck();
  return deck?.cards[state.selectedCardIndex] ?? null;
}

function getSelectedText() {
  return state.texts[state.selectedTextIndex] ?? null;
}

function normalizeSearchValue(value) {
  return value.toLowerCase().replaceAll(/\s+/g, " ").trim();
}

function getRouteFromHash() {
  const route = window.location.hash.replace(/^#\//, "").trim();
  const validRoutes = new Set([
    "flashcards",
    "reading",
    "dictionary",
    "builder",
    "library",
  ]);
  return validRoutes.has(route) ? route : "flashcards";
}

function renderRoute() {
  state.currentRoute = getRouteFromHash();

  elements.routePanels.forEach((panel) => {
    panel.hidden = panel.dataset.routePanel !== state.currentRoute;
  });

  elements.routeLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#/${state.currentRoute}`;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function renderDeckOptions() {
  elements.deckSelect.innerHTML = state.decks
    .map(
      (deck, index) =>
        `<option value="${index}">${deck.name} (${deck.cards.length})</option>`,
    )
    .join("");
  elements.deckSelect.value = String(state.selectedDeckIndex);
}

function renderTextOptions() {
  elements.textSelect.innerHTML = state.texts
    .map((text, index) => `<option value="${index}">${text.title}</option>`)
    .join("");
  elements.textSelect.value = String(state.selectedTextIndex);
}

function renderFlashcard() {
  const deck = getSelectedDeck();
  const card = getSelectedCard();

  if (!deck || !card) {
    setStatusMessage("No flashcards available.");
    return;
  }

  const showingFront = !state.cardFlipped;

  elements.flashcardFront.textContent = showingFront ? card.hanzi : "";
  elements.flashcardBack.innerHTML = showingFront
    ? ""
    : `
      <span class="pinyin">${card.pinyin}</span>
      <span>${card.translation}</span>
      ${card.notes ? `<span class="notes">${card.notes}</span>` : ""}
    `;

  elements.flashcardMeta.textContent = `${deck.name} • Card ${state.selectedCardIndex + 1} of ${deck.cards.length}`;
}

function renderText() {
  const text = getSelectedText();
  if (!text) {
    elements.textTitle.textContent = "No texts available.";
    elements.textDescription.textContent = "";
    elements.textTags.textContent = "";
    elements.textContent.innerHTML = "";
    return;
  }

  elements.textTitle.textContent = text.title;
  elements.textDescription.textContent = text.description ?? "";
  elements.textTags.textContent = (text.tags ?? []).join(" • ");

  elements.textContent.innerHTML = text.lines
    .map((line) => {
      const hanziMarkup = Array.from(line.hanzi)
        .map((character) => {
          if (/\p{Script=Han}/u.test(character)) {
            return `
              <button
                class="hanzi-token-button"
                type="button"
                data-query="${character}"
                aria-label="Look up ${character}"
              >
                ${character}
              </button>
            `;
          }

          return `<span class="hanzi-token-separator">${character}</span>`;
        })
        .join("");
      const pinyin = state.readerMode === "hanzi" ? "" : `<div class="line-pinyin">${line.pinyin}</div>`;
      const translation =
        state.readerMode === "translation"
          ? `<div class="line-translation">${line.translation}</div>`
          : "";

      return `
        <section class="line-card">
          <div class="line-hanzi">${hanziMarkup}</div>
          ${pinyin}
          ${translation}
        </section>
      `;
    })
    .join("");
}

function renderReaderMode() {
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.readerMode);
  });
  renderText();
}

function isHanziQuery(query) {
  return /\p{Script=Han}/u.test(query);
}

function normalizeLatinSearchValue(value) {
  return normalizeSearchValue(value).replace(/[1-5]/g, "").replaceAll(" ", "");
}

function bucketKeyToFilename(bucketKey) {
  return Array.from(bucketKey, (character) =>
    character.codePointAt(0).toString(16).padStart(4, "0"),
  ).join("-");
}

function getDictionaryBucketKey(query) {
  if (isHanziQuery(query)) {
    const normalized = query.trim();
    if (!normalized) {
      return null;
    }
    const firstCharacter = Array.from(normalized)[0];
    const firstCodePoint = firstCharacter.codePointAt(0).toString(16).padStart(4, "0");
    return `hanzi:u${firstCodePoint.slice(0, 2)}`;
  }

  const normalized = normalizeLatinSearchValue(query);
  if (!normalized) {
    return null;
  }

  if (normalized.length < 2) {
    return "latin:";
  }

  return `latin:${normalized.slice(0, 2)}`;
}

function matchesDictionaryEntry(entry, query) {
  const normalizedQuery = normalizeSearchValue(query);
  const normalizedLatinQuery = normalizeLatinSearchValue(query);
  const definitions = (entry.definitions ?? []).join(" ");

  if (isHanziQuery(query)) {
    return [entry.simplified, entry.traditional]
      .filter(Boolean)
      .some((value) => value.includes(query.trim()) || query.trim().includes(value));
  }

  return [
    normalizeLatinSearchValue(entry.pinyin),
    normalizeLatinSearchValue(entry.pinyinNumbered),
    normalizeSearchValue(definitions),
  ].some((value) => value.includes(normalizedLatinQuery) || value.includes(normalizedQuery));
}

async function ensureDictionaryManifestLoaded() {
  if (state.dictionaryManifest) {
    return;
  }

  if (!dictionaryManifestPromise) {
    dictionaryManifestPromise = loadJson("./data/dictionary/manifest.json")
      .then((manifest) => {
        state.dictionaryManifest = manifest;
      })
      .finally(() => {
        dictionaryManifestPromise = null;
      });
  }

  await dictionaryManifestPromise;
}

async function loadDictionaryBucket(bucketKey) {
  if (dictionaryBucketCache.has(bucketKey)) {
    return dictionaryBucketCache.get(bucketKey);
  }

  const bucketPromise = loadJsonIfExists(
    `./data/dictionary/buckets/${bucketKeyToFilename(bucketKey)}.json`,
  ).then((ids) => ids ?? []);

  dictionaryBucketCache.set(bucketKey, bucketPromise);
  return bucketPromise;
}

async function loadDictionaryChunk(chunkIndex) {
  if (dictionaryChunkCache.has(chunkIndex)) {
    return dictionaryChunkCache.get(chunkIndex);
  }

  const chunkPromise = loadJson(`./data/dictionary/entries/${chunkIndex}.json`);
  dictionaryChunkCache.set(chunkIndex, chunkPromise);
  return chunkPromise;
}

async function searchDictionary(query) {
  await ensureDictionaryManifestLoaded();

  const bucketKey = getDictionaryBucketKey(query);
  if (!bucketKey || bucketKey === "latin:") {
    return [];
  }

  const candidateIds = await loadDictionaryBucket(bucketKey);
  if (!candidateIds.length) {
    return [];
  }

  const chunkIndexes = [
    ...new Set(
      candidateIds.map((id) => Math.floor(id / state.dictionaryManifest.chunkSize)),
    ),
  ];
  const chunkEntries = await Promise.all(
    chunkIndexes.map((chunkIndex) => loadDictionaryChunk(chunkIndex)),
  );
  const entryMap = new Map(chunkEntries.flat().map((entry) => [entry.id, entry]));

  return candidateIds
    .map((id) => entryMap.get(id))
    .filter(Boolean)
    .filter((entry) => matchesDictionaryEntry(entry, query))
    .slice(0, 80);
}

function getBestHoverEntry(entries, query) {
  return (
    entries.find(
      (entry) => entry.simplified === query || entry.traditional === query,
    ) ?? entries[0] ?? null
  );
}

function setGlossaryPosition(event) {
  elements.hoverGlossary.style.left = `${event.clientX + 16}px`;
  elements.hoverGlossary.style.top = `${event.clientY + 18}px`;
}

function showGlossary(event, content) {
  elements.hoverGlossary.textContent = content;
  elements.hoverGlossary.hidden = false;
  setGlossaryPosition(event);
}

function hideGlossary() {
  elements.hoverGlossary.hidden = true;
}

function formatHoverEntry(entry) {
  const definitions = (entry.definitions ?? []).slice(0, 3).join("; ");
  const headword =
    entry.traditional && entry.traditional !== entry.simplified
      ? `${entry.simplified} / ${entry.traditional}`
      : entry.simplified;
  return `${headword} • ${entry.pinyin} • ${definitions}`;
}

async function showHoverDefinition(button, event) {
  const query = button.dataset.query?.trim();
  if (!query) {
    return;
  }

  const cachedDefinition = dictionaryHoverCache.get(query);
  if (cachedDefinition) {
    showGlossary(event, cachedDefinition);
    return;
  }

  const requestId = ++glossaryHoverRequestId;
  showGlossary(event, `${query} • loading...`);

  try {
    const entries = await searchDictionary(query);
    if (requestId !== glossaryHoverRequestId) {
      return;
    }

    const bestEntry = getBestHoverEntry(entries, query);
    const content = bestEntry
      ? formatHoverEntry(bestEntry)
      : `${query} • no dictionary entry found`;
    dictionaryHoverCache.set(query, content);
    showGlossary(event, content);
  } catch (error) {
    if (requestId !== glossaryHoverRequestId) {
      return;
    }
    console.error(error);
    showGlossary(event, `${query} • definition unavailable`);
  }
}

async function runDictionarySearch(query) {
  state.dictionaryQuery = query;
  elements.dictionarySearch.value = query;
  state.dictionaryStatus = "loading";
  renderDictionary();

  try {
    const requestId = ++dictionarySearchRequestId;
    const nextResults = await searchDictionary(query);
    if (requestId !== dictionarySearchRequestId) {
      return;
    }
    state.dictionaryResults = nextResults;
    state.dictionaryStatus = "ready";
  } catch (error) {
    console.error(error);
    state.dictionaryResults = [];
    state.dictionaryStatus = "error";
  }

  renderDictionary();
  if (state.currentRoute !== "dictionary") {
    window.location.hash = "#/dictionary";
  }
}

function parseBuilderLines(rawLines) {
  return rawLines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const segments = line.includes("|")
        ? line.split("|").map((segment) => segment.trim())
        : line.split("\t").map((segment) => segment.trim());

      return {
        hanzi: segments[0] ?? "",
        pinyin: segments[1] ?? "",
        translation: segments[2] ?? "",
      };
    })
    .filter((line) => line.hanzi);
}

function buildLyricEntryPayload() {
  const title = elements.builderTitle.value.trim();
  const generatedId = slugify(title);
  const entryId = elements.builderId.value.trim() || generatedId || "new-text";
  const tags = elements.builderTags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const lines = parseBuilderLines(elements.builderLines.value);

  return {
    texts: [
      {
        id: entryId,
        title,
        description: elements.builderDescription.value.trim(),
        tags,
        lines,
      },
    ],
  };
}

function renderBuilderPreview() {
  const payload = buildLyricEntryPayload();
  elements.builderPreview.textContent = JSON.stringify(payload, null, 2);

  const lineCount = payload.texts[0].lines.length;
  if (!payload.texts[0].title && !lineCount) {
    elements.builderStatus.textContent =
      "Add a title and paste lyric lines to generate a JSON file.";
    return;
  }

  elements.builderStatus.textContent = `${lineCount} line${lineCount === 1 ? "" : "s"} ready.`;
}

function downloadBuilderJson() {
  const payload = buildLyricEntryPayload();
  const text = payload.texts[0];

  if (!text.title.trim()) {
    elements.builderStatus.textContent = "Add a title before downloading.";
    return;
  }

  if (!text.lines.length) {
    elements.builderStatus.textContent = "Paste at least one lyric line before downloading.";
    return;
  }

  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${text.id || "new-text"}.json`;
  link.click();
  URL.revokeObjectURL(downloadUrl);
  elements.builderStatus.textContent = `Downloaded ${link.download}. Place it in content/lyrics/.`;
}

function fillBuilderSample() {
  elements.builderTitle.value = "晴天";
  elements.builderId.value = "jay-chou-qing-tian";
  elements.builderDescription.value = "Sample lyric entry created in the browser.";
  elements.builderTags.value = "lyrics, mandopop, jay chou";
  elements.builderLines.value = [
    "故事的小黄花 | gu shi de xiao huang hua | The little yellow flower from the story",
    "从出生那年就飘着 | cong chu sheng na nian jiu piao zhe | Has drifted since the year it was born",
  ].join("\n");
  renderBuilderPreview();
}

function renderDictionary() {
  const query = normalizeSearchValue(state.dictionaryQuery);
  const latinQuery = normalizeLatinSearchValue(state.dictionaryQuery);

  if (!query) {
    elements.dictionaryMeta.textContent =
      "Search the CC-CEDICT dictionary by characters, pinyin, or English.";
    elements.dictionaryResults.innerHTML = `
      <article class="dictionary-empty">
        <h3>Dictionary ready</h3>
        <p>Type characters, pinyin, or an English word to search.</p>
      </article>
    `;
    return;
  }

  if (!isHanziQuery(state.dictionaryQuery) && latinQuery.length < 2) {
    elements.dictionaryMeta.textContent =
      "Type at least 2 Latin characters for pinyin or English search.";
    elements.dictionaryResults.innerHTML = `
      <article class="dictionary-empty">
        <h3>Keep typing</h3>
        <p>Single-letter Latin searches are intentionally disabled for performance.</p>
      </article>
    `;
    return;
  }

  if (state.dictionaryStatus === "loading") {
    elements.dictionaryMeta.textContent = "Searching dictionary...";
    elements.dictionaryResults.innerHTML = `
      <article class="dictionary-empty">
        <h3>Searching</h3>
        <p>Loading only the relevant dictionary bucket for this query.</p>
      </article>
    `;
    return;
  }

  if (state.dictionaryStatus === "error") {
    elements.dictionaryMeta.textContent = "Unable to load dictionary data.";
    elements.dictionaryResults.innerHTML = `
      <article class="dictionary-empty">
        <h3>Dictionary unavailable</h3>
        <p>Check the generated dictionary files and try rebuilding the project.</p>
      </article>
    `;
    return;
  }

  const entries = state.dictionaryResults;
  elements.dictionaryMeta.textContent = `${entries.length} result${entries.length === 1 ? "" : "s"}`;

  if (!entries.length) {
    elements.dictionaryResults.innerHTML = `
      <article class="dictionary-empty">
        <h3>No matches</h3>
        <p>Try simplified, traditional, pinyin, or an English meaning.</p>
      </article>
    `;
    return;
  }

  elements.dictionaryResults.innerHTML = entries
    .map((entry) => {
      const hsk = entry.hsk ? `<span class="pill">HSK ${entry.hsk}</span>` : "";
      const numbered = entry.pinyinNumbered
        ? `<span class="dictionary-numbered">${entry.pinyinNumbered}</span>`
        : "";

      return `
        <article class="dictionary-entry">
          <div class="dictionary-head">
            <div>
              <div class="dictionary-hanzi">${entry.simplified}</div>
              ${
                entry.traditional && entry.traditional !== entry.simplified
                  ? `<div class="dictionary-traditional">Traditional: ${entry.traditional}</div>`
                  : ""
              }
            </div>
            <div class="dictionary-aside">
              ${hsk}
            </div>
          </div>
          <div class="dictionary-pinyin">${entry.pinyin}</div>
          ${numbered}
          <ol class="dictionary-definitions">
            ${(entry.definitions ?? []).map((definition) => `<li>${definition}</li>`).join("")}
          </ol>
        </article>
      `;
    })
    .join("");
}

function shuffleCurrentDeck() {
  const deck = getSelectedDeck();
  if (!deck) {
    return;
  }

  for (let index = deck.cards.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [deck.cards[index], deck.cards[randomIndex]] = [deck.cards[randomIndex], deck.cards[index]];
  }

  state.selectedCardIndex = 0;
  state.cardFlipped = false;
  renderFlashcard();
}

function attachEventListeners() {
  window.addEventListener("hashchange", renderRoute);

  elements.deckSelect.addEventListener("change", (event) => {
    state.selectedDeckIndex = Number(event.target.value);
    state.selectedCardIndex = 0;
    state.cardFlipped = false;
    renderFlashcard();
  });

  elements.textSelect.addEventListener("change", (event) => {
    state.selectedTextIndex = Number(event.target.value);
    renderText();
  });

  elements.flashcard.addEventListener("click", () => {
    state.cardFlipped = !state.cardFlipped;
    renderFlashcard();
  });

  elements.flipCard.addEventListener("click", () => {
    state.cardFlipped = !state.cardFlipped;
    renderFlashcard();
  });

  elements.prevCard.addEventListener("click", () => {
    const deck = getSelectedDeck();
    if (!deck) {
      return;
    }
    state.selectedCardIndex =
      (state.selectedCardIndex - 1 + deck.cards.length) % deck.cards.length;
    state.cardFlipped = false;
    renderFlashcard();
  });

  elements.nextCard.addEventListener("click", () => {
    const deck = getSelectedDeck();
    if (!deck) {
      return;
    }
    state.selectedCardIndex = (state.selectedCardIndex + 1) % deck.cards.length;
    state.cardFlipped = false;
    renderFlashcard();
  });

  elements.lookupCard.addEventListener("click", async () => {
    const card = getSelectedCard();
    if (!card?.hanzi) {
      return;
    }
    await runDictionarySearch(card.hanzi);
  });

  elements.shuffleCards.addEventListener("click", shuffleCurrentDeck);

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.readerMode = button.dataset.mode;
      renderReaderMode();
    });
  });

  elements.dictionarySearch.addEventListener("input", async (event) => {
    state.dictionaryQuery = event.target.value;
    renderDictionary();

    if (!normalizeSearchValue(state.dictionaryQuery)) {
      state.dictionaryResults = [];
      state.dictionaryStatus = "idle";
      renderDictionary();
      return;
    }

    if (
      !isHanziQuery(state.dictionaryQuery) &&
      normalizeLatinSearchValue(state.dictionaryQuery).length < 2
    ) {
      state.dictionaryResults = [];
      state.dictionaryStatus = "idle";
      renderDictionary();
      return;
    }

    state.dictionaryStatus = "loading";
    renderDictionary();
    await runDictionarySearch(state.dictionaryQuery);
  });

  elements.textContent.addEventListener("click", async (event) => {
    const hanziButton = event.target.closest(".hanzi-token-button");
    if (!hanziButton) {
      return;
    }

    const query = hanziButton.dataset.query?.trim();
    if (!query) {
      return;
    }

    await runDictionarySearch(query);
  });

  elements.textContent.addEventListener("mouseover", async (event) => {
    const hanziButton = event.target.closest(".hanzi-token-button");
    if (!hanziButton) {
      return;
    }

    await showHoverDefinition(hanziButton, event);
  });

  elements.textContent.addEventListener("mousemove", (event) => {
    if (!elements.hoverGlossary.hidden) {
      setGlossaryPosition(event);
    }
  });

  elements.textContent.addEventListener("mouseout", (event) => {
    const hanziButton = event.target.closest(".hanzi-token-button");
    if (!hanziButton) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget && hanziButton.contains(relatedTarget)) {
      return;
    }

    glossaryHoverRequestId += 1;
    hideGlossary();
  });

  [
    elements.builderId,
    elements.builderTitle,
    elements.builderDescription,
    elements.builderTags,
    elements.builderLines,
  ].forEach((element) => {
    element.addEventListener("input", renderBuilderPreview);
  });

  elements.builderDownload.addEventListener("click", downloadBuilderJson);
  elements.builderFillSample.addEventListener("click", fillBuilderSample);
}

async function init() {
  try {
    const [flashcardsData, textsData] = await Promise.all([
      loadJson("./data/flashcards.json"),
      loadJson("./data/texts.json"),
    ]);

    state.decks = flashcardsData.decks ?? [];
    state.texts = textsData.texts ?? [];

    renderDeckOptions();
    renderTextOptions();
    renderFlashcard();
    renderReaderMode();
    renderDictionary();
    renderBuilderPreview();
    if (!window.location.hash) {
      window.location.hash = "#/flashcards";
    }
    renderRoute();
    attachEventListeners();
  } catch (error) {
    console.error(error);
    setStatusMessage("Failed to load study material. Check the JSON files.");
    elements.textTitle.textContent = "Unable to load texts.";
    elements.textDescription.textContent = "Open the developer console for details.";
    elements.dictionaryMeta.textContent = "Dictionary was not initialized.";
  }
}

init();
