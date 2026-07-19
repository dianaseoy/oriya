/* Rally scripts — invented mini-conversations between friends, grouped by
 * identity for the who-are-you picker (index.html #overheard). The product is
 * never explained, only overheard. Every surface that renders these MUST
 * carry a sample/mock label (honesty gate: no fake users, no fake traction) —
 * current label copy: "Mock chatter — yours goes here". Lines alternate
 * speakers strictly: even index = first voice, odd = second. Keys match the
 * worker's ORI_WHO whitelist so the "Talk to Ori" CTA can carry ?who=<key>.
 * Zero dependencies. */

var RALLY = {
  founder: {
    label: "Founder",
    ori: "a founder's week",
    convos: [
      { tag: "founders · 8:12 AM", lines: [
        "I'm running on four hours.",
        "Still going to the gym?",
        "I was. Ori said today isn't the day to prove anything.",
        "…so?",
        "Coffee. Walk. Survive launch.",
        "Honestly? Smarter." ] },
      { tag: "founders · after the pitch", lines: [
        "How'd it go?",
        "Bombed.",
        "You okay?",
        "Actually, yeah. Ori's been saying my stress was climbing all week.",
        "So?",
        "Turns out today wasn't about the pitch." ] },
      { tag: "cofounders · 11 PM", lines: [
        "We ship Thursday.",
        "Sleep tonight then.",
        "Can't. Wired.",
        "Your par can tell, you know. It always tells." ] }
    ] },

  nurse: {
    label: "Night-shift nurse",
    ori: "a night-shift week",
    convos: [
      { tag: "nurses · shift change", lines: [
        "How do you even track sleep on nights?",
        "Against my own usual. Nobody else's.",
        "Which is chaos.",
        "And I'm beating it." ] },
      { tag: "night shift · 7:40 AM", lines: [
        "Everyone posted their scores an hour ago.",
        "Your morning starts at 7 PM. It counts at 7 PM.",
        "That's allowed?",
        "Your usual, your par. Chaos included." ] },
      { tag: "break room · day three", lines: [
        "Three twelves in a row.",
        "And you still posted?",
        "Under par all week — but logged every one.",
        "That's the flex, honestly." ] }
    ] },

  runner: {
    label: "Marathon runner",
    ori: "a marathon block",
    convos: [
      { tag: "running club · saturday", lines: [
        "You skipped your run?",
        "Delayed it. Ori noticed my HRV had been sliding all week.",
        "You never do that.",
        "Ran it today instead. PR'd." ] },
      { tag: "running club · race week", lines: [
        "Race week. I feel lazy.",
        "You're not lazy, you're tapering.",
        "Ori said the same thing.",
        "Then it's two against one. Sit down." ] },
      { tag: "long-run group · 8 PM", lines: [
        "Twenty miles tomorrow.",
        "Bedtime then.",
        "It's eight o'clock.",
        "Exactly." ] }
    ] },

  parent: {
    label: "New parent",
    ori: "a new parent's nights",
    convos: [
      { tag: "new parents · 6:05 AM", lines: [
        "You look exhausted.",
        "Baby was up every two hours.",
        "Still posting your card?",
        "Especially today.",
        "Winning?",
        "Surviving. It counts." ] },
      { tag: "new parents · 5:40 AM", lines: [
        "Four wake-ups. FOUR.",
        "And you still posted?",
        "The streak's the only thing I control right now.",
        "Honestly? Iconic." ] },
      { tag: "family chat · sunday", lines: [
        "Dad. You're on the board?",
        "Your brother put me on.",
        "You have a nine-day streak??",
        "I nap with intent." ] }
    ] },

  oncall: {
    label: "On-call engineer",
    ori: "an on-call rotation",
    convos: [
      { tag: "on-call · 3:14 AM", lines: [
        "Paged at three.",
        "Prod okay?",
        "Prod's thriving. I'm in ruins.",
        "Post it anyway — wrecked mornings count double in my book." ] },
      { tag: "on-call · handoff day", lines: [
        "You're off rotation?",
        "Handed the pager over at nine.",
        "Celebrating?",
        "Ori says my body's been bracing for two weeks. So: bed." ] },
      { tag: "coworkers · standup", lines: [
        "You muted the group chat?",
        "The scores drop at eight.",
        "And?",
        "I can't take three green mornings from Marcus in a row." ] }
    ] },

  travel: {
    label: "Road warrior",
    ori: "a road warrior's week",
    convos: [
      { tag: "coworkers · off the red-eye", lines: [
        "Jet lag?",
        "Tokyo yesterday.",
        "Thought so.",
        "Ori basically said my body's still somewhere over the Pacific.",
        "Fair." ] },
      { tag: "consultants · wednesday", lines: [
        "Three cities in four days.",
        "Your poor par.",
        "It's holding. Barely.",
        "Defend it. We need you Monday." ] },
      { tag: "travel buddies · arrivals", lines: [
        "Landed. Everything hurts.",
        "Post it anyway.",
        "It's ugly.",
        "Ugly counts. That's the whole point." ] }
    ] }
};
