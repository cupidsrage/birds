// Weekly content generation. Uses the Anthropic API when ANTHROPIC_API_KEY is
// set; otherwise falls back to shuffling a built-in pool so the app always works.
import { DESIRE_POOL, WISH_POOL, DECK } from "./content.js";

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

async function askClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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

const DECK_PROMPT = `Generate ONE card for a flirty question-and-dare game between two adult partners in a long-distance relationship who only see each other on weekends. Randomly choose either a "question" (something intimate, romantic, or playful to answer) or a "dare" (a small flirty action, sometimes involving sending a photo or voice note). Keep it warm and tasteful rather than explicit, under 25 words. Return ONLY a JSON object like {"type":"question","text":"..."} or {"type":"dare","text":"..."} with no other text.`;

export async function generateCard() {
  if (!API_KEY) return DECK[Math.floor(Math.random() * DECK.length)];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: DECK_PROMPT }],
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
