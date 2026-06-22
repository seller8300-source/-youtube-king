// /api/generate  —  레퍼런스 대본의 말투·구조를 분석해 회사/제품 대본을 생성
// API 키는 Vercel 환경변수(ANTHROPIC_API_KEY)에 저장 → 프론트에 절대 노출 안 됨

const ALLOW = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function buildPrompt({ reference, company, format, persuasionMode }) {
  const lengthGuide =
    format === "short"
      ? "숏폼(15~60초, 유튜브 쇼츠/릴스). 길이는 한글 350~600자 내외. 첫 1~2초에 시선을 잡는 강력한 후킹으로 시작."
      : "롱폼(5~12분). 도입 후킹 → 본론 전개 → 마무리 CTA 구조. 챕터처럼 흐름이 보이게.";

  if (persuasionMode) {
    return `너는 한국 최고의 유튜브 대본 기획자다. 레퍼런스 영상이 없으므로, 시청자의 심리를 건드려 끝까지 보게 만들고 행동(문의/구매/저장)으로 이어지게 하는 설득 구조로 대본을 직접 기획한다.

## 활용할 심리 기법 (자연스럽게 녹여라, 기법 이름은 절대 노출하지 마라)
- 후킹: 통념을 뒤집는 질문/주장, 손실 회피("이거 모르면 ~ 손해"), 호기심 갭
- 신뢰: 구체적 숫자/사례로 가치 입증, 권위·실적 제시
- 공감: 시청자가 겪는 진짜 고민을 콕 집어 말하기
- 행동: 명확하고 부담 없는 다음 단계 제시(CTA)

## 길이/형식
${lengthGuide}

## 회사·제품 정보 (이 내용을 근거로만 작성. 없는 사실 지어내지 마라)
${company}

## 출력 형식
1) [기획 의도] 2~3줄: 어떤 심리 포인트로 설계했는지
2) [대본] 실제 말하는 그대로의 구어체 대본. 숏폼이면 장면/자막 표시도 함께.
3) [썸네일·제목 후보] 3개

한국어로, 바로 촬영에 쓸 수 있게 작성하라.`;
  }

  return `너는 한국 최고의 유튜브 대본 기획자다. 아래 [레퍼런스 대본]의 말투와 대본 구조를 정밀 분석한 뒤, 그 스타일 그대로 [회사·제품 정보]를 녹여 새 대본을 만든다.

## 1단계: 레퍼런스 분석 (먼저 내부적으로 분석하고, 결과만 [스타일 분석]에 3~5줄로 요약)
- 말투/어조 (반말·존댓말, 텐션, 말버릇, 호흡)
- 후킹 방식 (어떻게 첫 문장으로 시선을 잡는가)
- 전개 구조 (문제제기→해결, 리스트형, 스토리텔링 등)
- 마무리/CTA 방식

## 2단계: 같은 스타일로 회사/제품 대본 작성
- 레퍼런스의 말투·리듬·구조를 그대로 모사하되, 내용은 회사/제품으로 교체
- [회사·제품 정보]에 있는 사실만 사용. 없는 수치·효능 지어내지 마라.

## 길이/형식
${lengthGuide}

## 레퍼런스 대본
"""
${reference}
"""

## 회사·제품 정보
"""
${company}
"""

## 출력 형식
1) [스타일 분석] 3~5줄
2) [대본] 실제 말하는 구어체. 숏폼이면 장면/자막 표시 포함.
3) [썸네일·제목 후보] 3개

한국어로, 바로 촬영에 쓸 수 있게 작성하라.`;
}

module.exports = async (req, res) => {
  Object.entries(ALLOW).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res
      .status(500)
      .json({ error: "서버에 API 키가 설정되지 않았어요. (ANTHROPIC_API_KEY)" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { reference = "", company = "", format = "short" } = body;

    if (!company.trim())
      return res
        .status(400)
        .json({ error: "회사·제품 정보를 입력해 주세요." });

    const persuasionMode = !reference.trim();
    const prompt = buildPrompt({ reference, company, format, persuasionMode });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res
        .status(502)
        .json({ error: "AI 생성에 실패했어요.", detail: errText.slice(0, 500) });
    }

    const data = await r.json();
    const script = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ script, persuasionMode });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "처리 중 오류가 발생했어요.", detail: String(e && e.message ? e.message : e) });
  }
};
