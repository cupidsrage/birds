// Weekly content generation. Uses the Anthropic API when ANTHROPIC_API_KEY is
// set; otherwise falls back to shuffling a built-in pool so the app always works.
import { DESIRE_POOL, WISH_POOL, DECK } from "./content.js";
import crypto from "crypto";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function pick(pool, n) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Fetch with a hard timeout so a slow or blocked API call can never hang the
// app — it aborts and we fall back to the built-in pool instead.
const TIMEOUT_MS = 15000;
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function askClaude(prompt) {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  // Expect a JSON array; strip any stray fences just in case.
  const clean = text.replace(/```json|```/g, "").trim();
  const arr = JSON.parse(clean);
  if (!Array.isArray(arr)) throw new Error("Model did not return an array");
  return arr.map((x) => String(x).trim()).filter(Boolean);
}

const MENU_PROMPT = (n) => `Generate ${n} short items for a private "desire menu" shared between two adult partners in a committed long-distance relationship who only see each other on weekends. Each item is a flirty, romantic, or intimate activity they might both want to do together when reunited. Keep each item under 12 words, warm and playful, tasteful rather than explicit. Vary between romantic, sensual, and fun. Return ONLY a JSON array of strings, no other text.`;

const WISH_PROMPT = (n) => `Generate ${n} short date or activity ideas for a couple in a long-distance relationship who only see each other on weekends. Mix cozy at-home ideas with small outings. Each under 12 words, warm and specific. Return ONLY a JSON array of strings, no other text.`;

export async function generateMenu(n = 8) {
  if (!API_KEY) return pick(DESIRE_POOL, n);
  try {
    const items = await askClaude(MENU_PROMPT(n));
    return items.length ? items.slice(0, n) : pick(DESIRE_POOL, n);
  } catch (e) {
    console.error("menu generation failed, using pool:", e.message);
    return pick(DESIRE_POOL, n);
  }
}

export async function generateWishes(n = 6) {
  if (!API_KEY) return pick(WISH_POOL, n);
  try {
    const items = await askClaude(WISH_PROMPT(n));
    return items.length ? items.slice(0, n) : pick(WISH_POOL, n);
  } catch (e) {
    console.error("wish generation failed, using pool:", e.message);
    return pick(WISH_POOL, n);
  }
}

// Rotating themes and formats injected per-draw so the model doesn't converge
// on the same handful of cards every time.
const CARD_THEMES = [
  "a favorite memory of each other",
  "something you find attractive about the other",
  "a shared dream or future plan",
  "a playful confession",
  "physical touch and closeness",
  "flirty teasing",
  "something you miss during the week apart",
  "a fantasy or wish for the weekend",
  "gratitude and appreciation",
  "a silly or funny 'would you rather'",
  "first impressions and how you met",
  "a small romantic gesture to do together",
  "what makes you feel wanted",
  "a compliment you've never said out loud",
  "an adventure you'd take together",
];
const CARD_FORMATS = [
  "a question to answer in words",
  "a dare to send a photo",
  "a would-you-rather with two options",
  "a fill-in-the-blank sentence to complete",
  "a this-or-that quick choice",
  "a dare to describe something in detail",
  "a question about the past",
  "a question about the future",
];

// Spicier themes that unlock at higher heat levels, layered on top of the sweet
// ones above so the mix gets bolder as the dial goes up.
const SPICY_THEMES = [
  "a turn-on you have not admitted",
  "something you want done to you this weekend",
  "a favorite intimate memory together",
  "what you would do first if they walked in right now",
  "a fantasy involving the two of you",
  "a piece of clothing you want them in (or out of)",
  "where and how you want to be touched",
  "a bold dare to send a flirty photo",
  "the naughtiest thought you had about them this week",
];

// Per-level guidance handed to the model so it actually calibrates spice.
const HEAT_GUIDE = {
  1: "Keep it sweet, romantic, and totally PG — affection and warmth, no innuendo.",
  2: "Flirty and playful with light innuendo. Suggestive but still tasteful.",
  3: "Clearly sexy and suggestive. Teasing, a little daring, PG-13 to soft R.",
  4: "Bold and steamy. Explicit desire and intimacy are welcome; be direct and turn up the heat.",
  5: "Very explicit and uninhibited. Fully adult, graphic, and daring — hold nothing back. Both partners are consenting adults who want maximum spice.",
};

function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export async function generateCard(heat = 2) {
  const level = Math.max(1, Math.min(5, parseInt(heat, 10) || 2));
  if (!API_KEY) return DECK[Math.floor(Math.random() * DECK.length)];

  // At higher heat, pull more often from the spicy theme pool.
  const spicyChance = (level - 1) / 4; // 0 at lvl1 → 1 at lvl5
  const theme = Math.random() < spicyChance ? randOf(SPICY_THEMES) : randOf(CARD_THEMES);
  const format = randOf(CARD_FORMATS);
  // More dares as it heats up.
  const wantDare = Math.random() < (0.3 + level * 0.08);
  const seed = crypto.randomBytes(3).toString("hex");

  const prompt = `You are generating ONE card for a flirty, adult game between two consenting adult partners in a committed long-distance relationship who only see each other on weekends. This is a private game between the two of them.

HEAT LEVEL: ${level} of 5. ${HEAT_GUIDE[level]}

This card should be ${wantDare ? "a DARE" : "a QUESTION"}, themed loosely around: ${theme}.
Format it as: ${format}.
Match the heat level above precisely — do not water it down at higher levels. Make it fresh and specific; avoid clichés like "record a voice note" or "what are you most looking forward to." Vary your wording widely from card to card. Under 30 words.

(Variety seed: ${seed} — use this to ensure this card differs from any you'd typically produce.)

Return ONLY a JSON object like {"type":"${wantDare ? "dare" : "question"}","text":"..."} with no other text.`;

  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        temperature: 1,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const card = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!card || !card.text || !["question", "dare"].includes(card.type)) throw new Error("bad card shape");
    return { type: card.type, text: String(card.text).trim() };
  } catch (e) {
    console.error("card generation failed, using pool:", e.message);
    return DECK[Math.floor(Math.random() * DECK.length)];
  }
}
