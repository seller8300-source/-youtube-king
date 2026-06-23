// /api/generate — 궁금한마케팅 컨텐츠공장
// USP 입력 → 캐릭터(페르소나) 선택 → 숏폼/롱폼 → [대본+고정카피+캡션+콘티] 출력
// 이상한마케팅/자청 카피 공식을 엔진에 내장. API 키는 환경변수(ANTHROPIC_API_KEY)에 저장.

const ALLOW = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 자료에서 추출한 6대 카피 공식 (모든 캐릭터 공통 베이스)
const COPY_FORMULAS = `
[카피 6대 공식 — 반드시 구조적으로 녹일 것]
1) 권위의 법칙: 실적·숫자·전문가를 앞세워 신뢰 부여 (예: "현장 800곳이 쓰는", "조경업자가 자기 집에 쓰는")
2) 숫자의 원칙: 막연한 형용사 대신 구체적 숫자 (예: "10년 안 삭는", "공기 30% 단축", "견적 300만원 절감")
3) 상식 파괴(언매칭): 통념을 정반대로 뒤집기 (예: "비싼 게 오히려 싸다", "넓을수록 손해")
4) 금지·위협: 손실 회피 자극 (예: "이거 모르면 3년 안에 버린다", "절대 두면 안 되는")
5) 표본 넓히기: 좁은 제품을 넓은 욕망으로 치환 (예: 파고라→"집값 올리는 마당", 야외가구→"남들이 부러워하는 마당")
6) 궁금증 갭: 답을 미루고 끝까지 보게 (예: "옆집 마당이 카페처럼 보이는 진짜 이유", "정체 공개합니다")
`;

// 캐릭터(페르소나) 4종 — 각자 어떤 공식을 세게 쓰는지가 다름
const PERSONAS = {
  yeri: {
    name: "예리 마케터",
    desc: "차분한 정보전달러",
    voice: `감정을 빼고 팩트와 논리로 설득한다. 통념을 차분히 깨고, 핵심을 '딱 3가지'로 번호 매겨 정리하며, 숫자와 근거로 신뢰를 쌓는다. 강의하듯 또박또박. 6대 공식 중 [권위][숫자]를 특히 강하게 쓴다. 과장·자극은 절제.`,
  },
  jasung: {
    name: "자수성 설계자",
    desc: "썰 푸는 개념러",
    voice: `하나의 강력한 개념을 잡고("돈 버는 사장 vs 못 버는 사장") 여러 사례로 증명하며 끝까지 끌고 간다. 친근한 반말체 섞인 입담. "내가 수백 명 봐왔는데" 식 경험 권위. 6대 공식 중 [표본 넓히기][궁금증 갭]을 강하게 쓴다.`,
  },
  doval: {
    name: "도발이",
    desc: "자존심 긁는 후킹러",
    voice: `첫 1~2초에 강하게 도발한다. "이거 모르면 평생 손해", "99%가 하는 실수"처럼 자존심을 긁고 불안을 자극해 끝까지 보게 만든다. 텐션 높고 직설적. 6대 공식 중 [금지·위협][상식 파괴]를 가장 세게 쓴다.`,
  },
  gonggam: {
    name: "공감이",
    desc: "스토리텔러",
    voice: `실패담·경험담으로 시작해 공감을 얻고 신뢰로 전환한다. "저도 예전에 이것 때문에 고생했는데…" 1인칭 서사. 솔직하고 따뜻한 톤. 진정성으로 USP를 자연스럽게 녹인다. 6대 공식 중 [궁금증 갭][권위(경험)]를 활용.`,
  },
};

function buildPrompt({ biz, persona, format }) {
  const p = PERSONAS[persona] || PERSONAS.doval;

  const lengthGuide =
    format === "short"
      ? `숏폼(15~25초, 쇼츠/릴스). 대본은 초단위로 끊어서(0~2초, 2~5초...) 작성. 첫 1~2초 후킹 필수.`
      : `롱폼(5~10분). 6단계 흐름: ①후킹+타깃 ②권위(자기소개) ③통념 깨기 ④핵심 3가지 ⑤사례+숫자 ⑥행동유도(CTA). 실제 말하는 구어체.`;

  const brandBlock = (biz.brandDoc && biz.brandDoc.trim())
    ? `\n## 브랜드 자료 (아래 내용을 최우선 근거로 삼아라. USP 5칸과 충돌하면 이 자료를 우선)\n"""\n${biz.brandDoc.trim()}\n"""\n`
    : "";

  return `너는 한국 최고의 바이럴 콘텐츠 기획자다. 아래 캐릭터의 말투로, 주어진 제품의 USP를 살려 콘텐츠를 만든다.

## 캐릭터
【${p.name}】(${p.desc})
${p.voice}
${brandBlock}

## 절대 규칙
1. 제품의 USP(강점)는 반드시 콘텐츠 안에 명확히 담는다.
2. 아래 6대 카피 공식을 구조적으로 녹인다. (공식 이름은 노출하지 말 것)
3. USP에 있는 사실만 사용. 없는 수치·효능은 지어내지 마라.
4. 어려운 한자어·업계 용어 금지. 쉬운 단어로. (시청자 뇌를 편하게)
5. 고정카피는 무조건 짧게. 12자 이내. "잘하면 10자, 더 잘하면 5자" 원칙.
6. ★표본 넓히기 최우선★ 고정카피와 대본 초반 1~2초는 좁은 제품/효과를 그대로 말하지 말고, 더 많은 사람이 관심 갖는 '큰 욕망'(돈·키·외모·시간·비밀·고수·손해)으로 끌어올려라. 그래야 조회수가 터진다.

${COPY_FORMULAS}

## 길이/형식
${lengthGuide}

## 제품 정보 (USP)
- 무엇을 파나: ${biz.what || "(미입력)"}
- 타깃 고객: ${biz.who || "(미입력)"}
- 차별점·강점: ${biz.diff || "(미입력)"}
- 신뢰 근거(숫자·실적·후기): ${biz.proof || "(미입력)"}
- 원하는 행동(CTA): ${biz.cta || "(미입력)"}

## 출력 형식 (반드시 아래 마크다운 구조 그대로. 표를 적극 사용해 보기 좋게)

## 【고정카피】
> 📈 표본 넓히기: "(좁은 증상/제품)" → "(넓힌 큰 욕망)" 으로 확장했습니다.

**후보 1.** \`카피\`
**후보 2.** \`카피\`
**후보 3.** \`카피\`

[고정카피 핵심 규칙 — 반드시 지켜라]
- 12자 이내로 짧고 강하게.

★★ 표본 넓히기 — 생성 전에 반드시 이 2단계를 머릿속으로 거쳐라 ★★
1단계: 이 제품/서비스를 찾는 좁은 증상·제품명이 무엇인지 파악한다. (예: "오다리 교정", "소프트스톤")
2단계: 그걸 그대로 쓰지 말고, 그 증상이 풀렸을 때 사람들이 진짜 원하는 '더 큰 욕망'으로 치환한다.
   - 오다리 교정 → 사람들이 진짜 원하는 건? "다리 길어 보이기 / 키 커 보이기 / 라인 예뻐지기" → 이걸로 카피
   - 안짱다리 → "키 10cm 커 보이는 걸음"
   - 소프트스톤 → "고수만 쓰는 자재 / 돈 굳는 인테리어"
   - 치아교정 → "동안 되는 법 / 인상 바뀌는 법"

[금지] 고정카피에 증상명·진단명·제품명을 그대로 쓰지 마라.
   · 나쁜 예) "오다리 방치가 병" "오다리 지금 안 잡으면" → '오다리'를 그대로 노출 = 표본 좁음, 탈락
   · 좋은 예) "다리 길어 보이는 법" "키 5cm 커 보이는 자세" "여자들이 보는 다리"

[3개 후보는 서로 다른 욕망 각도로]
   · 1번: 외모/매력 각도 (예뻐 보임, 키 커 보임)
   · 2번: 비밀/고수 각도 (남들 모르는, 고수만 아는)
   · 3번: 손실/충격 각도 — 단 여기서도 증상명 대신 큰 손해로 ("이 자세가 키를 깎아먹는다")

## 【대본】
${format === "short"
  ? "아래 표 형식으로 작성:\n\n| 구간 | 멘트 | 포인트 |\n|---|---|---|\n| **0~2초** | \"...\" | 후킹 |\n| ... | ... | ... |"
  : "구어체 대본을 단락으로 작성하되, 6단계(①후킹+타깃 ②권위 ③통념깨기 ④핵심3가지 ⑤사례+숫자 ⑥CTA)가 보이도록 소제목을 붙여라."}

## 【캡션】
업로드 본문 줄글 + 핵심 포인트 ①②③ + 마지막 줄에 CTA + 해시태그 5~7개(\`#태그\` 형식)

## 【영상 콘티】
아래 표 형식으로 작성:

| 구간 | 화면 구성 | 자막 | 음악/효과 |
|---|---|---|---|
| **0~2초** | ... | \`자막\` | ... |

마지막에 > 인용구로 [촬영 팁] 2~3줄.

규칙: USP의 사실만 사용. 숫자·근거를 카피에 적극 반영. 어려운 한자어 금지.
한국어로, 바로 촬영에 쓸 수 있게 작성하라.`;
}

module.exports = async (req, res) => {
  Object.entries(ALLOW).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res.status(500).json({ error: "서버에 API 키가 설정되지 않았어요. (ANTHROPIC_API_KEY)" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { biz = {}, persona = "doval", format = "short" } = body;

    if (!biz.what || !String(biz.what).trim())
      return res.status(400).json({ error: "최소한 '무엇을 파나요?'는 입력해 주세요." });

    const prompt = buildPrompt({ biz, persona, format });

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
      return res.status(502).json({ error: "AI 생성에 실패했어요.", detail: errText.slice(0, 500) });
    }

    const data = await r.json();
    const result = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ result, personaName: (PERSONAS[persona] || PERSONAS.doval).name });
  } catch (e) {
    return res.status(500).json({ error: "처리 중 오류가 발생했어요.", detail: String(e && e.message ? e.message : e) });
  }
};
