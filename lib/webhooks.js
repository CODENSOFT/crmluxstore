import { WEBHOOK_EVENTS } from "./constants";

const VALID = new Set(["*", ...WEBHOOK_EVENTS.map((e) => e.key)]);

export function cleanEvents(events) {
  const list = (Array.isArray(events) ? events : ["*"]).filter((e) => VALID.has(e));
  return list.length ? list : ["*"];
}
