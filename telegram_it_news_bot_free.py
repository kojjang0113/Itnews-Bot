"""
텔레그램 IT 뉴스 봇 (무료 버전)
- 네이버 뉴스 IT 섹션 스크래핑 + 해외 RSS 3개 수집
- 영어 뉴스는 deep-translator로 한국어 번역
- /news 명령어로 최신 뉴스 20개 제공
"""

import os
import logging
import asyncio
import re
import feedparser
import httpx
from datetime import datetime
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# ── 설정 ──────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "8504154836:AAE-Wk8XMPASZU9-65TYe7D6AfroJIZDB88")
NEWS_COUNT = 20  # 가져올 뉴스 개수
# ─────────────────────────────────────────────────────

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# 영어 번역이 필요한 출처 식별자
ENGLISH_SOURCES = {"techcrunch", "verge", "googlenews_en"}

# RSS 피드 목록 (영어 출처는 translate=True)
RSS_FEEDS = [
    {
        "name": "🌐 TechCrunch",
        "url": "https://techcrunch.com/feed/",
        "key": "techcrunch",
        "translate": True,
    },
    {
        "name": "🌐 The Verge",
        "url": "https://www.theverge.com/rss/index.xml",
        "key": "verge",
        "translate": True,
    },
    {
        "name": "🌐 Google News (Tech)",
        "url": "https://news.google.com/rss/search?q=AI+tech+semiconductor&hl=en&gl=US&ceid=US:en",
        "key": "googlenews_en",
        "translate": True,
    },
]


def translate_to_korean(text: str) -> str:
    """영어 텍스트를 한국어로 번역. 실패 시 원문 반환"""
    if not text or not text.strip():
        return text
    try:
        translator = GoogleTranslator(source="auto", target="ko")
        # deep-translator 최대 길이 제한(5000자) 대비 자름
        result = translator.translate(text[:4500])
        return result if result else text
    except Exception as e:
        logger.warning(f"번역 실패: {e}")
        return text


def fetch_naver_it_news() -> list[dict]:
    """네이버 뉴스 IT 섹션(105) 스크래핑"""
    items = []
    url = "https://news.naver.com/section/105"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # 네이버 뉴스 섹션 기사 카드 선택
        articles = soup.select("a.sa_text_title")[:10]

        for a in articles:
            title = a.get_text(strip=True)
            link = a.get("href", "")
            if link.startswith("/"):
                link = "https://news.naver.com" + link

            if not title or len(title) < 5:
                continue

            items.append({
                "title": title,
                "link": link,
                "summary": "",
                "source": "🇰🇷 네이버 뉴스 IT",
                "date": datetime.now(ZoneInfo("Asia/Seoul")),  # 스크래핑이라 날짜 정보 없음
            })

    except Exception as e:
        logger.warning(f"네이버 뉴스 스크래핑 실패: {e}")

    return items


def parse_date(entry) -> datetime:
    """RSS 항목에서 날짜 파싱"""
    try:
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            return datetime(*entry.published_parsed[:6], tzinfo=ZoneInfo("UTC"))
    except Exception:
        pass
    return datetime.min.replace(tzinfo=ZoneInfo("UTC"))


def fetch_rss_news(feed_info: dict) -> list[dict]:
    """단일 RSS 피드 수집 및 번역 처리"""
    items = []
    try:
        feed = feedparser.parse(feed_info["url"])
        source = feed_info["name"]
        need_translate = feed_info.get("translate", False)

        for entry in feed.entries[:7]:  # 피드당 최대 7개
            title = entry.get("title", "").strip()
            link = entry.get("link", "").strip()
            summary = entry.get("summary", "").strip()

            # HTML 태그 제거
            summary = re.sub(r"<[^>]+>", "", summary)
            summary = re.sub(r"\s+", " ", summary).strip()

            if not title or len(title) < 5:
                continue

            # 영어 출처이면 제목·요약 번역
            if need_translate:
                title = translate_to_korean(title)
                if summary:
                    summary = translate_to_korean(summary[:300])

            items.append({
                "title": title,
                "link": link,
                "summary": summary[:150] if summary else "",
                "source": source,
                "date": parse_date(entry),
            })

    except Exception as e:
        logger.warning(f"피드 수집 실패 ({feed_info['name']}): {e}")

    return items


def fetch_all_news() -> list[dict]:
    """네이버 스크래핑 + RSS 3개 수집 후 최신순 정렬"""
    all_items = []

    # 네이버 뉴스 IT 섹션 (한국어, 번역 불필요)
    all_items.extend(fetch_naver_it_news())

    # 해외 RSS 피드 (영어 → 한국어 번역)
    for feed_info in RSS_FEEDS:
        all_items.extend(fetch_rss_news(feed_info))

    # 최신순 정렬 후 중복 제거 (제목 앞 30자 기준)
    seen = set()
    unique_items = []
    for item in sorted(all_items, key=lambda x: x["date"], reverse=True):
        key = item["title"][:30]
        if key not in seen:
            seen.add(key)
            unique_items.append(item)

    return unique_items[:NEWS_COUNT]


def format_news_message(news_list: list[dict]) -> str:
    """뉴스 목록을 텔레그램 메시지 형식으로 변환"""
    now = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M")
    lines = [f"📰 *IT 뉴스 TOP {len(news_list)}*", f"🕐 {now} 기준\n"]

    emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"]

    for i, item in enumerate(news_list):
        emoji = emojis[i] if i < len(emojis) else f"{i+1}."
        title = item["title"]
        source = item["source"]
        summary = item["summary"]
        link = item["link"]

        lines.append(f"{emoji} *{title}*")
        lines.append(f"   📌 {source}")
        if summary:
            lines.append(f"   {summary[:120]}{'...' if len(summary) >= 120 else ''}")
        lines.append(f"   🔗 [기사 보기]({link})\n")

    return "\n".join(lines)


# ── 텔레그램 핸들러 ────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 안녕하세요! IT 뉴스 봇입니다.\n\n"
        "📌 사용법:\n"
        "/news — 최신 IT 뉴스 20개\n"
        "/help — 도움말\n\n"
        "국내외 주요 IT 뉴스를 실시간으로 가져옵니다! 🚀"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📖 *도움말*\n\n"
        "/news — 국내외 최신 IT 뉴스 20개를 실시간으로 가져옵니다.\n\n"
        "📡 수집 출처:\n"
        "• 네이버 뉴스 IT 섹션\n"
        "• TechCrunch (한국어 번역)\n"
        "• The Verge (한국어 번역)\n"
        "• Google News 해외 Tech (한국어 번역)\n\n"
        "⏱ 보통 10~20초 소요됩니다 (번역 포함).\n\n"
        "💡 기사 링크를 길게 눌러 '브라우저에서 열기'를 선택하면 크롬으로 열 수 있어요.",
        parse_mode="Markdown"
    )


async def news_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """뉴스 수집 및 전송"""
    waiting_msg = await update.message.reply_text(
        "🔍 최신 IT 뉴스 수집 중...\n잠시만 기다려주세요!"
    )

    try:
        loop = asyncio.get_event_loop()
        news_list = await loop.run_in_executor(None, fetch_all_news)

        await waiting_msg.delete()

        if not news_list:
            await update.message.reply_text(
                "❌ 뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해주세요."
            )
            return

        message = format_news_message(news_list)

        # 4096자 초과 시 분할 전송
        if len(message) > 4000:
            chunks = [message[i:i+4000] for i in range(0, len(message), 4000)]
            for chunk in chunks:
                await update.message.reply_text(
                    chunk,
                    parse_mode="Markdown",
                    disable_web_page_preview=True
                )
        else:
            await update.message.reply_text(
                message,
                parse_mode="Markdown",
                disable_web_page_preview=True
            )

    except Exception as e:
        logger.error(f"news_command 오류: {e}")
        try:
            await waiting_msg.delete()
        except Exception:
            pass
        await update.message.reply_text(
            f"❌ 오류 발생: {str(e)}\n잠시 후 다시 시도해주세요."
        )


# ── 메인 ──────────────────────────────────────────────

def main():
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("news", news_command))

    logger.info("✅ IT 뉴스 봇 시작!")
    app.run_polling()


if __name__ == "__main__":
    main()
