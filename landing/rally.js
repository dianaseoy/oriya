/* Rally scripts — invented mini-conversations between friends, grouped by
 * identity for the who-are-you picker (index.html #overheard). The product is
 * never explained, only overheard. Every surface that renders these MUST
 * carry a sample/mock label (honesty gate: no fake users, no fake traction) —
 * current label copy: "Mock chatter — yours goes here". Lines alternate
 * speakers strictly: even index = first voice, odd = second. Keys match the
 * worker's ORI_WHO whitelist so the "Talk to Ori" CTA can carry ?who=<key>.
 * One scenario per identity — each one carries the same idea: you're only ever
 * ranked against your own par, never anyone else's raw number. Zero deps. */

var RALLY = {
  founder: {
    label: "Founder",
    ori: "a founder's week",
    convos: [
      { tag: "founders · 8:12 AM", lines: [
        "Running on four hours. Still hitting the gym?",
        "Ori says today isn't the day to prove anything.",
        "So what's the move?",
        "Coffee, a walk, and I still logged it. Under my own par, but logged.",
        "That counts?",
        "It's the only number that's actually mine." ] }
    ] },

  nurse: {
    label: "Night-shift nurse",
    ori: "a night-shift week",
    convos: [
      { tag: "night shift · 7:40 AM", lines: [
        "Everyone posted their scores an hour ago.",
        "Your morning starts at 7 PM. It counts at 7 PM.",
        "Even off a triple shift?",
        "You're only ever up against your own usual. Chaos included." ] }
    ] },

  runner: {
    label: "Marathon runner",
    ori: "a marathon block",
    convos: [
      { tag: "running club · saturday", lines: [
        "You skipped your run?",
        "Delayed it. Ori saw my HRV sliding under par all week.",
        "You never do that.",
        "Ran it today instead. Beat my own par by nine." ] }
    ] },

  parent: {
    label: "New parent",
    ori: "a new parent's nights",
    convos: [
      { tag: "new parents · 6:05 AM", lines: [
        "You look wrecked.",
        "Baby was up every two hours.",
        "Still posting your card?",
        "Especially today. Surviving is over par on a night like that.",
        "Winning?",
        "Against my own usual? Yeah." ] }
    ] },

  oncall: {
    label: "On-call engineer",
    ori: "an on-call rotation",
    convos: [
      { tag: "on-call · 3:14 AM", lines: [
        "Paged at three. I'm in ruins.",
        "Prod okay?",
        "Prod's thriving. My recovery's shot.",
        "Post it anyway. You're only up against your own par, and a wrecked night still logs." ] }
    ] },

  travel: {
    label: "Road warrior",
    ori: "a road warrior's week",
    convos: [
      { tag: "coworkers · off the red-eye", lines: [
        "Jet lag?",
        "Tokyo yesterday. Body's still somewhere over the Pacific.",
        "Thought so.",
        "Ori moved my par to match. I'm not racing anyone but yesterday-me." ] }
    ] }
};
