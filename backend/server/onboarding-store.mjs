import { error, validate } from "./contracts.mjs";
import { CHARACTER_IDS } from "../../mobile-web/shared/characters.mjs";

export function installOnboardingSchema(db) {
  // Additive schema: older accounts have no row and keep their existing entry flow.
  db.exec(`CREATE TABLE IF NOT EXISTS onboarding (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phase TEXT NOT NULL DEFAULT 'character',
    chat_id TEXT REFERENCES chats(id),
    draft_id TEXT REFERENCES drafts(id),
    version INTEGER NOT NULL DEFAULT 1
  )`);
}

export function onboardingStore({ q, run, transaction, repo }) {
  const state = (user) => {
    const row = q("SELECT * FROM onboarding WHERE user_id=?", user);
    if (!row) return null;
    return {
      phase: row.phase,
      version: row.version,
      chatId: row.chat_id,
      draftId: row.draft_id,
      answerCount: row.chat_id
        ? q("SELECT COUNT(*) AS n FROM turns WHERE user_id=? AND chat_id=? AND status='completed'", user, row.chat_id).n
        : 0,
    };
  };
  const data = (user) => {
    const onboarding = state(user);
    const draft = onboarding?.draftId
      ? q("SELECT id,body,status FROM drafts WHERE id=? AND user_id=?", onboarding.draftId, user)
      : null;
    return {
      user: repo.getUser(user),
      onboarding,
      chat: onboarding?.chatId ? repo.chat(user, onboarding.chatId) : null,
      draft: draft ? { id: draft.id, body: JSON.parse(draft.body), status: draft.status } : null,
    };
  };
  return {
    onboardingState: state,
    onboardingData: data,
    startOnboarding(user, { avatar, version }) {
      if (!CHARACTER_IDS.includes(avatar) || !Number.isInteger(version))
        throw error(422, "INVALID_INPUT", "함께할 친구를 골라 주세요.");
      return transaction(() => {
        const current = state(user);
        if (!current) throw error(409, "ONBOARDING_UNAVAILABLE", "이미 사용 중인 계정이에요. 마이에서 친구를 바꿀 수 있어요.");
        if (current.phase !== "character") {
          if (repo.getUser(user).profile.avatar === avatar) return data(user);
          throw error(409, "ONBOARDING_CONFLICT", "친구 설정이 바뀌었어요. 새로 확인해 주세요.");
        }
        if (current.version !== version)
          throw error(409, "VERSION_CONFLICT", "다른 화면의 설정을 다시 확인해 주세요.");
        const account = repo.getUser(user);
        repo.profile(user, { ...account.profile, avatar }, account.profileVersion);
        const chat = repo.newChat(user);
        run("UPDATE chats SET title=? WHERE id=?", "나를 알아가는 첫 이야기", chat.id);
        run("UPDATE onboarding SET phase='survey',chat_id=?,version=version+1 WHERE user_id=?", chat.id, user);
        return data(user);
      });
    },
    recordOnboardingDraft(user, chatId, drafts) {
      const draft = drafts.filter((d) => d.kind === "preferences").at(-1);
      if (draft)
        run("UPDATE onboarding SET phase='review',draft_id=?,version=version+1 WHERE user_id=? AND chat_id=? AND phase IN ('survey','review')", draft.id, user, chatId);
    },
    onboardingConfirmed(user, draftId) {
      run("UPDATE onboarding SET phase='completed',version=version+1 WHERE user_id=? AND draft_id=? AND phase='review'", user, draftId);
    },
    completeOnboarding(user, { draftId, version, profileVersion, preferences }) {
      validate("preferences", preferences);
      if (!Number.isInteger(version) || !Number.isInteger(profileVersion) || typeof draftId !== "string")
        throw error(422, "INVALID_INPUT", "요약 내용을 다시 확인해 주세요.");
      return transaction(() => {
        const current = state(user);
        if (current?.phase === "completed" && current.draftId === draftId) return data(user);
        if (current?.phase !== "review" || current.version !== version || current.draftId !== draftId)
          throw error(409, "ONBOARDING_CONFLICT", "새로운 요약이 있어요. 내용을 다시 확인해 주세요.");
        if (q("SELECT id FROM turns WHERE user_id=? AND chat_id=? AND status='pending'", user, current.chatId))
          throw error(409, "TURN_PENDING", "이야기가 끝난 뒤 요약을 확인해 주세요.");
        const draft = q("SELECT * FROM drafts WHERE id=? AND user_id=? AND chat_id=? AND kind='preferences'", draftId, user, current.chatId);
        if (!draft) throw error(404, "NOT_FOUND", "확인할 요약을 찾지 못했어요.");
        const account = repo.getUser(user);
        repo.profile(user, { ...account.profile, ...preferences }, profileVersion);
        run("UPDATE drafts SET body=?,status='confirmed',confirmed_id=? WHERE id=? AND user_id=?", JSON.stringify(preferences), user, draftId, user);
        repo.onboardingConfirmed(user, draftId);
        return data(user);
      });
    },
  };
}
