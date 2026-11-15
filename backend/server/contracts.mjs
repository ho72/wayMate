import Ajv from "ajv";
import { CHARACTER_IDS } from "../../mobile-web/shared/characters.mjs";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const error = (status, code, message) =>
  Object.assign(new Error(message), { status, code });
const str = (maxLength, minLength = 1) => ({
  type: "string",
  minLength,
  maxLength,
});
const date = { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const profileSchema = object({
  displayName: str(30),
  avatar: { enum: CHARACTER_IDS, type: "string" },
  interests: { type: "array", maxItems: 12, uniqueItems: true, items: str(40) },
  travelStyle: str(300, 0),
  about: str(500, 0),
});
export const preferenceSchema = object({
  interests: { type: "array", maxItems: 12, uniqueItems: true, items: str(40) },
  travelStyle: str(300, 0),
  about: str(500, 0),
});
export const planSchema = object({
  title: str(80),
  destination: str(100),
  startDate: date,
  endDate: date,
  summary: str(800),
  days: {
    type: "array",
    minItems: 1,
    maxItems: 14,
    items: object({
      dayNumber: { type: "integer", minimum: 1, maximum: 14 },
      date,
      stops: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: object({
          time: {
            type: ["string", "null"],
            pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
          },
          title: str(100),
          description: str(500),
          category: {
            type: "string",
            enum: [
              "walk",
              "cafe",
              "food",
              "culture",
              "nature",
              "rest",
              "drive",
            ],
          },
          placeQuery: { type: ["string", "null"], maxLength: 150 },
        }),
      },
    }),
  },
  notes: { type: "array", maxItems: 12, items: str(300) },
});
const ajv = new Ajv({ allErrors: false, strict: false });
const validators = {
  profile: ajv.compile(profileSchema),
  preferences: ajv.compile(preferenceSchema),
  trip: ajv.compile(planSchema),
};
export function validate(kind, data) {
  if (!validators[kind]?.(data))
    throw error(422, "INVALID_INPUT", "입력 내용을 다시 확인해 주세요.");
  if (kind === "trip") {
    const validDate = (x) =>
      x === null ||
      (!Number.isNaN(Date.parse(x)) &&
        new Date(x).toISOString().slice(0, 10) === x);
    if (
      ![data.startDate, data.endDate, ...data.days.map((x) => x.date)].every(
        validDate,
      )
    )
      throw error(422, "INVALID_DATE", "여행 날짜를 다시 확인해 주세요.");
    if (
      data.startDate &&
      data.endDate &&
      (data.startDate > data.endDate ||
        (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86400000 > 13)
    )
      throw error(
        422,
        "INVALID_DATE",
        "여행은 최대 14일 범위로 정리해 주세요.",
      );
    if (
      data.startDate &&
      data.endDate &&
      data.days.length !==
        (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86400000 + 1
    )
      throw error(
        422,
        "INVALID_DATE",
        "여행 기간에 맞게 날짜별 일정을 정리해 주세요.",
      );
    const datedDay = data.days.find((day) => day.date);
    const anchor = data.startDate
      ? Date.parse(data.startDate)
      : datedDay
        ? Date.parse(datedDay.date) - (datedDay.dayNumber - 1) * 86400000
        : null;
    for (const [index, day] of data.days.entries()) {
      if (
        day.dayNumber !== index + 1 ||
        (day.date &&
          anchor !== null &&
          Date.parse(day.date) !== anchor + index * 86400000) ||
        (day.date &&
          ((data.startDate && day.date < data.startDate) ||
            (data.endDate && day.date > data.endDate)))
      )
        throw error(
          422,
          "INVALID_DATE",
          "날짜와 일정 순서를 다시 확인해 주세요.",
        );
    }
  }
  return data;
}
export function providerSchema(schema) {
  const value = structuredClone(schema);
  const visit = (x) => {
    if (!x || typeof x !== "object") return;
    delete x.uniqueItems;
    Object.values(x).forEach((v) =>
      Array.isArray(v) ? v.forEach(visit) : visit(v),
    );
  };
  visit(value);
  return value;
}
