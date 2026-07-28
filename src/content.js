// Fallback pools, used when ANTHROPIC_API_KEY is not set (or generation fails).
// When a key IS set, fresh items are generated each week instead.

export const DESIRE_POOL = [
  "Long slow morning in bed with no plans",
  "Give each other massages",
  "Take a bath or shower together",
  "Try a new spot in the house",
  "Blindfolds",
  "Send each other a photo during the week",
  "A slow dance in the kitchen",
  "Read something out loud to each other",
  "Roleplay — pretend we just met",
  "Make out like teenagers on the couch",
  "Try a new toy together",
  "One person is fully in charge for the night",
  "Leave love notes hidden around the place",
  "Cook something together undressed",
  "A weekend with phones in a drawer",
  "Feed each other dessert in bed",
  "Write down a fantasy and swap",
  "Slow undressing, no rushing",
  "Trade shoulder rubs by candlelight",
  "Whisper what you missed all week",
];

export const WISH_POOL = [
  "Cook a new recipe together",
  "Sunday morning farmers market",
  "Build a blanket fort and watch movies",
  "Go for a long drive with no destination",
  "Try a new coffee shop",
  "Cook breakfast in bed for each other",
  "Take a walk somewhere green",
  "Do a puzzle over wine",
  "Picnic in the park",
  "Stargaze from the backyard",
  "Redecorate one corner of the place together",
  "Play a board game, loser owes a favor",
  "Bake something from scratch",
  "Visit somewhere neither of you has been",
  "Have a no-screens dinner by candlelight",
];

// Flirty / spicy question & dare deck (this stays fixed).
export const DECK = [
  { type: "question", text: "What's the first thing you noticed about me?" },
  { type: "question", text: "What's a fantasy you've never told me?" },
  { type: "question", text: "Where's your favorite place to be kissed?" },
  { type: "question", text: "What did you think about me this week?" },
  { type: "question", text: "What's something I do that drives you wild?" },
  { type: "question", text: "Describe our best night together in one sentence." },
  { type: "question", text: "What are you most looking forward to this weekend?" },
  { type: "question", text: "What's a small thing that makes you feel wanted?" },
  { type: "dare", text: "Send a voice note saying what you'd do if I were there now." },
  { type: "dare", text: "Send a photo of what you're wearing right now." },
  { type: "dare", text: "Text me the moment you'll want most this weekend." },
  { type: "dare", text: "Set a reminder to tell me one thing you love, at a random time." },
  { type: "dare", text: "Describe, in detail, the first five minutes we're together again." },
];
