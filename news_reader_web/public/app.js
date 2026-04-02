// ──────────────────────────────────────────────
// 피드 소스 — 탭별 순서대로 시도 (rsshub 직접 XML이 우선)
// ──────────────────────────────────────────────
const FEED_SOURCES = {
  "TechCrunch": [
    { label: "rss2json", type: "rss2json", url: "https://techcrunch.com/feed/" },
  ],
  "Google News": [
    { label: "rsshub",   type: "xml",      url: "https://rsshub.app/google/news/korea" },
    { label: "rss2json", type: "rss2json", url: "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko" },
  ],
  "The Verge": [
    { label: "rsshub",   type: "xml",      url: "https://rsshub.app/verge/index" },
    { label: "rss2json", type: "rss2json", url: "https://www.theverge.com/rss/index.xml" },
  ],
};

let currentSource = "TechCrunch";
const cache = {};

const contentEl  = document.getElementById("content");
const tabEls     = document.querySelectorAll(".tab");
const refreshBtn = document.getElementById("refreshBtn");

// ──────────────────────────────────────────────
// 이벤트
// ──────────────────────────────────────────────
tabEls.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabEls.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentSource = tab.dataset.source;
    loadFeed(currentSource);
  });
});

refreshBtn.addEventListener("click", () => {
  delete cache[currentSource];
  loadFeed(currentSource);
});

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────
function stripHtml(text) {
  const div = document.createElement("div");
  div.innerHTML = text || "";
  return div.textContent.replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// RSS XML 파싱 (RSS 2.0 + Atom 공통)
// ──────────────────────────────────────────────
function parseXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const items = [...doc.querySelectorAll("item, entry")].slice(0, 10);

  return items.map((item) => {
    const text = (sel) => item.querySelector(sel)?.textContent?.trim() ?? "";
    let link = text("link");
    if (!link) link = item.querySelector("link")?.getAttribute("href") ?? "";

    const summary =
      text("description") ||
      text("summary") ||
      text("content") ||
      item.getElementsByTagNameNS("*", "encoded")[0]?.textContent?.trim() ||
      "";

    return {
      title:   stripHtml(text("title")),
      link,
      summary: stripHtml(summary),
    };
  });
}

// ──────────────────────────────────────────────
// 피드 fetch — rss2json(JSON) / rsshub(XML 직접)
// ──────────────────────────────────────────────
async function fetchViaRss2Json(feedUrl) {
  const res = await fetch(
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message || "rss2json 응답 오류");
  return data.items.slice(0, 10).map((item) => ({
    title:   stripHtml(item.title || ""),
    link:    item.link || "",
    summary: stripHtml(item.content || item.description || ""),
  }));
}

async function fetchViaXml(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.trim().startsWith("{")) throw new Error("XML이 아닌 응답");
  const items = parseXml(text);
  if (!items.length) throw new Error("파싱된 항목 없음");
  return items;
}

async function fetchFeed(source) {
  const sources = FEED_SOURCES[source];
  let lastError;

  for (const src of sources) {
    console.log(`[${source}] ${src.label} 시도 중... (${src.url})`);
    try {
      const items =
        src.type === "rss2json"
          ? await fetchViaRss2Json(src.url)
          : await fetchViaXml(src.url);
      console.log(`[${source}] ${src.label} 성공 — ${items.length}건`);
      return items;
    } catch (e) {
      console.warn(`[${source}] ${src.label} 실패:`, e.message);
      lastError = e;
    }
  }

  throw new Error(`모든 소스 실패: ${lastError?.message}`);
}

// ──────────────────────────────────────────────
// MyMemory 번역 — 429 방지를 위해 호출부에서 딜레이 제어
// ──────────────────────────────────────────────
async function translateText(text) {
  if (!text) return "";
  const q = text.slice(0, 500);
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|ko`
    );
    const data = await res.json();
    if (data.responseStatus === 200) return data.responseData.translatedText || text;
    return text;
  } catch {
    return text;
  }
}

// ──────────────────────────────────────────────
// 피드 로드
// ──────────────────────────────────────────────
async function loadFeed(source) {
  if (cache[source]) {
    renderCards(cache[source], source);
    return;
  }

  showStatus("뉴스를 불러오는 중...");

  try {
    const items = await fetchFeed(source);
    if (!items.length) { showStatus("뉴스를 불러올 수 없습니다."); return; }
    cache[source] = items;
    renderCards(items, source);
  } catch (e) {
    showStatus(`피드 오류: ${e.message}`, true);
  }
}

// ──────────────────────────────────────────────
// 카드 렌더링 + 제목 순차 번역 (500ms 간격)
// ──────────────────────────────────────────────
function renderCards(items, source) {
  contentEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "feed-header";
  header.textContent = `${source} — 최신 ${items.length}건`;
  contentEl.appendChild(header);

  const cards = items.map((item, i) => {
    const card = createCard(item, i);
    contentEl.appendChild(card);
    return card;
  });

  // 제목만 순차 번역 — 카드 간 500ms 딜레이
  (async () => {
    for (let i = 0; i < cards.length; i++) {
      if (i > 0) await sleep(500);
      try {
        const krTitle = await translateText(items[i].title);
        if (krTitle) cards[i]._titleEl.textContent = krTitle;
      } catch (e) {
        console.warn(`제목 번역 실패 #${i + 1}:`, e.message);
      }
    }
  })();
}

// ──────────────────────────────────────────────
// 카드 DOM 생성
// 카드 자체는 div, 제목만 링크, 요약 영역 클릭 시 번역
// ──────────────────────────────────────────────
function createCard(item, index) {
  const card = document.createElement("div");
  card.className = "card";

  const idxEl = document.createElement("div");
  idxEl.className = "card-index";
  idxEl.textContent = `#${index + 1}`;

  const titleEl = document.createElement("a");
  titleEl.className = "card-title";
  titleEl.href = item.link;
  titleEl.target = "_blank";
  titleEl.rel = "noopener noreferrer";
  titleEl.textContent = item.title;

  const summaryEl = document.createElement("div");
  summaryEl.className = "card-summary clickable";
  summaryEl.textContent = "▼ 클릭하여 요약 번역";

  // 요약 영역 클릭 → 번역 (한 번만)
  summaryEl.addEventListener("click", async () => {
    if (summaryEl.dataset.translated) return;
    summaryEl.dataset.translated = "1";
    summaryEl.textContent = "번역 중...";
    summaryEl.classList.add("translating");
    summaryEl.classList.remove("clickable");

    try {
      const krSummary = await translateText(item.summary);
      summaryEl.textContent = krSummary || "요약을 불러올 수 없습니다.";
    } catch {
      summaryEl.textContent = "번역 오류";
      summaryEl.style.color = "#cc0000";
    }

    summaryEl.classList.remove("translating");
  });

  card._titleEl = titleEl;

  card.appendChild(idxEl);
  card.appendChild(titleEl);
  card.appendChild(summaryEl);
  return card;
}

// ──────────────────────────────────────────────
// 상태 메시지
// ──────────────────────────────────────────────
function showStatus(msg, isError = false) {
  contentEl.innerHTML = `<div class="status-msg${isError ? " error" : ""}">${msg}</div>`;
}

loadFeed(currentSource);
