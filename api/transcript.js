// /api/transcript  —  유튜브 영상 링크에서 자막(대본)을 무료로 추출
// briefyou 와 동일 원리: 유튜브가 영상마다 보유한 자막 트랙을 가져온다.
// 사람이 단 자막이 없으면 유튜브 자동생성(ASR) 자막까지 시도한다.

const ALLOW = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // 이미 11자리 ID 만 들어온 경우
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(t) {
  return t
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// 유튜브 watch 페이지 HTML 에서 자막 트랙 목록을 파싱
async function getCaptionTracks(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=ko`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "ko,en;q=0.9",
    },
  });
  const html = await res.text();

  // captionTracks JSON 블록 추출
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

async function fetchTranscriptText(baseUrl) {
  // baseUrl 에 &fmt=json3 를 붙이면 구조화된 자막을 받을 수 있다
  const res = await fetch(baseUrl + "&fmt=json3", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (res.ok) {
    try {
      const data = await res.json();
      if (data && Array.isArray(data.events)) {
        const text = data.events
          .filter((e) => e.segs)
          .map((e) => e.segs.map((s) => s.utf8).join(""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) return decodeEntities(text);
      }
    } catch {
      /* fall through to xml */
    }
  }
  // 폴백: 기본 XML 형식
  const xmlRes = await fetch(baseUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  const xml = await xmlRes.text();
  const parts = [...xml.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, ""))
  );
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

module.exports = async (req, res) => {
  Object.entries(ALLOW).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const videoId = extractVideoId(body.url);
    if (!videoId)
      return res
        .status(400)
        .json({ error: "유효한 유튜브 링크가 아니에요. 주소를 다시 확인해 주세요." });

    const tracks = await getCaptionTracks(videoId);
    if (!tracks.length) {
      return res.status(404).json({
        error:
          "이 영상은 자동 자막을 가져올 수 없어요. 대본을 직접 붙여넣어 주세요.",
        videoId,
      });
    }

    // 우선순위: 한국어 사람자막 > 한국어 자동자막 > 영어 > 첫번째
    const pick =
      tracks.find((t) => t.languageCode === "ko" && t.kind !== "asr") ||
      tracks.find((t) => t.languageCode === "ko") ||
      tracks.find((t) => t.languageCode === "en") ||
      tracks[0];

    const transcript = await fetchTranscriptText(pick.baseUrl);
    if (!transcript) {
      return res.status(404).json({
        error: "자막 내용을 읽지 못했어요. 대본을 직접 붙여넣어 주세요.",
        videoId,
      });
    }

    return res.status(200).json({
      videoId,
      language: pick.languageCode,
      auto: pick.kind === "asr",
      transcript,
    });
  } catch (e) {
    return res.status(500).json({
      error:
        "자막 추출 중 문제가 생겼어요. 잠시 후 다시 시도하거나 대본을 직접 붙여넣어 주세요.",
      detail: String(e && e.message ? e.message : e),
    });
  }
};
