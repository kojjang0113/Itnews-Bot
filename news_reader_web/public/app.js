// ──────────────────────────────────────────────
// 피드 목록 (배열 — 앞에서부터 순서대로 시도)
// ──────────────────────────────────────────────
const FEEDS = {
  "TechCrunch": [
    "https://techcrunch.com/feed/",
  ],
  "BBC News": [
    "https://feeds.bbci.co.uk/news/rss.xml",
  ],
  "Ars Technica": [
    "https://feeds.arstechnica.com/arstechnica/index",
  ],
};

// RSS2JSON 무료 API (CORS 없이 JSON 반환)
const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

// 현재 활성 탭
let currentSource = "TechCrunch"; // 초기 탭
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
// RSS2JSON API로 피드 가져오기 (URL 배열 순서대로 fallback)
// ──────────────────────────────────────────────
async function fetchFeed(source) {
  const urls = FEEDS[source];
  let lastError;

  for (const feedUrl of urls) {
    try {
      const res = await fetch(RSS2JSON + encodeURIComponent(feedUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.message || "피드 응답 오류");

      // RSS2JSON items: { title, link, description, content, pubDate }
      return data.items.slice(0, 10).map((item) => ({
        title:   stripHtml(item.title || ""),
        link:    item.link || "",
        // content가 더 상세한 본문, 없으면 description 사용
        summary: stripHtml(item.content || item.description || ""),
      }));
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError;
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
// 개별 카드 번역 (제목 + 본문 요약)
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
