import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, access, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GENERAL_CALL, FAMILIAR_CALL } from "../shared/config/call-v4.mjs";
import { DRIVING_NARRATION } from "../shared/config/driving-v4.mjs";
import drivingRecommendations from "../shared/config/driving-recommendations.json" with { type: "json" };
import {
  GENERAL_MEETING,
  FAMILIAR_MEETING,
  TOGETHER_SCENE,
  OWN_QUESTIONS,
  OWN_CLOSINGS,
} from "../shared/config/ending-v4.mjs";
import {
  MESSAGES,
  FOLLOWUP,
  REPLIES,
  UNKNOWN,
  PEER_TOPIC_GENERAL,
  REPLY_DONE,
  profileAnswer,
} from "../shared/config/content-v4.mjs";
import { peer } from "../server/v4/social.mjs";

const directory = new URL("../assets/audio/prepared-v1/", import.meta.url);
const temp = new URL("../runtime/speech-generation/", import.meta.url);
await mkdir(directory, { recursive: true });
await mkdir(temp, { recursive: true });
const items = [
  { text: DRIVING_NARRATION },
  ...drivingRecommendations.entries.map((entry) => ({ text: entry.narration })),
  ...GENERAL_CALL,
  ...FAMILIAR_CALL,
  ...GENERAL_MEETING,
  ...FAMILIAR_MEETING,
  ...TOGETHER_SCENE,
  ...OWN_QUESTIONS.flatMap((x) =>
    [
      x.reply,
      ...Object.values(OWN_CLOSINGS).map((closing) => x.reply + " " + closing),
    ].map((text) => ({ text })),
  ),
  ...Object.values(MESSAGES).map((x) => ({ text: x.response })),
  ...[
    FOLLOWUP.text,
    ...Object.values(REPLIES),
    UNKNOWN,
    PEER_TOPIC_GENERAL,
    REPLY_DONE,
    profileAnswer("Q1", peer),
    profileAnswer("Q2", peer, ["sea_walk", "cafe"]),
    "반가워요. 저는 솔바람의 캐릭터예요. 만나기 전에 어떤 여행을 좋아하는지 편하게 물어봐 주세요.",
    "말할 주제가 생겼네. 더 알아가도 좋고, 잠깐 쉬어도 좋아. 다음은 네가 고르면 돼.",
    "대화는 잠깐 쉬어가요. 다시 이어갈 때 직접 골라 주세요.",
  ].map((text) => ({ text })),
];
const index = {
  version: 1,
  source: "prepared_synthetic_speech",
  language: "ko-KR",
  entries: [],
};
for (const item of items) {
  const text = item.text.normalize("NFC");
  const hash = createHash("sha256").update(text).digest("hex");
  if (index.entries.some((x) => x.sha256Text === hash)) continue;
  const file = `speech_${hash.slice(0, 24)}.m4a`,
    voice = item.speaker === "B" ? "Eddy (한국어(한국))" : "Yuna";
  const output = new URL(file, directory);
  try {
    await access(output);
    if ((await stat(output)).size < 1024) throw new Error("Empty prepared clip");
  } catch {
    const intermediate = new URL(hash + ".aiff", temp);
    execFileSync(
      "/usr/bin/say",
      ["-v", voice, "-r", "165", "-o", fileURLToPath(intermediate), text],
      { stdio: "pipe" },
    );
    try { execFileSync(
      "/usr/bin/afconvert",
      [
        "-f",
        "m4af",
        "-d",
        "aac ",
        "-b",
        "48000",
        fileURLToPath(intermediate),
        fileURLToPath(output),
      ],
      { stdio: "pipe" },
    ); } catch {
      // Some macOS hosts do not expose the AAC encoder to afconvert.
      execFileSync("ffmpeg", ["-nostdin", "-y", "-i", fileURLToPath(intermediate),
        "-c:a", "aac", "-b:a", "48k", fileURLToPath(output)], { stdio: "pipe" });
    }
    if ((await stat(output)).size < 1024) throw new Error("Speech synthesis produced an empty clip");
  }
  index.entries.push({
    file,
    sha256Text: hash,
    text,
    speaker: item.speaker || "agent",
    voice,
    sourceKind: item.id?.startsWith("call_")
      ? "call_sample"
      : "prepared_narration",
  });
}
await writeFile(
  new URL("index.json", directory),
  JSON.stringify(index, null, 2) + "\n",
);
console.log(`Prepared speech: ${index.entries.length} local clips`);

const manifestPath = new URL("../shared/assets-manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.schemaVersion = 4;
// Audio regeneration must preserve the selected image assets and character metadata.
const meetingTexts = new Set(
  [...GENERAL_MEETING, ...FAMILIAR_MEETING, ...TOGETHER_SCENE].map(
    (x) => x.text,
  ),
);
const messageTexts = new Set([
  ...Object.values(MESSAGES).map((x) => x.response),
  FOLLOWUP.text,
]);
manifest.audioCues = Object.fromEntries(
  index.entries.map((entry) => {
    const assetId = entry.file.slice(0, -4);
    const sourceKind =
      entry.sourceKind === "call_sample"
        ? "call_sample"
        : meetingTexts.has(entry.text)
          ? "meeting_reenactment"
          : messageTexts.has(entry.text)
            ? "peer_message_fixture"
            : entry.text.startsWith("반가워요. 저는 솔바람") ||
                entry.text === UNKNOWN ||
                entry.text === PEER_TOPIC_GENERAL ||
                entry.text === profileAnswer("Q1", peer) ||
                entry.text === profileAnswer("Q2", peer, ["sea_walk", "cafe"])
              ? "peer_agent"
              : "own_agent";
    return [
      assetId,
      {
        assetId,
        kind: "audio",
        path: "assets/audio/prepared-v1/" + entry.file,
        captionId: assetId,
        text: entry.text,
        speaker: entry.speaker,
        sourceKind,
        requiredPublicFields:
          entry.text === profileAnswer("Q1", peer)
            ? ["interests", "pace", "activityPreference", "expressionPresetIds"]
            : entry.text === profileAnswer("Q2", peer, ["sea_walk", "cafe"]) ||
                entry.text === PEER_TOPIC_GENERAL
              ? ["interests", "conversationStyle"]
              : [],
        styleVariant: entry.text.includes("ㅎㅎ") ? "light_humor" : "neutral",
        playbackSource: "prepared_synthetic_speech",
      },
    ];
  }),
);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
