// Pools of things people say, picked at random so no two playthroughs read the same.
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// How passers-by react when they notice you. Each person has a temperament that
// tilts which kind of reaction they're likely to have.
export const REACTIONS = {
  concern: {
    mood: { surprised: 0.6, sad: 0.4 }, shame: 1,
    lines: ['Uh... excuse me? Are you okay?', 'Do you need help?', 'Is everything alright?', 'Did something happen? Do you need a jacket?', "Oh! Um... it's a little cold for that, isn't it?", 'Should I call someone for you?', 'Oh dear. Rough day?'],
  },
  attraction: {
    mood: { happy: 0.6, surprised: 0.3 }, shame: 1.2,
    lines: ['Well, hello there.', '*whistles*', 'Love the look. Very daring.', 'Now THAT brightens my morning.', '*winks*', 'Are you free later?', "Don't let anyone tell you that's not a good look.", '*can\'t stop smiling*'],
  },
  confusion: {
    mood: { surprised: 0.9 }, shame: 0.9,
    lines: ['Is that... a new trend?', 'Did I miss a memo?', 'Is this a photo shoot?', 'Wait, what?', 'Is there a camera somewhere?', 'Am I still dreaming?', "I'm sure there's an explanation..."],
  },
  stunned: {
    mood: { surprised: 1 }, shame: 1,
    lines: ['...', '*mouth falls open*', '*drops their coffee*', '*nearly walks into a pole*', '*freezes mid-step*', '*stares, completely speechless*'],
  },
  amused: {
    mood: { happy: 0.8 }, shame: 1.3,
    lines: ['*snickers*', 'Ha! Lose a bet?', "That's one way to beat the heat.", '*tries very hard not to laugh*', 'Bold. Very bold.', '*giggles to a friend*'],
  },
  disapproving: {
    mood: { angry: 0.7, surprised: 0.3 }, shame: 1.4,
    lines: ['Have you no shame?!', 'There are children around!', 'Unbelievable.', '*tuts loudly*', 'Put some pants on!', 'In public? Really?'],
  },
  polite: {
    mood: { relaxed: 0.3, surprised: 0.3 }, shame: 0.6,
    lines: ['*politely looks elsewhere*', '*suddenly very interested in their phone*', '*pretends not to notice*', '*gives a small, sympathetic nod*'],
  },
};
const TEMPERAMENTS = {
  kind: { concern: 4, polite: 3, confusion: 2, stunned: 1 },
  flirty: { attraction: 5, amused: 2, stunned: 1 },
  prim: { disapproving: 4, stunned: 2, confusion: 1 },
  jokester: { amused: 4, confusion: 2, attraction: 1 },
  shy: { stunned: 3, polite: 3, concern: 1 },
  ordinary: { concern: 2, confusion: 2, stunned: 2, amused: 1, attraction: 1, polite: 1, disapproving: 1 },
};
export function randomTemperament() {
  return pick(Object.keys(TEMPERAMENTS).concat(['ordinary', 'ordinary']));
}
/** Pick a reaction kind for this person. oppositeGender makes attraction more likely. */
export function reactionFor(temper, oppositeGender) {
  const w = { ...(TEMPERAMENTS[temper] || TEMPERAMENTS.ordinary) };
  if (oppositeGender) w.attraction = (w.attraction || 0) * 1.6 + 1;
  let total = 0;
  for (const v of Object.values(w)) total += v;
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
  return 'concern';
}
export function reactionLine(kind) {
  return pick(REACTIONS[kind].lines);
}

export const BUS_REACTIONS = [
  'Interesting outfit...', '*very carefully looks out the window*', 'Um... are you okay? You look cold.', '*slowly lowers their phone*', 'Long day?', '...wow.',
  '*nudges the person next to them*', 'Well. That\'s new.', '*smiles a little too long*', '*offers a jacket, then thinks better of it*', 'Is this the party bus?',
];

export const EXCUSES = [
  'Posture exercise.', 'Workplace ergonomics.', 'Inventory inspection.', 'Strategic positioning.', "I'm embracing efficiency.", 'Just appreciating the air conditioning!',
  'Testing the new dress code.', "It's for a charity challenge.", 'Spilled something. Drying off.', "I'm stretching. Doctor's orders.", "Looking for a dropped earring.",
  'Fire drill practice.', 'Team-building exercise. Very hush-hush.', "I'm checking the floor for... level-ness.", 'Method acting. Long story.',
];
export const EXCUSE_OK = ['...Right.', 'Okay then.', 'Sure. Carry on.', 'If you say so.', 'Huh. Okay.', 'I... see.', "Whatever works for you, I guess.", 'Fair enough.'];
export const EXCUSE_FAIL = ['Hang on. Let me look at you...', 'That makes no sense.', 'Wait a second...', "That's not a thing.", 'Nice try. What is going on?', 'Turn around for a second?'];
export const CHECK_ON_YOU = [
  'what are you doing?', 'you look like you\'re playing hide-and-seek.', 'why are you walking like that?', "you've been acting weird all day.", 'are you feeling okay?',
  'why are you hugging the wall?', 'is everything alright over here?', 'you keep disappearing. What\'s up?',
];

export const ODDBALL_LINES = [
  "Ooh, a stealth game? I LOVE stealth games. I'm in!", 'Wait, is this a challenge? Hold my pants. Literally.', "No way, we're doing a no-pants run? Count me in!",
  "Is this a dare? I never back down from a dare.", 'Okay, okay, rules: whoever gets caught buys lunch.', "You can't have all the fun yourself!", 'This is the best workday ever.',
];
export const DISTRACT_LINES = [
  'Oh no! I dropped all my papers everywhere!', 'Whoa! Is that a spider?! Everyone look over here!', 'Ow! I think I sprained my ankle!', 'Hey everyone, free donuts over here!',
  'Oops! I spilled coffee all over the floor!', 'The copier is making that noise again!', 'Is that smoke? Oh. No. Just steam. Come look though!', 'Who ordered thirty-seven boxes of paper?!',
  'Everybody, come see this! The vending machine is giving out two of everything!', "Somebody's car alarm is going off outside!",
];

// Makeshift skirts: several ways each one can fail
export const MAKESHIFT_FAILS = {
  box: ['CRACK. The box splits right down the middle.', 'The bottom of the box gives out with a sad little rip.', 'One corner folds, then the whole box collapses.'],
  basket: ['The basket handle snaps and the whole thing clatters to the floor.', 'The plastic cracks along the side. So much for that.'],
  newspaper: ['FWIP! A gust catches the paper skirt and sends it flying.', 'The tape lets go and the paper flutters away like a startled bird.', 'Riiip. One step too long and the paper tears in half.'],
  folder: ['The folders slip out one by one and scatter across the floor.', 'The binder clip pings off somewhere and everything slides loose.'],
  menu: ['The menus slide apart and clatter to the floor.', "The menus fan out and drop. Today's special: embarrassment."],
  clipboard: ['The clip snaps open and everything drops.', 'The clipboard slips sideways at exactly the wrong moment.'],
  bag: ['RRRIP. The bag handles give out.', 'The bag seams split open one stitch at a time.', 'The strap slides off your hip and the bag drops.'],
  towel: ['The towel slowly works itself loose and drops.', 'The towel knot unravels with a soft flump.'],
  laundry: ['The knot gives out and the cloth slides to the floor.', 'The cloth unwinds as you turn a corner.'],
  pillow: ['The pillowcase seam splits open.', 'The pillowcase slips down around your ankles.'],
};
export const MAKESHIFT_SNAGS = [
  'The cloth catches on a chair leg... and the chair keeps it.', 'It hooks on a passing chair. THWACK. Gone.', 'A chair wheel rolls right over the hem and yanks it away.',
];

// Neighbors and other residents of your building
/** Fill {They} {they} {their} {Their} {them} {s} {es} {do} placeholders for one person. */
export function fillP(str, P) {
  return str.replace(/\{(They|they|their|Their|them|s|es|do|studies)\}/g, (_, k) => (k === 'do' ? (P.s ? 'does' : 'do') : k === 'studies' ? (P.s ? 'studies' : 'study') : P[k]));
}
export const RESIDENT_INTRO = [
  (who) => `${who} steps out, stops dead, and looks you up and down. "...Evening."`,
  (who) => `${who} is waiting by the door with a bag of trash. {Their} eyes go down... and snap right back up.`,
  (who) => `${who} glances over, then does a slow double take.`,
  (who) => `"Oh!" ${who} nearly drops {their} keys.`,
];
export const RESIDENT_AGAIN = ['{They} clearly remember{s} the last time.', 'Recognition flickers across {their} face.', '"...Oh. Hi. Again."'];
export const RESIDENT_REPLIES = {
  swim: { good: ['"Swimming?" A long pause. {They} look{s} at the puddle at your feet. "...Right. Have a good night."', '"Ah. Pool\'s nice this time of year?" {They} clearly {do}n\'t believe a word, but {they} nod{s} anyway.'], bad: ['"Swimming." {They} look{s} at your completely dry hair. "...In the hallway?"', '"Swimming? It\'s bone dry out there." {They} squint{s}.'] },
  laundry: { good: ['"Laundry? Ah. I figured." {They} very carefully look{s} anywhere else.', '"Yeah, it happens." {They} nod{s} slowly and get{s} on with {their} own business.'], bad: ['"Laundry. At this hour. Dressed like... that." {They} shake{s} {their} head.'] },
  locked: { good: ['"Ugh, that machine. Happens all the time. Want me to call the building manager?" "NO! I mean... no, thanks."', '"Oh no, that one again? Kick it near the bottom. Works sometimes."'], bad: [] },
  fine: { good: ['"You\'re... shaking." "I\'m not." {They} very politely pretend{s} to believe you.'], bad: ['"Fine? You don\'t LOOK fine."'] },
  evening: { good: ['{They} nod{s} once and very deliberately {studies} the ceiling until you\'ve passed.', '"Evening." {Their} eyes stay locked on a spot somewhere above your head.'], bad: ['"Evening... are you okay?"'] },
  story: { good: ['"Ah. Okay." {They} go{es} back to {their} phone. Then look{s} again. Then back to the phone.'], bad: [] },
};

// What ruins the rest of the wardrobe on night one
const EVERY = (lw, cap) => (/skirt/.test(lw) ? (cap ? 'Every skirt' : 'every skirt') : cap ? 'Every pair of pants' : 'every pair of pants');
export const WARDROBE_RUIN = [
  (lw) => `Something blue went in with everything else. Every top is blotched, and ${EVERY(lw)} has shrunk to doll size, tangled into one hopeless knot.`,
  (lw) => `The drum must have caught on something: ${EVERY(lw)} comes out shredded into ribbons.`,
  (lw) => `A pen in someone's pocket burst. Everything is soaked in ink, and the ${/skirt/.test(lw) ? 'skirts' : 'pants'} got the worst of it.`,
  (lw) => `The machine overheated. ${EVERY(lw, true)} has melted and fused into one stiff, shiny lump.`,
];
export const HOME_RUIN = [
  (lw) => `...and find a puddle. A pipe burst in the wall overnight and flooded the closet. ${EVERY(lw, true)} is soaked, mildewed and ruined.`,
  (lw) => `...and find the closet door open and the window wide. The upstairs neighbor's dog got in through the fire escape and chewed ${EVERY(lw)} to pieces.`,
  (lw) => `...and find a cloud of moths. ${EVERY(lw, true)} has more holes than fabric.`,
  (lw) => `...and find a note from the landlord: the closet was "treated" for mold today. ${EVERY(lw, true)} reeks of chemicals and is falling apart.`,
];
export const MACHINE_ERRORS = ['E03', 'E21', 'F05', 'Err 7', 'DOOR LOCK', 'E44'];

export { pick };

// ---- Friends and oddballs who know your secret drop by now and then
export const FRIEND_CHECKS = [
  (nm, you, mgr, P) => `${nm} sidles up and keeps ${P.their} voice low. "Hey. How are you holding up?"`,
  (nm, you) => `"Psst! ${you}! Still in one piece?" ${nm} glances around nervously.`,
  (nm, you) => `${nm} pretends to study a file right next to you. "Doing okay? You look a little pale. And... a LOT pale."`,
  (nm, you) => `${nm} slips a coffee into your hand without looking down. "Moral support. How's it going?"`,
  (nm, you, mgr, P) => `"I've been keeping an eye on ${mgr}. Coast is clear... ish." ${nm} lowers ${P.their} voice. "You alright?"`,
  (nm, you) => `${nm} drifts past, then doubles back. "Just making sure nobody's cornered you. You good?"`,
];
export const FRIEND_FINE = ['"Uh huh. Sure you are."', '"That\'s the spirit. Terrifying, but the spirit."', '"Okay. Shout if you need me. Quietly."'];
export const FRIEND_COMFORT = ['"Hang in there. You\'re doing great. Weirdly great."', '"Hey. Breathe. Nobody\'s noticed a thing, I promise."', '"You\'ve made it this far. Only a few more hours."'];
export const BLESSED_FRIEND_CHECKS = [
  (nm, P) => `${nm} shuffles over, tugging ${P.their} shirt down as far as it goes. "Okay. NOW I get it. How do you do this all day?"`,
  (nm) => `"Psst. Is it just me, or is the air conditioning aimed directly at us?" ${nm} whispers.`,
  (nm) => `${nm} crouches behind the nearest cover with you. "Support group meeting. Population: us."`,
];
export const ODDBALL_CHECKS = [
  (nm) => `${nm} slides in next to you with a huge grin. "Scoreboard update!"`,
  (nm) => `"Hey! Hey! Time-out! Score check!" ${nm} pops up from behind the nearest desk.`,
  (nm) => `${nm} strolls over like nothing's wrong at all. "So. Who's winning?"`,
];

// ---- Coworkers who only see you after they've been blessed themselves
export const BLESSED_MEET = [
  { intro: (nm, pr) => `${nm} stops dead, looks you up and down, then down at ${pr.their} own bare legs... then back at you.`, line: 'So THIS is what you\'ve been doing all along?!' },
  { intro: (nm) => `${nm} rounds the corner and nearly walks into you. You both freeze.`, line: 'You too?! How long has THIS been going on?' },
  { intro: (nm, pr) => `${nm}'s eyes go wide. ${pr.They} point${pr.they === 'they' ? '' : 's'} at you with a trembling finger.`, line: 'You KNEW! You knew this could happen and you didn\'t warn anyone!' },
];
export const BLESSED_MEET_REPLIES = {
  surviving: ['"You could have TOLD me!" "I was busy SURVIVING!"', '"Some warning would\'ve been nice!" "Warning about WHAT? \'Watch out, the goddess of hips might get you\'?"'],
  club: ['"...Fine. What are the rules?" "Rule one: never stand in the middle of a room."', '"I didn\'t want to join this club." "Nobody does."'],
  stick: ['"Deal. Two of us means twice the eyes." They give a determined nod.', '"Buddy system. Yes. Please. I\'m begging you."'],
};
export const BLESSED_APOLOGY = [
  (nm) => `${nm} spots you and winces. "Okay. I get it now. I'm sorry for... everything earlier."`,
  (nm) => `"Not a word," ${nm} mutters, edging past you. "...And I'm sorry. I had no idea it was like this."`,
  (nm) => `${nm} sighs. "I judged you. Then this happened to me. Lesson learned."`,
];
export const BLESSED_BANTER = [
  'Still alive?', "Is it just me or is the AC on full blast?", 'We should start a support group.', 'Did you know the copier room has a blind spot? Life-changing.',
  'Hips. Of course it\'s hips.', 'I\'ve never walked sideways this much in my life.', 'Three more hours. We can do this.', '*mouths* "Manager. Two o\'clock."',
];
