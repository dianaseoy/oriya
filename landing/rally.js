/* Rally scripts — 50 invented mini-conversations between friends, 2–5
 * exchanges each. The product is never explained, only overheard. Every
 * surface that renders these MUST carry the "invented / sample" label
 * (honesty gate: no fake users, no fake traction). Lines alternate speakers
 * strictly: even index = first voice, odd index = second voice.
 * Consumed by index.html and play.html; zero dependencies. */

var RALLY = [
  { tag: "founders · 8:12 AM", lines: [
    "I'm running on four hours.",
    "Still going to the gym?",
    "I was. Ori said today isn't the day to prove anything.",
    "…so?",
    "Coffee. Walk. Survive launch.",
    "Honestly? Smarter." ] },

  { tag: "coworkers · monday", lines: [
    "My Whoop says recover. My Oura says rest.",
    "And?",
    "Apple says I slept great.",
    "So who's lying?",
    "Nobody, apparently. Ori explained why." ] },

  { tag: "gym friends · 7:30 AM", lines: [
    "How'd you get an 81?",
    "That's actually bad. I'm usually 92.",
    "Oh.",
    "You beat your own baseline today, though.",
    "…that's way cooler." ] },

  { tag: "running club · saturday", lines: [
    "You skipped your run?",
    "Delayed it. Ori noticed my HRV had been sliding all week.",
    "You never do that.",
    "Ran it today instead. PR'd." ] },

  { tag: "new parents · 6:05 AM", lines: [
    "You look exhausted.",
    "Baby was up every two hours.",
    "Still posting your card?",
    "Especially today.",
    "Winning?",
    "Surviving. It counts." ] },

  { tag: "roommates · sunday", lines: [
    "I didn't close my rings.",
    "Good.",
    "…good?",
    "Apparently recovery counts too." ] },

  { tag: "coworkers · off the red-eye", lines: [
    "Jet lag?",
    "Tokyo yesterday.",
    "Thought so.",
    "Ori basically said my body's still somewhere over the Pacific.",
    "Fair." ] },

  { tag: "couple · 7:58 AM", lines: [
    "You beat me again.",
    "No.",
    "Look.",
    "You recovered better than you usually do. Different game." ] },

  { tag: "gym friends · leg day", lines: [
    "Leg day?",
    "Not according to Ori.",
    "Coward.",
    "You'll thank me when I can walk tomorrow." ] },

  { tag: "old friends · late", lines: [
    "Wait.",
    "What?",
    "I've been treating sleep like homework.",
    "Yeah?",
    "This is the first thing that makes it feel like my body's talking to me." ] },

  { tag: "founders · after the pitch", lines: [
    "How'd it go?",
    "Bombed.",
    "You okay?",
    "Actually, yeah. Ori's been saying my stress was climbing all week.",
    "So?",
    "Turns out today wasn't about the pitch." ] },

  { tag: "roommates · sunday", lines: [
    "Big plans?",
    "Protecting Monday.",
    "That's a plan?",
    "The healthiest one I've had all year." ] },

  { tag: "the group chat · 8:01 AM", lines: [
    "Operators are destroying us.",
    "Because they actually sleep.",
    "Cheaters." ] },

  { tag: "siblings · thursday", lines: [
    "Funny thing.",
    "What?",
    "My numbers barely changed.",
    "Then?",
    "The way I think about them did." ] },

  { tag: "old friends · coffee", lines: [
    "When did health get so complicated?",
    "Around the time we needed six apps to answer one question.",
    "Am I okay today?",
    "Exactly." ] },

  { tag: "gym friends · 6:45 AM", lines: [
    "My Whoop said train. My Oura said recover.",
    "And Apple?",
    "Said I slept great.",
    "So what'd you do?",
    "Asked Ori.",
    "And?",
    "Stopped guessing." ] },

  { tag: "roommates · 7:04 AM", lines: [
    "Why are you whispering?",
    "My recovery's at 91.",
    "So?",
    "I'm not risking it." ] },

  { tag: "study group · finals", lines: [
    "Finals week. My streak's toast.",
    "A 54 still counts.",
    "Even that one?",
    "Especially that one." ] },

  { tag: "siblings · 10 PM", lines: [
    "Since when do you go to bed at ten?",
    "Since my little sister started beating her par five days straight.",
    "Scared?",
    "Rested, actually. Terrifying, right?" ] },

  { tag: "coworkers · standup", lines: [
    "You muted the group chat?",
    "The scores drop at eight.",
    "And?",
    "I can't take three green mornings from Marcus in a row." ] },

  { tag: "running club · race week", lines: [
    "Race week. I feel lazy.",
    "You're not lazy, you're tapering.",
    "Ori said the same thing.",
    "Then it's two against one. Sit down." ] },

  { tag: "couple · 6 PM", lines: [
    "Can we move dinner earlier?",
    "Why?",
    "I'm two over par and defending a nine-day streak.",
    "…you were more fun before.",
    "I'm asleep by ten and thriving, actually." ] },

  { tag: "the group chat · saturday", lines: [
    "Don't check mine today.",
    "That bad?",
    "Posted it anyway.",
    "Respect.",
    "A rough one logged beats a good one skipped. I'm told." ] },

  { tag: "coworkers · new watch", lines: [
    "Switched from Whoop to Garmin.",
    "RIP your baseline.",
    "It came with me, actually.",
    "…it what?" ] },

  { tag: "old friends · walk", lines: [
    "You seem lighter lately.",
    "I stopped fighting my mornings.",
    "Meaning?",
    "Bad ones count too now. Takes the drama out of it." ] },

  { tag: "family chat · sunday", lines: [
    "Dad. You're on the board?",
    "Your brother put me on.",
    "You have a nine-day streak??",
    "I nap with intent." ] },

  { tag: "travel buddies · arrivals", lines: [
    "Landed. Everything hurts.",
    "Post it anyway.",
    "It's ugly.",
    "Ugly counts. That's the whole point." ] },

  { tag: "gym friends · tuesday", lines: [
    "Maxing out today?",
    "Ori says my body's still paying for Tuesday.",
    "And you listen?",
    "My knees listen. I follow." ] },

  { tag: "cofounders · 11 PM", lines: [
    "We ship Thursday.",
    "Sleep tonight then.",
    "Can't. Wired.",
    "Your par can tell, you know. It always tells." ] },

  { tag: "old friends · the pitch", lines: [
    "Another health app?",
    "It's more like a group chat with a scoreboard.",
    "For sleeping?",
    "For showing up. You'd hate losing to me though.",
    "…send the link." ] },

  { tag: "couple · 7:15 AM", lines: [
    "You okay? You were up a lot.",
    "How'd you know?",
    "I didn't need an app for that one.",
    "Ori agrees with you, for the record." ] },

  { tag: "study group · 2 AM", lines: [
    "Pulled an all-nighter.",
    "Worth it?",
    "Ask me after the exam.",
    "Your body already answered, but okay." ] },

  { tag: "the group chat · day 14", lines: [
    "Fourteen days straight.",
    "Of good scores?",
    "Of posting. Half were rough.",
    "That's the flex? Showing up?",
    "Turns out, yeah." ] },

  { tag: "coworkers · 8:03 AM", lines: [
    "Enjoy the top spot.",
    "I earned this.",
    "You slept nine hours.",
    "Like I said. Earned." ] },

  { tag: "consultants · wednesday", lines: [
    "Three cities in four days.",
    "Your poor par.",
    "It's holding. Barely.",
    "Defend it. We need you Monday." ] },

  { tag: "roommates · saturday", lines: [
    "Sunday plans?",
    "Nothing. Aggressively nothing.",
    "Since when?",
    "Since nothing became a strategy." ] },

  { tag: "old friends · dinner", lines: [
    "I used to argue with my score.",
    "Who won?",
    "Nobody. Now it's more of a conversation.",
    "With a number?",
    "With a friend who reads the number." ] },

  { tag: "new parents · 5:40 AM", lines: [
    "Four wake-ups. FOUR.",
    "And you still posted?",
    "The streak's the only thing I control right now.",
    "Honestly? Iconic." ] },

  { tag: "old friends · catching up", lines: [
    "We haven't talked in months and you open with your recovery score?",
    "It's a 79.",
    "…is that good?",
    "For me? It's a comeback story." ] },

  { tag: "coworkers · rainy tuesday", lines: [
    "You biked in?",
    "Two over par. Felt unstoppable.",
    "It's raining.",
    "Didn't notice." ] },

  { tag: "nurses · shift change", lines: [
    "How do you even track sleep on nights?",
    "Against my own usual. Nobody else's.",
    "Which is chaos.",
    "And I'm beating it." ] },

  { tag: "couple · 8:07 AM", lines: [
    "We're not competing.",
    "Agreed.",
    "…what did you get?",
    "We're not competing.",
    "So under par, then." ] },

  { tag: "gym friends · locker room", lines: [
    "What's your secret? Magnesium? Cold plunge?",
    "Bedtime.",
    "That's it?",
    "Devastatingly effective." ] },

  { tag: "wedding weekend · 11 AM", lines: [
    "Great wedding.",
    "My score's going to file a complaint.",
    "Posting it anyway?",
    "Already did. Under par, zero regrets." ] },

  { tag: "gym friends · squat day", lines: [
    "You're four over par?? On squat day??",
    "I peaked in my sleep, apparently.",
    "Unbearable.",
    "Jealousy is bad for your HRV." ] },

  { tag: "remote team · #general", lines: [
    "The Lisbon crew is unbeatable.",
    "Different timezone, same game.",
    "How is that fair?",
    "Everyone's chasing their own usual. It travels." ] },

  { tag: "close friends · thursday", lines: [
    "Rough week on the board.",
    "Five under across three days.",
    "You good?",
    "Getting there. At least it's on the record, not just in my head." ] },

  { tag: "couple · 9:20 PM", lines: [
    "Ori told you to take it easy, didn't it?",
    "Maybe.",
    "I said the same thing yesterday.",
    "You should team up.",
    "We have." ] },

  { tag: "skeptical friend · brunch", lines: [
    "It's just sleep scores.",
    "It's the only chat where my dad, my trainer, and my college roommate all talk daily.",
    "…about sleep scores?",
    "About mornings. Keep up." ] },

  { tag: "best friends · the why", lines: [
    "Why do you like it, really?",
    "Every other app told me what I did wrong.",
    "And this?",
    "Asks how I'm doing. Then keeps score anyway.",
    "That's all you wanted?",
    "Apparently." ] }
];
