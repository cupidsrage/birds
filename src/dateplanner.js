// AI-powered date planner. Two-stage:
//   1) Ask the model what KINDS of stops fit the city/time/duration/vibe.
//   2) Look up real places for each stop via Google Places (ratings, hours).
//   3) Ask the model to arrange them into a timed, narrated itinerary.
// Falls back to AI-only suggestions when no Google Places key is set.

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const PLACES_KEY = process.env.GOOGLE_PLACES_KEY;

const TIMEOUT_MS = 20000;
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function askClaude(prompt, maxTokens = 1500) {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return text;
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  // Grab the first {...} or [...] block to be safe.
  const start = clean.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found");
  return JSON.parse(clean.slice(start));
}

// ---- Google Places (New) Text Search ----
async function searchPlace(query, city) {
  if (!PLACES_KEY) return null;
  try {
    const res = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.currentOpeningHours.weekdayDescriptions,places.priceLevel,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: `${query} in ${city}`, maxResultCount: 3 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = (data.places || [])[0];
    if (!p) return null;
    return {
      name: p.displayName?.text || query,
      address: p.formattedAddress || "",
      rating: p.rating || null,
      ratingCount: p.userRatingCount || null,
      hours: p.currentOpeningHours?.weekdayDescriptions || null,
      mapsUrl: p.googleMapsUri || null,
      priceLevel: p.priceLevel || null,
    };
  } catch {
    return null;
  }
}

const VIBES = {
  romantic: "romantic and intimate — cozy spots, scenic views, candlelit dinners, places to slow down together",
  adventurous: "adventurous and active — outdoor activities, exploring, something a little daring or novel",
  chill: "relaxed and low-key — easygoing spots, no rush, comfortable and casual",
  foodie: "food-focused — standout restaurants, tastings, markets, dessert, a culinary journey",
  cultural: "arts and culture — museums, galleries, historic sites, live music or theater",
  fun: "playful and fun — games, activities, lively spots, lots to laugh about together",
};

// Main entry. Returns { title, narrative, stops: [{name,time,duration,why,...place}] }.
export async function planDate({ city, date, time, durationHours, vibe }) {
  if (!API_KEY) {
    return { error: "The date planner needs an AI key to work. Ask whoever set up the app to add ANTHROPIC_API_KEY." };
  }
  const vibeDesc = VIBES[vibe] || VIBES.romantic;

  // Stage 1: what kinds of stops fit?
  const planPrompt = `Plan a date itinerary for a couple in ${city}.
Start: ${date} at ${time}. Total duration: about ${durationHours} hours.
Vibe: ${vibeDesc}.

Decide on a sequence of 2-5 stops that fit naturally in the time available and flow well together (e.g. an activity, then dinner, then a drink). For each stop, give a short search query I can use to find a REAL matching venue in ${city} (be specific to the city and vibe, e.g. "rooftop cocktail bar downtown" or "waterfront seafood restaurant").

Return ONLY a JSON array like:
[{"kind":"activity","query":"...","minutes":60},{"kind":"dinner","query":"...","minutes":90}]
No other text.`;

  let skeleton;
  try {
    skeleton = parseJSON(await askClaude(planPrompt, 800));
    if (!Array.isArray(skeleton) || !skeleton.length) throw new Error("bad skeleton");
  } catch (e) {
    return { error: "Couldn't design the plan. Try again in a moment." };
  }

  // Stage 2: look up a real place for each stop (if Places is configured).
  const stops = [];
  for (const s of skeleton.slice(0, 5)) {
    const place = await searchPlace(s.query || s.kind, city);
    stops.push({ kind: s.kind, query: s.query, minutes: s.minutes || 60, place });
  }

  // Stage 3: arrange into a narrated, timed itinerary using the real places.
  const placeLines = stops.map((s, i) => {
    if (s.place) {
      return `${i + 1}. [${s.kind}] ${s.place.name} — ${s.place.address}${s.place.rating ? ` (rated ${s.place.rating})` : ""}`;
    }
    return `${i + 1}. [${s.kind}] (suggest a well-known ${s.query || s.kind} in ${city})`;
  }).join("\n");

  const arrangePrompt = `Create a warm, romantic date itinerary for a couple in ${city} starting ${date} at ${time}, lasting about ${durationHours} hours. Vibe: ${vibeDesc}.

Use these real venues in order:
${placeLines}

Return ONLY JSON:
{"title":"short evocative title","narrative":"2-3 sentence intro to the evening","stops":[{"name":"venue name","arrival":"7:00 PM","why":"one warm sentence on why this stop and what to do here"}]}
Keep each "why" under 30 words. Match the number of stops to the venues above, in the same order.`;

  let arranged;
  try {
    arranged = parseJSON(await askClaude(arrangePrompt, 1200));
  } catch {
    // Fall back to a simple assembly if the model's final pass fails.
    arranged = {
      title: `Your ${vibe} date in ${city}`,
      narrative: "",
      stops: stops.map((s) => ({ name: s.place?.name || s.query, arrival: "", why: "" })),
    };
  }

  // Merge the real place data (address, rating, hours, maps link) back in by order.
  const merged = (arranged.stops || []).map((st, i) => ({
    ...st,
    ...(stops[i]?.place ? {
      address: stops[i].place.address,
      rating: stops[i].place.rating,
      ratingCount: stops[i].place.ratingCount,
      hours: stops[i].place.hours,
      mapsUrl: stops[i].place.mapsUrl,
      priceLevel: stops[i].place.priceLevel,
    } : {}),
  }));

  return {
    title: arranged.title || `Your date in ${city}`,
    narrative: arranged.narrative || "",
    stops: merged,
    usedRealPlaces: !!PLACES_KEY,
  };
}
