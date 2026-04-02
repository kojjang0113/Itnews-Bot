// ──────────────────────────────────────────────
// 피드 소스 정의 — 탭별로 순서대로 시도
// type "rss2json" → JSON 응답, type "xml" → CORS-friendly XML 직접 fetch
// ──────────────────────────────────────────────
const FEED_SOURCES = {
  "TechCrunch": [
    { label: "rss2json", type: "rss2json", url: "https://techcrunch.com/feed/" },
  ],
  "Google News": [
    { label: "rss2json",  type: "rss2json", url: "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko" },
    { label: "fetchrss",  type: "xml",      url: "https://fetchrss.com/rss?url=" + encodeURIComponent("https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko") },
    { label: "rsshub",    type: "xml",      url: "https://rsshub.app/google/news/world" },
  ],
  "The Verge": [
    { label: "rss2json",  type: "rss2json", url: "https://www.theverge.com/rss/index.xml" },
    { label: "fetchrss",  type: "xml",      url: "https://fetchrss.com/rss?url=" + encodeURIComponent("https://www.theverge.com/rss/index.xml") },
    { label: "rsshub",    type: "xml",      url: "https://rsshub.app/theverge/" },
  ],
};

// 현재 활성 탭
let currentSource = "TechCrunch";
// 탭별 피드 캐시
const cache = {};

const contentEl  = document.getElementById("content");
const tabEls     = document.querySelectorAll(".tab");
const refreshBtn = document.getElementById("refreshBtn");

// ──────────────────────────────────────────────
// 탭 / 새로고침 이벤트
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
// HTML 태그 제거
// ──────────────────────────────────────────────
function stripHtml(text) {
  const div = document.createElement("div");
  div.innerHTML = text || "";
  return div.textContent.replace(/\s+/g, " ").trim();
}

// ──────────────────────────────────────────────
// RSS XML 파싱 (RSS 2.0 + Atom 공통)
// ──────────────────────────────────────────────
function parseXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const items = [...doc.querySelectorAll("item, entry")].slice(0, 10);

  return items.map((item) => {
    const text = (sel) => item.querySelector(sel)?.textContent?.trim() ?? "";

    // Atom <link href="..."> 와 RSS <link>텍스트 둘 다 처리
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
// rss2json API (JSON 반환)
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

// ──────────────────────────────────────────────
// XML 직접 fetch — fetchrss / rsshub 등 CORS-friendly 소스용
// ──────────────────────────────────────────────
async function fetchViaXml(proxyUrl) {
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.trim().startsWith("{")) throw new Error("XML이 아닌 응답");
  const items = parseXml(text);
  if (!items.length) throw new Error("파싱된 항목 없음");
  return items;
}

// ──────────────────────────────────────────────
// 피드 로드 — 소스 순서대로 fallback + console.log
// ──────────────────────────────────────────────
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
// 피드 로드 (캐시 → fetchFeed → 렌더)
// ──────────────────────────────────────────────
async function loadFeed(source) {
  if (cache[source]) {
    renderCards(cache[source], source);
    return;
  }

  showStatus("뉴스를 불러오는 중...");

  try {
    const items = await fetchFeed(source);
    if (!items.length) {
      showStatus("뉴스를 불러올 수 없습니다.");
      return;
    }
    cache[source] = items;
    renderCards(items, source);
  } catch (e) {
    showStatus(`피드 오류: ${e.message}`, true);
  }
}

// ──────────────────────────────────────────────
// MyMemory 번역 API
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
// 카드 목록 렌더링
// ──────────────────────────────────────────────
function renderCards(items, source) {
  contentEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "feed-header";
  header.textContent = `${source} — 최신 ${items.length}건`;
  contentEl.appendChild(header);

  items.forEach((item, i) => {
    const card = createCard(item, i);
    contentEl.appendChild(card);
    // 순차 지연으로 MyMemory API 부하 분산 (300ms 간격)
    setTimeout(() => translateCard(card, item), i * 300);
  });
}

// ──────────────────────────────────────────────
// 카드 DOM 생성
// ──────────────────────────────────────────────
function createCard(item, index) {
  const a = document.createElement("a");
  a.className = "card";
  a.href = item.link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const idxEl = document.createElement("div");
  idxEl.className = "card-index";
  idxEl.textContent = `#${index + 1}`;

  const titleEl = document.createElement("div");
  titleEl.className = "card-title";
  titleEl.textContent = item.title;

  const summaryEl = document.createElement("div");
  summaryEl.className = "card-summary translating";
  summaryEl.textContent = "번역 중...";

  a._titleEl   = titleEl;
  a._summaryEl = summaryEl;

  a.appendChild(idxEl);
  a.appendChild(titleEl);
  a.appendChild(summaryEl);
  return a;
}

// ──────────────────────────────────────────────
// 개별 카드 번역
// ──────────────────────────────────────────────
async function translateCard(cardEl, item) {
  try {
    const [krTitle, krSummary] = await Promise.all([
      translateText(item.title),
      translateText(item.summary),
    ]);

    if (krTitle) cardEl._titleEl.textContent = krTitle;
    cardEl._summaryEl.textContent = krSummary || "요약을 불러올 수 없습니다.";
    cardEl._summaryEl.classList.remove("translating");
  } catch (e) {
    cardEl._summaryEl.textContent = `번역 오류: ${e.message}`;
    cardEl._summaryEl.classList.remove("translating");
    cardEl._summaryEl.style.color = "#cc0000";
  }
}

// ──────────────────────────────────────────────
// 상태 메시지 표시
// ──────────────────────────────────────────────
function showStatus(msg, isError = false) {
  contentEl.innerHTML = `<div class="status-msg${isError ? " error" : ""}">${msg}</div>`;
}

// 초기 로드
loadFeed(currentSource);
