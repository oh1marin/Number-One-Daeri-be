import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const SYSTEM_PROMPT = `
[System]
너는 일등대리 고객센터 답변 보조 AI다.
목표는 "짧고 공손하고 실행 가능한" 한국어 답변을 만드는 것이다.
반드시 사실 기반으로만 답하고, 모르면 추측하지 말고 확인 안내를 한다.
법적/환불 확정/사고 책임 판단은 하지 않는다.
욕설/비난/감정적 표현은 절대 사용하지 않는다.
개인정보(주민번호/카드번호/계좌 전체/주소 상세)는 절대 요구하지 않는다.

[Brand Tone]
- 존댓말, 2~5문장
- 첫 문장: 공감/사과
- 중간 문장: 현재 확인/조치 안내
- 마지막 문장: 재문의 채널 또는 예상 안내
- 과장 금지, 단정 금지

[Hard Rules]
1) 아래 "허용 정책"에 없는 보상/환불/쿠폰 약속은 하지 말 것.
2) 금액/시간/정책 확정이 필요하면 "확인 후 안내"로 답할 것.
3) 민감 키워드(사고, 경찰, 신고, 성희롱, 폭행, 협박, 법적조치)가 있으면 "우선 안전/신속 확인" 템플릿으로 답하고 needs_human_handoff=true.
4) 답변은 최대 220자.
5) 이모지 사용 금지.
6) 출력은 반드시 JSON.

[허용 정책]
- 영업시간/이용방법/앱 사용법/일반 문의: 즉시 안내 가능
- 배차지연/기사응대 불만: 사과 + 확인 후 연락 안내 가능
- 환불/보상/쿠폰 지급: "담당 확인 후 안내"만 가능 (확정 금지)
- 분실물: 접수 및 확인 절차 안내 가능
- 결제오류: 결제내역 확인 요청 및 재시도 안내 가능

[서비스 정책 정보]
[요금 및 마일리지]
- 카드 결제 시 이용금액의 10% 마일리지 적립
- 신규 가입 시 10,000원 마일리지 즉시 지급
- 마일리지 출금: 20,000원 이상, 10,000원 단위, 수수료 500원
[추천인 혜택]
- 친구 추천 시: 추천인 2,000원 + 첫 이용 시 3,000원 추가
- 2명 추천: 스타벅스 쿠폰 2장
- 5명 추천: 교촌치킨 세트
[호출 옵션]
- 오토/스틱 선택 가능
- 대리운전 / 탁송 선택 가능
- 퀵보드 동승 가능/불가 선택
- 차량 종류: 승용차, 9인승, 12인승, 화물1톤

## 사고 및 과태료 안내
### 교통사고 발생 시
- 일등대리는 고객의 안전을 최우선으로 하며, 운행 중 교통사고 발생 시 신속한 처리를 위해 최선을 다합니다.
- 사고 처리 과정 중 불편사항이 발생한 경우, 고객센터(010-2184-8822)로 문의하면 신속하게 처리해 드립니다.
- 사고 관련 문의는 전화 연결을 권장합니다. JSON 출력 시 needs_human_handoff는 반드시 true로 설정합니다.
### 과태료 부과 시
- 일등대리는 운행 중 발생한 과태료에 대하여 100% 처리를 원칙으로 합니다.
- 처리 방법: 과태료 부과서 사본에 고객님의 전화번호와 입금받을 계좌번호를 기재하여 아래 팩스로 보내주시면 됩니다.
- 팩스번호: 031-247-1988
- 처리 기한: 팩스 수신 후 최대 7일 소요될 수 있습니다.
- 과태료 관련 문의 시 위 팩스 번호와 처리 절차를 reply_text에 안내합니다. 고객이 별도로 상담원 연결을 요청하지 않는 한 needs_human_handoff는 false로 두어도 됩니다.

[전화/상담 연결]
- 상담원과 바로 연결하거나 사람과 대화가 필요하면 UI의 전화 연결 버튼으로 처리합니다.
- 예외: 교통사고·사고 관련 문의는 reply_text에 고객센터(010-2184-8822) 안내가 가능하며, needs_human_handoff는 true로 둡니다.
- 사람 상담, 환불/보상/쿠폰 관련 요청(사고 문의 제외)이면 reply_text에는 전화번호 숫자를 직접 쓰지 말고 "전화 연결해 드릴까요?"처럼 버튼용 안내만 포함하세요.
- 영업시간(평일 09:00~17:00) 내에 연락 주시면 더 빠르게 안내드릴 수 있습니다.
- 환불/보상/쿠폰 지급처럼 확인이 필요한 요청은 담당 상담원이 확인 후 안내드리며, 필요 시 위 번호로 연락해 주세요.
[답변 규칙]
1) 항상 친절하고 간결하게 답변하세요 (3~5문장 이내)
2) 모르는 내용은 "담당 상담원이 확인 후 안내드리겠습니다"라고 안내하세요
3) 요금 관련 구체적 금액(거리별 요금)은 "앱 또는 전화 문의 바랍니다"로 안내하세요
4) 답변 마지막에 추가 질문 유도 문구를 붙이세요
5) 이모지는 사용하지 마세요
6) 한국어로만 답변하세요

[Output JSON Schema]
{
  "reply_text": "고객에게 보낼 최종 문구",
  "category": "일반문의|배차지연|기사불만|결제문의|분실물|환불요청|민감이슈|기타",
  "confidence": 0.0,
  "needs_human_handoff": false,
  "reason": "판단 근거 한 줄",
  "suggested_status": "pending|resolved"
}
`.trim();

function buildFallbackReply(complaintText: string) {
  const text = complaintText.trim();
  const t = text.toLowerCase();

  const needs = (kw: string) => t.includes(kw);

  const hours = "평일 09:00~17:00";

  const baseQuestion = "무엇부터 도와드릴까요?";

  // 교통사고·사고 → 전화 권장, 고객센터 안내, handoff true (과태료 분기보다 뒤에 두면 안 됨: 과태료를 먼저 처리)
  if (needs("교통사고") || needs("접촉사고") || needs("충돌") || needs("사고")) {
    const replyText = `고객님의 안전이 최우선입니다. 교통사고 관련 불편이 있으시면 고객센터(010-2184-8822)로 연락 주시면 신속히 도와드리겠습니다. 전화 상담을 권장드립니다. ${baseQuestion}`;
    return {
      reply_text: replyText,
      reply: replyText,
      category: "민감이슈",
      confidence: 0.35,
      needs_human_handoff: true,
      reason: "교통사고/사고 관련 키워드 감지(프롬프트 정책)",
      suggested_status: "pending",
    };
  }

  // 과태료 → 팩스·절차 안내, handoff false(상담 요청 시 아래 사람/전화 분기에서 true)
  if (needs("과태료") || needs("범칙금") || needs("부과서")) {
    const replyText = `과태료는 100% 처리 원칙입니다. 부과서 사본에 전화번호와 입금받을 계좌번호를 적어 팩스(031-247-1988)로 보내주시면 됩니다. 수신 후 최대 7일 정도 소요될 수 있습니다. ${baseQuestion}`;
    return {
      reply_text: replyText,
      reply: replyText,
      category: "일반문의",
      confidence: 0.35,
      needs_human_handoff: false,
      reason: "과태료 관련 키워드 감지(팩스·절차 안내 가능)",
      suggested_status: "pending",
    };
  }

  // 요청 분류(간단 키워드 기반)
  if (needs("환불") || needs("보상") || needs("쿠폰") || needs("마일리지 출금") || needs("출금")) {
    const replyText = `죄송합니다. 환불/보상/쿠폰/출금은 담당 상담원이 확인 후 안내드립니다. ${hours}에 전화 연결해 드릴 수 있어요. 전화 연결해 드릴까요? ${baseQuestion}`;
    return {
      reply_text: replyText,
      reply: replyText,
      category: "환불요청",
      confidence: 0.2,
      needs_human_handoff: true,
      reason: "환불/보상/쿠폰 관련 키워드 감지",
      suggested_status: "pending",
    };
  }

  if (needs("사람") || needs("상담") || needs("상담원") || needs("연결") || needs("대화") || needs("직원") || needs("전화") || needs("통화")) {
    const replyText = `불편을 드려 죄송합니다. 상담이 필요하시면 전화 연결해 드릴까요? ${hours}에 전화 연결이 가능합니다. ${baseQuestion}`;
    return {
      reply_text: replyText,
      reply: replyText,
      category: "민감이슈",
      confidence: 0.2,
      needs_human_handoff: true,
      reason: "사람 상담/연결 관련 키워드 감지",
      suggested_status: "pending",
    };
  }

  const replyText = `불편을 드려 죄송합니다. 접수 내용을 담당 상담원이 확인 후 안내드리겠습니다. 요금 관련 구체 금액은 앱 또는 전화로 안내드릴 수 있습니다. ${baseQuestion}`;
  return {
    reply_text: replyText,
    reply: replyText,
    category: "기타",
    confidence: 0.1,
    needs_human_handoff: false,
    reason: "일반문의 키워드 기반 기본 응답",
    suggested_status: "pending",
  };
}

function enforcePolicyOutput(parsed: Record<string, unknown>, complaintText: string) {
  const t = complaintText.trim().toLowerCase();
  const needs = (kw: string) => t.includes(kw);

  const fallbackGeneral = buildFallbackReply(complaintText);

  const replyRaw = typeof parsed.reply_text === "string" ? parsed.reply_text : "";
  let replyText = replyRaw.trim() || (typeof fallbackGeneral.reply_text === "string" ? fallbackGeneral.reply_text : "");

  // 이모지 제거
  replyText = replyText.replace(/\p{Extended_Pictographic}/gu, "");

  const isRefund =
    needs("환불") || needs("보상") || needs("쿠폰") || needs("마일리지 출금") || needs("출금");
  const isHuman =
    needs("사람") ||
    needs("상담") ||
    needs("상담원") ||
    needs("연결") ||
    needs("대화") ||
    needs("직원") ||
    needs("전화") ||
    needs("통화");

  const isAccident = needs("교통사고") || needs("접촉사고") || needs("충돌") || needs("사고");
  const isFine = needs("과태료") || needs("범칙금") || needs("부과서");

  if ((isRefund || isHuman) && !isAccident) {
    // reply_text 안에 전화번호 숫자가 섞여 들어가는 경우 제거
    replyText = replyText.replace(/\b010[-]?\d{4}[-]?\d{4}\b/g, "").trim();
    // UI 버튼용 안내 문구가 없으면 추가
    if (!replyText.includes("전화 연결")) {
      replyText = `${replyText} 전화 연결해 드릴까요?`;
    }
  }

  // 질문 유도 문구가 없으면 마지막에 추가(대체)
  if (!/[?？]/.test(replyText) && !replyText.includes("무엇")) {
    replyText = `${replyText} 무엇부터 도와드릴까요?`;
  }

  // 220자 제한
  if (replyText.length > 220) {
    replyText = replyText.slice(0, 219) + "...";
  }

  const category =
    isAccident
      ? "민감이슈"
      : isFine && !isHuman
        ? "일반문의"
        : isRefund
          ? "환불요청"
          : isHuman
            ? "민감이슈"
            : typeof parsed.category === "string"
              ? parsed.category
              : fallbackGeneral.category;

  let needs_human_handoff: boolean;
  if (isAccident) {
    needs_human_handoff = true;
  } else if (isFine && !isHuman) {
    needs_human_handoff = false;
  } else if (isRefund || isHuman) {
    needs_human_handoff = true;
  } else {
    needs_human_handoff =
      typeof parsed.needs_human_handoff === "boolean"
        ? parsed.needs_human_handoff
        : fallbackGeneral.needs_human_handoff;
  }

  const suggested_status =
    typeof parsed.suggested_status === "string"
      ? (parsed.suggested_status as string)
      : fallbackGeneral.suggested_status;

  return {
    reply_text: replyText,
    reply: replyText,
    category,
    confidence:
      typeof parsed.confidence === "number" ? parsed.confidence : fallbackGeneral.confidence,
    needs_human_handoff,
    reason:
      typeof parsed.reason === "string" ? parsed.reason : fallbackGeneral.reason,
    suggested_status:
      suggested_status === "resolved" || suggested_status === "pending" ? suggested_status : fallbackGeneral.suggested_status,
  };
}

function buildMileageReply(complaintText: string) {
  const t = complaintText.toLowerCase();
  const isWithdrawal = t.includes("출금") || t.includes("withdraw") || t.includes("출금조건");
  const isAccumulation =
    t.includes("적립") || t.includes("마일리지 적립") || t.includes("mileage") || t.includes("적립액");

  const isHumanRequest =
    t.includes("상담") || t.includes("사람") || t.includes("전화") || t.includes("연결") || t.includes("통화");

  // 마일리지 질문은 헛소리 방지 위해 규칙 기반 템플릿으로 강제
  const reply_text = [
    isAccumulation || !isWithdrawal ? "마일리지는 카드 결제 시 이용금액의 10%가 적립되고, 신규 가입 시 10,000원이 지급됩니다." : null,
    isWithdrawal ? "출금은 20,000원 이상(10,000원 단위)이며 수수료는 500원입니다." : null,
    "친구 추천 이벤트: 추천인 2,000원+첫 이용 3,000원, 2명 스타벅스 쿠폰 2장/5명 교촌치킨 세트.",
    isHumanRequest ? "상담이 필요하시면 전화 연결해 드릴까요?" : "원하시는 다음 안내가 있을까요?",
  ]
    .filter(Boolean)
    .join(" ");

  const reply = reply_text.replace(/\p{Extended_Pictographic}/gu, "");
  const replyTrimmed = reply.length > 220 ? reply.slice(0, 219) + "..." : reply;

  return {
    reply_text: replyTrimmed,
    reply: replyTrimmed,
    category: "기타",
    confidence: 0.95,
    needs_human_handoff: isHumanRequest,
    reason: "마일리지 관련 키워드는 규칙 기반 템플릿으로 고정",
    suggested_status: "pending",
  };
}

// POST /ai/chat (앱 사용자 인증 필요)
router.post("/chat", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res
        .status(500)
        .json({
          success: false,
          error: "OPENAI_API_KEY가 설정되지 않았습니다.",
        });
      return;
    }

    const complaintText = String(
      req.body?.complaint_text ?? req.body?.message ?? "",
    ).trim();
    const userContext = String(req.body?.user_context ?? "").trim();
    const policyContext = String(req.body?.policy_context ?? "").trim();
    const locale = String(req.body?.locale ?? "ko-KR").trim();

    if (!complaintText) {
      res
        .status(400)
        .json({ success: false, error: "complaint_text (또는 message) 필수" });
      return;
    }

    const mileageQuery =
      /마일리지|mileage|적립|출금|잔액/.test(complaintText) && !/환불|보상|쿠폰 지급|쿠폰|지급/.test(complaintText);
    // 마일리지 답변은 OpenAI 대신 규칙 기반으로 먼저 처리(헛소리 방지)
    if (mileageQuery) {
      res.status(200).json({ success: true, data: buildMileageReply(complaintText) });
      return;
    }

    const userInput = `
[User Input]
- complaint_text: ${complaintText}
- user_context: ${userContext || "(없음)"}
- policy_context: ${policyContext || "(없음)"}
- locale: ${locale || "ko-KR"}
`.trim();

    const openai = new OpenAI({ apiKey });
    // 쿼터/서버 이슈 파악용 로그
    console.log("[AI] calling OpenAI chat.completions.create");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInput },
      ],
      max_tokens: 300,
      response_format: { type: "json_object" },
    });
    console.log("[AI] OpenAI success:", completion.choices?.[0]?.message?.content?.slice(0, 30) ?? "");

    const content = completion.choices?.[0]?.message?.content?.trim() ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      parsed = {
        reply_text: content,
        category: "기타",
        confidence: 0,
        needs_human_handoff: false,
        reason: "JSON 파싱 실패로 원문 반환",
        suggested_status: "pending",
      };
    }

    const ensured = enforcePolicyOutput(
      typeof parsed === "object" && parsed != null ? (parsed as Record<string, unknown>) : {},
      complaintText,
    );
    res.json({ success: true, data: ensured });
  } catch (e) {
    console.error("[AI] OpenAI call failed:", e instanceof Error ? e.message : String(e));
    const fallback = buildFallbackReply(String(req.body?.complaint_text ?? req.body?.message ?? ""));
    // AI 생성이 실패해도 JSON 스키마 형태로 일관된 응답 제공
    res.status(200).json({ success: true, data: fallback });
  }
});

export default router;
