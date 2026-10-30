import { DYES, DYE_HEX } from './dyes.js';
// Static game data: jobs, personalities, story text, task templates, errands.

export const PERSONALITIES = {
  friend: { label: 'Best Friend', desc: 'Always has your back. Lends you their own legwear or causes a distraction.' },
  sympathetic: { label: 'Sympathetic', desc: 'Kind and discreet. Keeps your secret and creates distractions for you.' },
  neutral: { label: 'Neutral', desc: 'Awkward about it. Lets it slide once, but the second time they go to the manager.' },
  strict: { label: 'Strict', desc: 'A stickler for the dress code. Reports you to the manager on sight.' },
  distant: { label: 'Distant', desc: 'Cold and by-the-book. Quietly files a complaint with the manager.' },
  oddball: {
    label: 'Oddball',
    desc: "Thinks you're playing some kind of game and joins in: takes off their own bottoms and starts sneaking around too.",
  },
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekday = (day) => (day - 1) % 7;
export const isWorkday = (day) => weekday(day) < 5;
export const CELESTI_DAY = 4; // morning after the third shift

// Generic tasks that can show up in any job.
export const GENERIC_TASKS = [
  { name: 'Brew coffee for the team', steps: [{ tag: 'supply', label: 'Grab coffee filters from {label}', time: 1.5, carry: 'box' }, { tag: 'coffee', label: 'Brew a fresh pot at {label}', time: 3, drop: true }] },
  { name: 'Clean the restroom', steps: [{ tag: 'mop', label: 'Get cleaning supplies from {label}', time: 1.5, carry: 'bucket' }, { tag: 'sink', label: 'Wipe down {label}', time: 3.5, drop: true }] },
  { name: 'Take out the trash', steps: [{ tag: 'trash', label: 'Empty {label}', time: 1.5, carry: 'bag' }, { tag: 'dumpster', label: 'Throw the bag in {label}', time: 1, drop: true }] },
  { name: 'Deliver paperwork to the manager', steps: [{ tag: 'inbox', label: 'Pick up paperwork from {label}', time: 1.2, carry: 'folder' }, { tag: 'mgrdesk', label: "Drop it on {label} (careful...)", time: 1.5, drop: true }] },
  { name: 'Water the plants', steps: [{ tag: 'sink', label: 'Fill a watering can at {label}', time: 1.5, carry: 'can' }, { tag: 'plant', label: 'Water {label}', time: 2, drop: true }] },
  { name: 'Check the staff schedule', steps: [{ tag: 'schedule', label: 'Read {label}', time: 2.5 }] },
  { name: 'Restock the break room', steps: [{ tag: 'supply', label: 'Grab snacks from {label}', time: 1.5, carry: 'box' }, { tag: 'fridge', label: 'Stock {label}', time: 2.5, drop: true }] },
  { name: 'Mop up a spill', steps: [{ tag: 'mop', label: 'Grab a mop from {label}', time: 1.2, carry: 'mop' }, { tag: 'spill', label: 'Mop up {label}', time: 3.5, drop: true }] },
];

/*
 * Jobs. Each has:
 *  layout: id of the public-area builder in levels/workplace.js
 *  rooms: back-of-house room types (generic + job specific)
 *  tasks: job specific tasks (merged with GENERIC_TASKS)
 */
export const JOBS = {
  office: {
    label: 'Office Worker',
    desc: 'Cubicle farm, private offices, meeting rooms and a mail room. Partitions give good cover; the open aisles do not.',
    workplaceName: 'Brightline Solutions Ltd.',
    customerWord: 'client',
    rooms: ['meeting', 'meeting', 'copy', 'mail', 'server', 'office', 'office', 'office', 'archive'],
    tasks: [
      { name: 'Print & deliver a report', steps: [{ tag: 'printer', label: 'Collect the report at {label}', time: 2, carry: 'folder' }, { tag: 'desk', label: 'Deliver it to {label}', time: 1.2, drop: true }] },
      { name: 'Make copies', steps: [{ tag: 'copier', label: 'Run 200 copies at {label}', time: 4, carry: 'folder' }, { tag: 'meetingtable', label: 'Hand them out at {label}', time: 1.5, drop: true }] },
      { name: 'File paperwork', steps: [{ tag: 'inbox', label: 'Pick up paperwork from {label}', time: 1.5, carry: 'folder' }, { tag: 'cabinet', label: 'File it in {label}', time: 2.5, drop: true }] },
      { name: 'Answer emails', steps: [{ tag: 'mydesk', label: 'Answer emails at {label}', time: 4 }] },
      { name: 'Prepare a meeting', steps: [{ tag: 'supply', label: 'Grab markers from {label}', time: 1.2, carry: 'box' }, { tag: 'whiteboard', label: 'Set up {label}', time: 3, drop: true }] },
      { name: 'Sort the mail', steps: [{ tag: 'mail', label: 'Sort the mail at {label}', time: 3, carry: 'box' }, { tag: 'desk', label: 'Deliver mail to {label}', time: 1, drop: true }] },
      { name: 'Reboot the server', steps: [{ tag: 'server', label: 'Reboot {label}', time: 4 }] },
      { name: 'Retrieve old files', steps: [{ tag: 'archivebox', label: 'Dig through {label}', time: 3, carry: 'box' }, { tag: 'officedesk', label: 'Bring the files to {label}', time: 1.5, drop: true }] },
      { name: 'Greet a client', steps: [{ tag: 'reception', label: 'Greet the client at {label}', time: 2.5 }] },
      { name: 'Dispose of outdated documents', steps: [{ tag: 'cabinet', label: 'Pull the outdated files from {label}', time: 2, carry: 'box' }, { tag: 'shredder', label: 'Feed them into {label}', time: 3.5, drop: true }] },
    ],
  },
  restaurant: {
    label: 'Restaurant Server',
    desc: 'Big dining room, bar, kitchen line, walk-in freezer and pantry. Carry a tray in front of you to stay covered.',
    workplaceName: 'Trattoria Bella',
    customerWord: 'diner',
    rooms: ['kitchen', 'kitchen', 'pantry', 'freezer', 'dishroom', 'office', 'laundry'],
    tasks: [
      { name: 'Serve a table', steps: [{ tag: 'table', label: 'Take the order at {label}', time: 2, remember: true }, { tag: 'terminal', label: 'Enter the order at {label}', time: 1.5 }, { tag: 'pass', label: 'Pick up the food at {label}', time: 1.5, carry: 'tray' }, { tag: '$remembered', label: 'Deliver the food to {label}', time: 1.5, drop: true }] },
      { name: 'Bus a table', steps: [{ tag: 'table', label: 'Clear the dishes from {label}', time: 2, carry: 'tray' }, { tag: 'dish', label: 'Drop dishes at {label}', time: 1.5, drop: true }] },
      { name: 'Refill drinks', steps: [{ tag: 'soda', label: 'Fill drinks at {label}', time: 2, carry: 'tray' }, { tag: 'table', label: 'Bring drinks to {label}', time: 1.2, drop: true }] },
      { name: 'Roll silverware', steps: [{ tag: 'host', label: 'Roll silverware at {label}', time: 3.5 }] },
      { name: 'Fetch ingredients', steps: [{ tag: 'pantryshelf', label: 'Grab tomatoes from {label}', time: 1.5, carry: 'box' }, { tag: 'prep', label: 'Bring them to {label}', time: 1.5, drop: true }] },
      { name: 'Grab ice cream', steps: [{ tag: 'freezer', label: 'Get gelato from {label}', time: 2, carry: 'tray' }, { tag: 'table', label: 'Serve dessert at {label}', time: 1.2, drop: true }] },
      { name: 'Fold napkins', steps: [{ tag: 'linen', label: 'Collect napkins from {label}', time: 1.5, carry: 'box' }, { tag: 'host', label: 'Fold them at {label}', time: 3, drop: true }] },
      { name: 'Serve the bar', steps: [{ tag: 'bar', label: 'Mix drinks at {label}', time: 3, carry: 'tray' }, { tag: 'table', label: 'Bring cocktails to {label}', time: 1.2, drop: true }] },
    ],
  },
  retail: {
    label: 'Retail Worker',
    desc: 'A huge sales floor with long aisles, checkout lanes, fitting rooms, stockrooms and receiving.',
    workplaceName: 'MegaMart Express',
    customerWord: 'shopper',
    rooms: ['stockroom', 'stockroom', 'receiving', 'returns', 'office', 'stockroom'],
    tasks: [
      { name: 'Restock an aisle', steps: [{ tag: 'stockbox', label: 'Grab a box from {label}', time: 1.5, carry: 'box' }, { tag: 'shelf', label: 'Restock {label}', time: 3, drop: true }] },
      { name: 'Work the register', steps: [{ tag: 'register', label: 'Ring up customers at {label}', time: 5 }] },
      { name: 'Fold clothes', steps: [{ tag: 'display', label: 'Fold clothes at {label}', time: 3 }] },
      { name: 'Price check', steps: [{ tag: 'shelf', label: 'Check prices in {label}', time: 2 }, { tag: 'register', label: 'Update prices at {label}', time: 1.5 }] },
      { name: 'Process returns', steps: [{ tag: 'returnbin', label: 'Collect returns from {label}', time: 1.5, carry: 'box' }, { tag: 'shelf', label: 'Put returns back in {label}', time: 2, drop: true }] },
      { name: 'Clear the fitting rooms', steps: [{ tag: 'fitting', label: 'Collect clothes from {label}', time: 2, carry: 'box' }, { tag: 'display', label: 'Hang them back at {label}', time: 2, drop: true }] },
      { name: 'Unload a delivery', steps: [{ tag: 'dock', label: 'Unload boxes at {label}', time: 3, carry: 'box' }, { tag: 'stockbox', label: 'Stack them in {label}', time: 2, drop: true }] },
    ],
  },
  hotel: {
    label: 'Hotel Staff',
    desc: 'Grand lobby, front desk, lounge, guest rooms, laundry and linen closets. Guests wander everywhere.',
    workplaceName: 'The Grand Aurelia Hotel',
    customerWord: 'guest',
    rooms: ['guestroom', 'guestroom', 'guestroom', 'guestroom', 'laundry', 'linen', 'office', 'guestroom'],
    tasks: [
      { name: 'Check in a guest', steps: [{ tag: 'frontdesk', label: 'Check in a guest at {label}', time: 3.5 }] },
      { name: 'Make up a room', steps: [{ tag: 'linenshelf', label: 'Grab fresh sheets from {label}', time: 1.5, carry: 'box' }, { tag: 'guestbed', label: 'Make the bed in {label}', time: 4, drop: true }] },
      { name: 'Wash towels', steps: [{ tag: 'guestbed', label: 'Collect towels from {label}', time: 1.5, carry: 'bag' }, { tag: 'washer', label: 'Load {label}', time: 2.5, drop: true }] },
      { name: 'Carry luggage', steps: [{ tag: 'luggage', label: 'Pick up a suitcase at {label}', time: 1.2, carry: 'box' }, { tag: 'guestbed', label: 'Deliver it to {label}', time: 1.2, drop: true }] },
      { name: 'Restock the minibar', steps: [{ tag: 'supply', label: 'Grab drinks from {label}', time: 1.5, carry: 'box' }, { tag: 'minibar', label: 'Restock {label}', time: 2, drop: true }] },
      { name: 'Answer the concierge phone', steps: [{ tag: 'concierge', label: 'Take a call at {label}', time: 3 }] },
      { name: 'Fold laundry', steps: [{ tag: 'dryer', label: 'Unload {label}', time: 2, carry: 'bag' }, { tag: 'linenshelf', label: 'Fold and shelve at {label}', time: 3, drop: true }] },
      { name: 'Tidy the lounge', steps: [{ tag: 'lounge', label: 'Tidy {label}', time: 3 }] },
    ],
  },
  library: {
    label: 'Library Assistant',
    desc: 'Rows and rows of tall bookshelves, reading areas, study rooms and a dusty archive. Quiet... and everyone looks up.',
    workplaceName: 'Westbrook Public Library',
    customerWord: 'patron',
    rooms: ['study', 'study', 'study', 'archive', 'workroom', 'office', 'archive'],
    tasks: [
      { name: 'Shelve returned books', steps: [{ tag: 'returncart', label: 'Load books from {label}', time: 1.5, carry: 'books' }, { tag: 'bookshelf', label: 'Shelve them in {label}', time: 3, drop: true }] },
      { name: 'Check out books', steps: [{ tag: 'circ', label: 'Check out books at {label}', time: 4 }] },
      { name: 'Help a patron find a book', steps: [{ tag: 'computer', label: 'Look up the book at {label}', time: 2 }, { tag: 'bookshelf', label: 'Find it in {label}', time: 2, carry: 'books' }, { tag: 'readtable', label: 'Bring it to {label}', time: 1, drop: true }] },
      { name: 'Repair damaged books', steps: [{ tag: 'bookshelf', label: 'Pull damaged books from {label}', time: 1.5, carry: 'books' }, { tag: 'repair', label: 'Repair them at {label}', time: 4, drop: true }] },
      { name: 'Clean a study room', steps: [{ tag: 'studytable', label: 'Tidy {label}', time: 3 }] },
      { name: 'Scan old documents', steps: [{ tag: 'archivebox', label: 'Retrieve documents from {label}', time: 2, carry: 'box' }, { tag: 'scanner', label: 'Scan them at {label}', time: 3.5, drop: true }] },
      { name: 'Tidy the reading tables', steps: [{ tag: 'readtable', label: 'Collect stray books at {label}', time: 1.5, carry: 'books' }, { tag: 'returncart', label: 'Drop them at {label}', time: 1, drop: true }] },
    ],
  },
  warehouse: {
    label: 'Warehouse Worker',
    desc: 'Towering racks, packing stations, conveyors and loading docks. Lots of cover, lots of coworkers.',
    workplaceName: 'Swiftline Logistics Hub',
    customerWord: 'driver',
    rooms: ['shipping', 'receiving', 'office', 'stockroom', 'packing', 'stockroom'],
    tasks: [
      { name: 'Pick an order', steps: [{ tag: 'rack', label: 'Pick items from {label}', time: 2, carry: 'box' }, { tag: 'packing', label: 'Pack them at {label}', time: 3, drop: true }] },
      { name: 'Ship a package', steps: [{ tag: 'packing', label: 'Seal a box at {label}', time: 2, carry: 'box' }, { tag: 'dock', label: 'Load it at {label}', time: 1.5, drop: true }] },
      { name: 'Receive a shipment', steps: [{ tag: 'dock', label: 'Unload boxes at {label}', time: 2.5, carry: 'box' }, { tag: 'rack', label: 'Store them in {label}', time: 2.5, drop: true }] },
      { name: 'Scan inventory', steps: [{ tag: 'rack', label: 'Scan barcodes in {label}', time: 3 }, { tag: 'terminal', label: 'Upload counts at {label}', time: 1.5 }] },
      { name: 'Clear the conveyor', steps: [{ tag: 'conveyor', label: 'Unjam {label}', time: 3.5 }] },
      { name: 'Label pallets', steps: [{ tag: 'terminal', label: 'Print labels at {label}', time: 1.5, carry: 'folder' }, { tag: 'pallet', label: 'Label {label}', time: 2, drop: true }] },
    ],
  },
  cafe: {
    label: 'Cafe Barista',
    desc: 'A busy coffee house with a long counter, seating nooks, a bakery and a roastery. Customers face the counter.',
    workplaceName: 'Moonbean Coffee House',
    customerWord: 'customer',
    rooms: ['bakery', 'roastery', 'pantry', 'office', 'dishroom', 'stockroom'],
    tasks: [
      { name: 'Make a latte', steps: [{ tag: 'counter', label: 'Take an order at {label}', time: 1.5 }, { tag: 'espresso', label: 'Pull shots at {label}', time: 3, carry: 'cup' }, { tag: 'counter', label: 'Hand it over at {label}', time: 1, drop: true }] },
      { name: 'Bake pastries', steps: [{ tag: 'pantryshelf', label: 'Get flour from {label}', time: 1.5, carry: 'box' }, { tag: 'oven', label: 'Bake at {label}', time: 3.5, drop: true }] },
      { name: 'Restock the pastry case', steps: [{ tag: 'oven', label: 'Collect pastries from {label}', time: 1.5, carry: 'tray' }, { tag: 'pastry', label: 'Fill {label}', time: 2, drop: true }] },
      { name: 'Roast beans', steps: [{ tag: 'beans', label: 'Grab green beans from {label}', time: 1.5, carry: 'bag' }, { tag: 'roaster', label: 'Roast at {label}', time: 4, drop: true }] },
      { name: 'Wipe tables', steps: [{ tag: 'cafetable', label: 'Wipe {label}', time: 2 }] },
      { name: 'Deliver an order', steps: [{ tag: 'espresso', label: 'Prepare drinks at {label}', time: 2, carry: 'tray' }, { tag: 'cafetable', label: 'Serve {label}', time: 1.2, drop: true }] },
      { name: 'Grind coffee', steps: [{ tag: 'grinder', label: 'Grind beans at {label}', time: 3 }] },
    ],
  },
};

export const ROLE_NAMES = {
  office: ['Desk Neighbor', 'Team Lead', 'Receptionist', 'Intern', 'Accountant', 'IT Tech', 'Analyst', 'Designer', 'Sales Rep', 'HR Assistant', 'Project Manager', 'Copywriter'],
  restaurant: ['Fellow Server', 'Head Chef', 'Host', 'Busser', 'Line Cook', 'Bartender', 'Sous Chef', 'Dishwasher', 'Server', 'Pastry Chef', 'Server', 'Runner'],
  retail: ['Shift Buddy', 'Shift Lead', 'Cashier', 'Stock Clerk', 'Greeter', 'Cashier', 'Fitting Room Attendant', 'Receiver', 'Floor Associate', 'Floor Associate', 'Visual Merchandiser', 'Returns Clerk'],
  hotel: ['Front Desk Clerk', 'Concierge', 'Housekeeper', 'Bellhop', 'Housekeeper', 'Laundry Attendant', 'Night Auditor', 'Valet', 'Housekeeper', 'Bellhop', 'Front Desk Clerk', 'Maintenance'],
  library: ['Librarian', 'Archivist', 'Circulation Clerk', 'Page', 'Children\'s Librarian', 'IT Helper', 'Reference Librarian', 'Volunteer', 'Page', 'Cataloger', 'Volunteer', 'Book Mender'],
  warehouse: ['Picker', 'Forklift Driver', 'Packer', 'Shift Lead', 'Loader', 'Picker', 'Inventory Clerk', 'Packer', 'Loader', 'Receiver', 'Picker', 'Safety Officer'],
  cafe: ['Fellow Barista', 'Baker', 'Shift Lead', 'Cashier', 'Roaster', 'Barista', 'Dishwasher', 'Barista', 'Baker', 'Cashier', 'Barista', 'Runner'],
};

// mishap lines take (name, legwear type, gender)
const W = (f) => (n, lw, g) => f(n, lwWords(lw), pronouns(g));
export const MISHAPS = [
  W((n, L) => `${n}'s ${L.n} snag${L.s} on a sharp corner. One step later there is a long, loud RRRRIP. The ${L.n} ${L.are} torn beyond saving.`),
  W((n, L, P) => `A whole pot of soup lands on ${n}'s ${L.n}. ${P.They} ${P.have} to peel ${L.them} off before ${L.they} burn${L.s}, and ${L.theyre} soaked and unwearable.`),
  W((n, L) => `${n}'s ${L.n} catch${L.es} on a loose strap of a rolling cart, which happily rolls away with ${L.them}. ${L.Theyre} gone.`),
  W((n, L) => `${n}'s zipper and button give out at the same moment. The ${L.n} simply slide${L.s} down to the floor... and refuse${L.s} to stay up.`),
  W((n, L) => `A sudden gust from the air vent sends ${n}'s ${L.n} flying into the shredder. Somehow.`),
  W((n, L, P) => `${n} sits on a freshly painted bench. By the time ${P.they} notice${P.s}, the ${L.n} ${L.are} glued to it.`),
];

export const STORY = {
  intro: (name) => `${name}'s alarm blares. Another ordinary Monday... or so it seems.\n\nGet ready for work, then head out the front door.`,
  day1Evening: (lw) =>
    `You made it home! You head straight for the wardrobe to grab ${/skirt/.test(lw) ? 'a fresh skirt' : 'a fresh pair of pants'}...\n\n` +
    `...and find a puddle. The washing machine leaked overnight and flooded the closet. Every last pair of pants and every skirt you own is soaked, mildewed and ruined.\n\n` +
    `Payday isn't for a while. Until then, you'll have to get by just like this.`,
  day1Home: (lw) =>
    `You made it home. Every scrap of clothing from today is going straight in the wash, along with the rest of the hamper.\n\n` +
    `The laundry room is in the basement. It's late. Nobody will be down there at this hour... right?`,
  day1Laundry: (lw) =>
    `BEEP. The door finally releases.\n\nYou pull out the first shirt... and freeze. Something blue went in with everything else. Every blouse is blotched, and every last ${/skirt/.test(lw) ? 'skirt' : 'pair of pants'} has shrunk to doll size, tangled into one hopeless knot.\n\n` +
    `That was the whole wardrobe. Payday isn't for a while. Until then, you'll have to get by just like this.`,
  morningNoClothes: `The wardrobe still holds nothing for your legs. Tops, yes. Pants or skirts? Not a single one.\n\nDeep breath. You can do this.`,
  celesti: (name, celestiName) => [
    [`Something's wrong...`, `${name} wakes with a start. There's a rustle of feathers in the living room... and the sound of someone humming.\n\nSomeone is in the apartment.`],
    [`${celestiName}`, `"Oh! You're awake. Please don't scream! I come in peace."\n\nA figure with a shimmering halo and fluffy white wings bows politely.\n\n"My name is ${celestiName}. I am a messenger of Hiphtia, the goddess of hips."`],
    [`${celestiName}`, `"I'm afraid I have... news. You have been blessed by Hiphtia herself. That is why no pants or skirt will stay on you. Every one you own fell apart, didn't it? That was her doing."`],
    [`${celestiName}`, `"I know, I know. It feels much more like a curse than a blessing." She wrings her hands. "I'm so, so sorry. I tried to talk her out of it, truly. But Hiphtia is very... stubborn. I can't undo it."`],
    [`${celestiName}`, `"And there is one more thing." She winces. "From today on, the blessing will spread. Whoever you spend the most time with each workday will be blessed the very next workday."\n\n"Perhaps... if everyone at your workplace shares the blessing, Hiphtia will finally be satisfied."`],
    [`${celestiName}`, `"Be brave, ${name}. And... maybe stay close to the coworkers you'd like to share this with." With a flutter of feathers, ${celestiName} is gone.\n\n(From now on, the coworker you spend the most time near each workday gets blessed the next workday. Win when every coworker is blessed.)`],
  ],
  win: (name, celestiName) =>
    `That night, ${celestiName} appears once more, beaming from ear to ear.\n\n"Hiphtia is delighted! Every single one of your coworkers now shares the blessing. She's finally satisfied, ${name}."\n\n` +
    `The next morning, your wardrobe is full of pants and skirts again... and everyone at work quietly agrees never to speak of these weeks. You win!`,
  /**
   * A write-up talk, written separately for every manager personality (which the player never sees
   * named, only hears). n: write-up number (3 = fired). phone: the talk happens over the phone.
   */
  managerTalk: (mgr, name, lw, n, reason, personality = 'neutral', mgrGender = null, phone = false) => {
    const P = pronouns(mgrGender);
    const L = lwWords(lw);
    const k = n >= 3 ? 2 : n - 1;
    const T = MANAGER_TALKS[personality] || MANAGER_TALKS.neutral;
    const open = (phone ? T.phone : T.office)(mgr, name, P, L);
    return `${open}\n\n"${name}. ${reason}"\n\n${T.talk[k](mgr, name, P, L)}${n >= 3 ? '\n\nYou\'re fired.' : n === 2 ? '\n\n(Write-up 2 of 3 — final warning)' : '\n\n(Write-up 1 of 3)'}`;
  },
};

// The manager's side of a write-up, one full set per personality.
const MANAGER_TALKS = {
  friend: {
    office: (m, you, P) => `${m} closes the office door gently and sinks into ${P.their} chair, looking like ${P.they} might cry. ${P.They} can't quite look at you.`,
    phone: (m, you, P) => `Your phone buzzes. It's ${m}, and ${P.they} sound${P.s} miserable before ${P.they}'${P.they === 'they' ? 're' : 's'} said a word.`,
    talk: [
      (m, you, P, L) => `"I hate this. I really, truly hate this." ${m} rubs ${P.their} eyes. "You know I'm on your side, right? But HR reads every report, and if I sit on this one it's both our jobs." ${P.They} fill${P.s} in the form as slowly as humanly possible. "Please. Just... find ${L.some}. Borrow mine if you have to. I mean it."`,
      (m, you, P, L) => `"Again? Oh, ${you}..." ${m} slumps. "I begged them to let me handle this quietly. They said no. This one's the final warning, and I couldn't talk them down." ${P.They} squeeze${P.s} your hand across the desk. "Whatever's going on, tell me. I'll help however I can. Just don't make me write a third one."`,
      (m, you, P) => `${m} is already crying when the form comes out. "I fought for you. I really did. Three reports and it's out of my hands." ${P.They} hug${P.s} you, very carefully, keeping ${P.their} eyes on the ceiling. "Call me, okay? Whatever happens, we're still friends."`,
    ],
  },
  sympathetic: {
    office: (m, you, P) => `${m} closes the blinds before closing the door, then sits down across from you instead of behind the desk. ${P.Their} voice is soft.`,
    phone: (m, you, P) => `Your phone rings. ${m} speaks quietly, like ${P.they}'${P.they === 'they' ? 're' : 's'} trying not to be overheard.`,
    talk: [
      (m, you, P, L) => `"I can tell this isn't easy for you, and I'm not going to pretend it's funny." ${m} slides a box of tissues and a spare jacket across the desk. "I do have to file this. But it's going in as quietly as I can manage. Take a minute here before you go back out, alright? And if you can find ${L.some}... that would make this a lot easier for both of us."`,
      (m, you, P) => `"Second time." ${m} sighs, more worried than angry. "I'm not judging you. Something's clearly going on, and if you ever want to talk about it, my door's open. But I can't keep shielding you. This one's the final warning. I'm so sorry."`,
      (m, you, P) => `"I kept hoping it wouldn't come to this." ${m} folds ${P.their} hands. "Three write-ups. The rules don't leave me any room, even though I wish they did. I'll write you the best reference I can. Take care of yourself, ${you}."`,
    ],
  },
  neutral: {
    office: (m, you, P) => `${m} closes the office door and points at the chair. You stay standing, because sitting would be worse. ${m} keeps ${P.their} eyes locked firmly on the ceiling.`,
    phone: (m, you, P) => `Your phone rings. It's ${m}, sounding like ${P.they}'d rather be doing literally anything else.`,
    talk: [
      (m, you, P, L) => `"Let me be very clear. Underwear. Is. Not. Uniform." A long, painful silence. You can hear the wall clock ticking. ${m} clears ${P.their} throat about six times. "I'm writing you up. This is going in your file. Please... please find ${L.some}." ${P.They} slide${P.s} the form across the desk without looking up.`,
      (m, you, P) => `"Again?! Do you have ANY idea how many emails I've received about you today?" ${m} rubs ${P.their} temples. A coworker walks past the glass, does a double take, and keeps walking very fast. "This is your final warning. One more and you're done here." ${P.They} hand${P.s} you the form at arm's length, face turned to the wall.`,
      (m, you, P) => `"That's it. Three strikes." ${m} doesn't even sound angry anymore, just tired. "I'm sorry, but I can't have this in my workplace. Please collect your things... and maybe a coat."`,
    ],
  },
  strict: {
    office: (m, you, P) => `${m} doesn't close the door so much as slam it. ${P.They} stay${P.s} standing, arms folded, and look${P.s} you dead in the eye. ${P.They} do${P.es} not look away.`,
    phone: (m, you, P) => `Your phone rings exactly once before you answer. ${m}'s voice is clipped and cold.`,
    talk: [
      (m, you, P, L) => `"Section four of the employee handbook. Dress code. I trust you've read it." ${P.They} tap${P.s} the binder on ${P.their} desk. "Rules exist for a reason, and I enforce them. No exceptions. Not for anyone. This is a formal write-up. Tomorrow you will arrive in full uniform, which includes ${L.some}. Dismissed."`,
      (m, you, P) => `"I don't repeat myself, ${you}, and yet here we are." ${m} sets the second form down with surgical precision. "This is your final warning. I am documenting everything. One more incident and you will be escorted from the premises. Do I make myself clear?" ${P.They} wait${P.s} for an answer.`,
      (m, you, P) => `"Three violations." ${m} is already holding your termination letter. "I warned you. Twice, in writing. Security will see you out. Hand over your badge on the way."`,
    ],
  },
  distant: {
    office: (m, you, P) => `${m} waves you in without looking up from ${P.their} screen. The door drifts shut on its own.`,
    phone: (m, you, P) => `${m} calls. You can hear typing the whole time. ${P.They} never quite stop${P.s}.`,
    talk: [
      (m, you, P, L) => `"Mm-hm. Yes. Got the report." Click, click. "Policy says I write you up, so... done." ${P.They} hit${P.s} print without glancing at you. "Wear ${L.some} next time, I guess. Close the door on your way out."`,
      (m, you, P) => `"You again." ${m} sighs without looking away from the screen. "Second one. Final warning, it says here. I've got a budget meeting in five minutes, so let's just... not do this again."`,
      (m, you, P) => `"Third report. That's automatic termination." ${m} still hasn't looked up. "HR will email you the paperwork. Leave your badge on the desk."`,
    ],
  },
  oddball: {
    office: (m, you, P) => `${m} swivels around in ${P.their} chair, steeples ${P.their} fingers like a movie villain, and gestures grandly at the empty seat.`,
    phone: (m, you, P) => `Your phone rings. ${m} is humming dramatic music before you even say hello.`,
    talk: [
      (m, you, P, L) => `${m} is fighting a grin and losing. "Okay. Honestly? Kind of iconic. Bold move. Love the confidence." ${P.They} sigh${P.s} and pull${P.s} out a form. "Unfortunately I'm legally required to be horrified, so: I am horrified. Write-up. Maybe bring ${L.some} tomorrow, just so HR stops sending me all-caps emails."`,
      (m, you, P) => `"Round two!" ${m} slaps the desk, then remembers ${P.they}'${P.they === 'they' ? 're' : 's'} supposed to be upset. "Ahem. I mean. Shocking. Appalling. This is your final warning, which is the official phrase, and I'm told I have to say it with a straight face." ${P.They} can't.`,
      (m, you, P) => `"Three. The legendary hat trick." ${m} stands and gives you a slow, solemn round of applause. "I'd keep you if it were up to me. It's not. Go out in style, ${you}."`,
    ],
  },
};

export const REPORT_REASONS = {
  report: (who) => `${who} came to me with a complaint. About your... attire.`,
  complaints: (n = 3) => `I've had ${n === 3 ? 'THREE' : n === 5 ? 'FIVE' : n} complaints about you today. All of them about the same thing.`,
  manager: () => `I saw you. With my own eyes. I can't unsee it.`,
  late: (mins) => `You were ${mins} minutes late this morning. And then you show up... like that.`,
  slacking: (n) => `Yesterday you left ${n} requests unfinished. People noticed. And then there's... the other thing.`,
  weekend: (who, g) => `${who} told me ${pronouns(g).they} saw you around town over the weekend. Dressed like... that. People talk, you know.`,
  commute: (who, g) => `${who} says ${pronouns(g).they} passed you in the street on the way to or from work. Dressed like... that. In broad daylight.`,
  absent: () => `You didn't show up yesterday. No call, nothing. I had to cover your work myself.`,
  walkout: () => `You clocked in yesterday and then just... left. In the middle of your shift. Explain that.`,
};

// Errands for days off. Each errand happens inside a shop interior.
export const ERRANDS = [
  { id: 'grocery', name: 'Buy groceries', place: 'supermarket', steps: [{ tag: 'shopshelf', label: 'Grab groceries from {label}', time: 2, carry: 'basket' }, { tag: 'shopshelf', label: 'Find more groceries in {label}', time: 2 }, { tag: 'checkout', label: 'Pay at {label}', time: 3, drop: true }] },
  { id: 'pharmacy', name: 'Pick up a prescription', place: 'pharmacy', steps: [{ tag: 'queue', label: 'Wait in line at {label}', time: 6 }, { tag: 'checkout', label: 'Pick up your medicine at {label}', time: 2.5 }] },
  { id: 'post', name: 'Mail a package', place: 'postoffice', steps: [{ tag: 'shopshelf', label: 'Grab a box at {label}', time: 1.5, carry: 'box' }, { tag: 'queue', label: 'Wait in line at {label}', time: 6 }, { tag: 'checkout', label: 'Mail it at {label}', time: 2.5, drop: true }] },
  { id: 'laundry', name: 'Wash your tops', place: 'laundromat', steps: [{ tag: 'washer', label: 'Load {label}', time: 2, carry: 'bag' }, { tag: 'bench', label: 'Wait at {label}', time: 8 }, { tag: 'washer', label: 'Unload {label}', time: 2, drop: true }] },
  { id: 'bank', name: 'Deposit a check', place: 'bank', steps: [{ tag: 'queue', label: 'Wait in line at {label}', time: 6 }, { tag: 'checkout', label: 'Deposit at {label}', time: 3 }] },
  { id: 'hardware', name: 'Buy a new washing machine hose', place: 'hardware', steps: [{ tag: 'shopshelf', label: 'Find the hose in {label}', time: 2.5, carry: 'box' }, { tag: 'checkout', label: 'Pay at {label}', time: 3, drop: true }] },
  { id: 'books', name: 'Return library books', place: 'bookstore', steps: [{ tag: 'checkout', label: 'Return books at {label}', time: 2.5 }, { tag: 'shopshelf', label: 'Browse {label}', time: 3 }] },
];

export const PLACES = {
  supermarket: { name: 'FreshCo Supermarket', color: '#27ae60' },
  pharmacy: { name: 'CarePlus Pharmacy', color: '#e74c3c' },
  postoffice: { name: 'Post Office', color: '#2980b9' },
  laundromat: { name: 'Bubbles Laundromat', color: '#8e44ad' },
  bank: { name: 'First City Bank', color: '#34495e' },
  hardware: { name: 'Handy Hardware', color: '#e67e22' },
  bookstore: { name: 'Page Turner Books', color: '#a0522d' },
};

// Apartment complexes around town. Each game the player lives in one, and every coworker in one too.
// Where the workplace can stand: [city block, street side]. Every free slot is equally likely.
export const WORK_SLOTS = [
  ['3,0', 'n'], ['3,0', 'w'], ['1,1', 'n'], ['1,1', 'e'], ['1,1', 's'], ['1,1', 'w'], ['2,2', 'n'], ['2,2', 'e'], ['2,2', 's'], ['2,2', 'w'],
  ['0,1', 'n'], ['0,0', 'e'], ['1,0', 's'], ['3,2', 'e'], ['2,3', 'e'], ['3,1', 'e'], ['0,2', 'w'], ['1,3', 'w'], ['0,3', 'w'], ['3,3', 's'], ['2,0', 'w'],
];
/** A random work slot, not on the same block as home. */
export function randomWorkSlot(homeId) {
  const hb = APARTMENTS.find((a) => a.id === homeId)?.block;
  const ok = WORK_SLOTS.map((w, i) => i).filter((i) => WORK_SLOTS[i][0] !== hb);
  return ok[Math.floor(Math.random() * ok.length)];
}

export const APARTMENTS = [
  { id: 'maple', name: 'Maple Court Apartments', short: 'Maple Court', color: '#5d4037', block: '0,3', side: 'e', wall: '#d9cbb8', carpet: '#6d5d4b', lobbyFloor: '#8d6e63', lobbyWall: '#e3d5c3' },
  { id: 'riverside', name: 'Riverside Towers', short: 'Riverside Towers', color: '#1e3799', block: '3,3', side: 'n', wall: '#c8d6e5', carpet: '#34495e', lobbyFloor: '#576574', lobbyWall: '#dfe6e9' },
  { id: 'oakwood', name: 'Oakwood Residences', short: 'Oakwood', color: '#6d4c41', block: '3,1', side: 'w', wall: '#e3c4a8', carpet: '#7b4f2c', lobbyFloor: '#6d4c41', lobbyWall: '#f0dcc3' },
  { id: 'cedar', name: 'Cedar Heights', short: 'Cedar Heights', color: '#2d6a4f', block: '0,2', side: 'e', wall: '#cfe0d4', carpet: '#2d6a4f', lobbyFloor: '#52796f', lobbyWall: '#e5efe8' },
  { id: 'pine', name: 'Pine View Lofts', short: 'Pine View', color: '#00695c', block: '1,3', side: 's', wall: '#d4e6e1', carpet: '#00695c', lobbyFloor: '#4f6f6a', lobbyWall: '#e7f2ef' },
  { id: 'elm', name: 'Elm Garden Flats', short: 'Elm Garden', color: '#8e44ad', block: '2,0', side: 'n', wall: '#e2d4ea', carpet: '#5b3f73', lobbyFloor: '#7d6a8c', lobbyWall: '#efe6f3' },
];
export const aptById = (id) => APARTMENTS.find((a) => a.id === id) || APARTMENTS[0];
export const randomApartment = () => APARTMENTS[Math.floor(Math.random() * APARTMENTS.length)].id;

export const FEMALE_NAMES = ['Mia', 'Priya', 'Sofia', 'Hana', 'Aria', 'Nora', 'Yuki', 'Lena', 'Chloe', 'Emma', 'Ines', 'Maya', 'Ruth', 'Zoe', 'Ivy', 'Clara', 'Amara', 'Elena', 'Rosa', 'Tess', 'Mei', 'Freya', 'Lucia', 'Naomi', 'Ava', 'Isla', 'Grace', 'Lily', 'Ella', 'Sara', 'Nina', 'Leah', 'Julia', 'Alice', 'Hazel', 'Iris', 'Jade', 'Kira', 'Luna', 'Mila', 'Olivia', 'Paige', 'Quinn', 'Rina', 'Sakura', 'Tara', 'Una', 'Vera', 'Wren', 'Yara', 'Zara', 'Aiko', 'Bianca', 'Carmen', 'Dahlia', 'Esme', 'Fiona', 'Gemma', 'Helena', 'Imani', 'Jasmine', 'Keiko', 'Laila', 'Mariko', 'Nadia', 'Ophelia', 'Penny', 'Rhea', 'Selma', 'Talia', 'Uma', 'Valeria', 'Willa', 'Ximena', 'Yasmin', 'Zuri', 'Anya', 'Beatrice', 'Celine', 'Daria', 'Eva', 'Farah', 'Greta', 'Hope', 'Ingrid', 'June', 'Kate', 'Lorena', 'Molly', 'Nell', 'Paloma', 'Rosalind', 'Sienna', 'Thea', 'Violet', 'Wendy'];
export const MALE_NAMES = ['Daniel', 'Kenji', 'Marcus', 'Leo', 'Felix', 'Theo', 'Omar', 'Ravi', 'Jonah', 'Mateo', 'Elliot', 'Samir', 'Hugo', 'Victor', 'Noah', 'Ethan', 'Diego', 'Kai', 'Ivan', 'Oscar', 'Tomas', 'Arjun', 'Liam', 'Rafael', 'Adam', 'Ben', 'Caleb', 'Dev', 'Eli', 'Finn', 'Gabriel', 'Henry', 'Isaac', 'Jack', 'Kofi', 'Luca', 'Malik', 'Nate', 'Owen', 'Pablo', 'Quentin', 'Rory', 'Sam', 'Tariq', 'Umar', 'Vince', 'Wes', 'Xavier', 'Yusuf', 'Zane', 'Aaron', 'Bruno', 'Colin', 'Dante', 'Emil', 'Farid', 'Gus', 'Haruto', 'Ian', 'Jasper', 'Kieran', 'Lars', 'Milo', 'Nico', 'Otto', 'Pierce', 'Reid', 'Simon', 'Tobias', 'Uriel', 'Vik', 'Warren', 'Yosef', 'Abel', 'Basil', 'Cyrus', 'Dmitri', 'Ezra', 'Frank', 'Glen', 'Hassan', 'Ibrahim', 'Jun', 'Kurt', 'Lionel', 'Martin', 'Nolan', 'Paolo', 'Rami', 'Sergei', 'Tyler', 'Viktor', 'Walter'];
export const DEFAULT_COWORKER_NAMES = [...FEMALE_NAMES, ...MALE_NAMES];
/** A first name that fits the gender and isn't taken yet. */
export function nameFor(gender, used = new Set()) {
  const list = (gender === 'male' ? MALE_NAMES : FEMALE_NAMES).filter((n) => !used.has(n));
  return list.length ? list[Math.floor(Math.random() * list.length)] : (gender === 'male' ? 'Sam' : 'Sam') + ' ' + (used.size + 1);
}
/** Best guess at a gender from a name (for saves made before every character had one). */
export function guessGender(name) {
  const n = String(name || '').trim().replace(/^(mr|mrs|ms|miss)\.?\s+/i, (m) => m.toLowerCase());
  if (/^mr\b/i.test(n)) return 'male';
  if (/^(mrs|ms|miss)\b/i.test(n)) return 'female';
  const first = n.split(/\s+/)[0];
  if (FEMALE_NAMES.includes(first)) return 'female';
  if (MALE_NAMES.includes(first)) return 'male';
  return /[aeiy]$/i.test(first) ? 'female' : 'male';
}
/** Guess a model's gender from its title (for imported models with none set). */
export function guessModelGender(title) {
  return /\b(male|man|boy|guy|men)\b|(^|[^fe])male/i.test(title || '') && !/female|woman|girl/i.test(title || '') ? 'male' : 'female';
}
export const DEFAULT_PERSONALITIES = ['friend', 'strict', 'sympathetic', 'neutral', 'oddball', 'distant', 'sympathetic', 'neutral', 'friend', 'strict', 'oddball', 'neutral'];

// every color except skin comes from the dye pool (see dyes.js); defaults are named dyes
const D = (name) => DYES.find((d) => d[0] === name)?.[1] || DYE_HEX[0];
export const COLORS = {
  skin: ['#f3d2b8', '#e8b98f', '#c98e62', '#8d5a3b', '#5c3a24'],
  hair: DYE_HEX,
  top: DYE_HEX,
  bottom: DYE_HEX,
  under: DYE_HEX,
  eye: DYE_HEX,
  tint: [null, ...DYE_HEX],
  defaults: { hair: D('Chocolate Brown'), top: D('Snow White'), bottom: D('Soot Black'), under: D('Pink'), eye: D('Ink Blue') },
};

// ---------------------------------------------------------------------------
// What each coworker role does all day: a home station tag and the tasks they
// prefer. Indices line up with ROLE_NAMES[job]. Coworkers beyond 12 reuse roles.
const R = (home, ...tasks) => ({ home, tasks });
export const ROLE_TASKS = {
  office: [
    R('desk', 'Answer emails', 'Print & deliver a report', 'File paperwork'),
    R('meetingtable', 'Prepare a meeting', 'Make copies', 'Deliver paperwork to the manager'),
    R('reception', 'Greet a client', 'Sort the mail', 'Water the plants'),
    R('copier', 'Make copies', 'Brew coffee for the team', 'Restock the break room'),
    R('cabinet', 'File paperwork', 'Retrieve old files', 'Deliver paperwork to the manager'),
    R('server', 'Reboot the server', 'Print & deliver a report'),
    R('desk', 'Print & deliver a report', 'Answer emails'),
    R('desk', 'Answer emails', 'Make copies'),
    R('desk', 'Greet a client', 'Print & deliver a report'),
    R('officedesk', 'File paperwork', 'Check the staff schedule', 'Deliver paperwork to the manager'),
    R('meetingtable', 'Prepare a meeting', 'Retrieve old files'),
    R('desk', 'Answer emails', 'Sort the mail'),
  ],
  restaurant: [
    R('table', 'Serve a table', 'Refill drinks', 'Bus a table'),
    R('stove', 'Fetch ingredients', 'Grab ice cream'),
    R('host', 'Roll silverware', 'Fold napkins'),
    R('dish', 'Bus a table', 'Take out the trash', 'Mop up a spill'),
    R('stove', 'Fetch ingredients'),
    R('bar', 'Serve the bar', 'Refill drinks'),
    R('prep', 'Fetch ingredients', 'Grab ice cream'),
    R('dish', 'Bus a table', 'Clean the restroom', 'Take out the trash'),
    R('table', 'Serve a table', 'Refill drinks'),
    R('prep', 'Grab ice cream', 'Fetch ingredients'),
    R('table', 'Serve a table', 'Bus a table'),
    R('pass', 'Serve a table', 'Refill drinks'),
  ],
  retail: [
    R('shelf', 'Restock an aisle', 'Price check'),
    R('register', 'Work the register', 'Process returns', 'Deliver paperwork to the manager'),
    R('register', 'Work the register', 'Price check'),
    R('stockbox', 'Restock an aisle', 'Unload a delivery'),
    R('display', 'Fold clothes'),
    R('register', 'Work the register'),
    R('fitting', 'Clear the fitting rooms', 'Fold clothes'),
    R('dock', 'Unload a delivery', 'Take out the trash'),
    R('shelf', 'Restock an aisle', 'Mop up a spill'),
    R('shelf', 'Price check', 'Restock an aisle'),
    R('display', 'Fold clothes', 'Clear the fitting rooms'),
    R('returnbin', 'Process returns'),
  ],
  hotel: [
    R('frontdesk', 'Check in a guest', 'Answer the concierge phone'),
    R('concierge', 'Answer the concierge phone', 'Tidy the lounge'),
    R('guestbed', 'Make up a room', 'Wash towels', 'Restock the minibar'),
    R('luggage', 'Carry luggage'),
    R('guestbed', 'Make up a room', 'Restock the minibar'),
    R('washer', 'Wash towels', 'Fold laundry'),
    R('frontdesk', 'Check in a guest', 'Deliver paperwork to the manager'),
    R('luggage', 'Carry luggage', 'Tidy the lounge'),
    R('guestbed', 'Make up a room', 'Wash towels'),
    R('luggage', 'Carry luggage'),
    R('frontdesk', 'Check in a guest'),
    R('mop', 'Mop up a spill', 'Clean the restroom', 'Take out the trash'),
  ],
  library: [
    R('circ', 'Check out books', 'Help a patron find a book'),
    R('archivebox', 'Scan old documents'),
    R('circ', 'Check out books', 'Shelve returned books'),
    R('bookshelf', 'Shelve returned books', 'Tidy the reading tables'),
    R('readtable', 'Help a patron find a book', 'Tidy the reading tables'),
    R('computer', 'Help a patron find a book'),
    R('circ', 'Help a patron find a book', 'Check out books'),
    R('bookshelf', 'Shelve returned books', 'Clean a study room'),
    R('bookshelf', 'Shelve returned books'),
    R('repair', 'Repair damaged books', 'Scan old documents'),
    R('studytable', 'Clean a study room', 'Tidy the reading tables'),
    R('repair', 'Repair damaged books'),
  ],
  warehouse: [
    R('rack', 'Pick an order', 'Scan inventory'),
    R('rack', 'Receive a shipment', 'Pick an order'),
    R('packing', 'Ship a package', 'Pick an order'),
    R('terminal', 'Scan inventory', 'Label pallets', 'Deliver paperwork to the manager'),
    R('dock', 'Ship a package', 'Receive a shipment'),
    R('rack', 'Pick an order'),
    R('terminal', 'Scan inventory', 'Label pallets'),
    R('packing', 'Ship a package'),
    R('dock', 'Receive a shipment', 'Take out the trash'),
    R('dock', 'Receive a shipment'),
    R('rack', 'Pick an order', 'Clear the conveyor'),
    R('conveyor', 'Clear the conveyor', 'Mop up a spill'),
  ],
  cafe: [
    R('espresso', 'Make a latte', 'Deliver an order'),
    R('oven', 'Bake pastries', 'Restock the pastry case'),
    R('counter', 'Make a latte', 'Deliver an order', 'Deliver paperwork to the manager'),
    R('counter', 'Make a latte', 'Wipe tables'),
    R('roaster', 'Roast beans', 'Grind coffee'),
    R('espresso', 'Make a latte', 'Grind coffee'),
    R('dish', 'Wipe tables', 'Take out the trash', 'Mop up a spill'),
    R('espresso', 'Deliver an order', 'Make a latte'),
    R('oven', 'Bake pastries'),
    R('counter', 'Make a latte'),
    R('espresso', 'Make a latte', 'Wipe tables'),
    R('cafetable', 'Deliver an order', 'Wipe tables'),
  ],
};

// Mishaps that fit what you were doing when it happened (by station tag).
const M = (wet, fn) => ({ wet, fn });
export const MISHAP_BY_TAG = {
  printer: M(false, W((n, L, P) => `The printer jams, and when ${n} reaches in to clear it, the paper feed grabs the hem of ${P.their} ${L.n} and eats ${L.them}, inch by inch, with a horrible grinding noise.`)),
  copier: M(false, W((n, L, P) => `${n} leans on the copier lid. The lid snaps shut on ${P.their} ${L.n}, and when ${P.they} pull${P.s} away... RRRIP. The copier now has a fabric souvenir.`)),
  scanner: M(false, W((n, L, P) => `${n} leans on the scanner lid. It snaps shut on ${P.their} ${L.n}, and when ${P.they} pull${P.s} away... RRRIP.`)),
  shredder: M(false, W((n, L) => `${n}'s ${L.n} drift${L.s} a little too close to the shredder. It does not hesitate.`)),
  cabinet: M(false, W((n, L, P) => `${n} slams the filing cabinet drawer shut with ${P.their} ${L.n} caught inside, then steps away. RRRRIP.`)),
  archivebox: M(false, W((n, L, P) => `A shelf of heavy archive boxes topples. ${n} leaps clear, but ${P.their} ${L.n} stay${L.s} pinned under the boxes... and tear${L.s} right off.`)),
  supply: M(false, W((n, L, P) => `${n} snags ${P.their} ${L.n} on a nail sticking out of the supply shelf. One step later there is a long, loud RRRRIP.`)),
  stockbox: M(false, W((n, L) => `${n}'s ${L.n} hook${L.s} on a loose pallet strap. The pallet jack rolls off with ${L.them}, straight into the compactor.`)),
  shelf: M(false, W((n, L, P) => `${n} climbs the bottom shelf to reach the top. ${P.Their} ${L.n} catch${L.es} on a price tag hook, and when ${P.they} hop${P.s} down, the ${L.n} stay${L.s} up there.`)),
  rack: M(false, W((n, L) => `${n}'s ${L.n} catch${L.es} on the edge of a steel rack. One step later, RRRRIP. There's not much left of ${L.them}.`)),
  dock: M(false, W((n, L) => `A delivery truck pulls away from the dock with the hem of ${n}'s ${L.n} caught in its door. ${n} stays. The ${L.n} ${L.n === 'skirt' ? 'does' : 'do'} not.`)),
  pallet: M(false, W((n, L) => `${n}'s ${L.n} snag${L.s} on a splintered pallet. One step later there is a long, loud RRRRIP.`)),
  conveyor: M(false, W((n, L) => `${n}'s ${L.n} catch${L.es} on the conveyor belt, which happily carries ${L.them} off to the shipping area.`)),
  packing: M(false, W((n, L, P) => `${n} accidentally tapes ${P.their} ${L.n} into a shipping box. By the time ${P.they} notice${P.s}, the box has shipped.`)),
  coffee: M(true, W((n, L, P) => `The coffee pot slips. A full pot of coffee pours down ${n}'s ${L.n}. ${P.They} peel${P.s} ${L.them} off before ${L.they} burn${L.s}, and ${L.theyre} soaked and stained beyond saving.`)),
  espresso: M(true, W((n, L, P) => `The steam wand sputters and blasts ${n}'s ${L.n} with scalding milk. ${P.They} ${P.have} to take ${L.them} off right away, and ${L.theyre} ruined.`)),
  soda: M(true, W((n, L) => `The soda fountain nozzle breaks off and sprays ${n}'s ${L.n} with sticky cola. Soaked, sticky and ruined.`)),
  bar: M(true, W((n, L) => `A bottle of syrup shatters and drenches ${n}'s ${L.n}. ${L.They} ${L.have} to come off, and ${L.theyre} ruined.`)),
  table: M(true, W((n, L, P) => `A diner knocks over a bowl of tomato soup, right onto ${n}'s ${L.n}. ${P.They} peel${P.s} ${L.them} off before ${L.they} stain${L.s}, but ${L.theyre} soaked and unwearable.`)),
  cafetable: M(true, W((n, L) => `A customer's iced coffee tips over straight onto ${n}'s ${L.n}. Soaked, sticky and ruined.`)),
  pass: M(true, W((n, L) => `A tray of soup bowls tips over at the pass, right onto ${n}'s ${L.n}. ${L.Theyre} soaked, scalding and unwearable.`)),
  stove: M(true, W((n, L) => `A pot of pasta water boils over onto ${n}'s ${L.n}. ${L.They} ${L.have} to come off immediately, and ${L.theyre} soaked and ruined.`)),
  prep: M(false, W((n, L) => `${n}'s ${L.n} catch${L.es} on the meat slicer's handle. The slicer makes short work of ${L.them}.`)),
  oven: M(false, W((n, L, P) => `${n} backs into the hot oven door, and ${P.their} ${L.n} scorch${L.es} and melt${L.s} right off.`)),
  roaster: M(false, W((n, L) => `${n} stands too close to the roaster vent. The ${L.n} singe${L.s}, smoke${L.s}, and fall${L.s} apart.`)),
  dish: M(true, W((n, L) => `The dish sprayer slips out of its holder and blasts ${n}'s ${L.n} with soapy water. ${L.Theyre} drenched and see-through, so off ${L.they} come${L.s}.`)),
  sink: M(true, W((n, L) => `The faucet handle snaps off and a geyser of water drenches ${n}'s ${L.n}. Soaked through and ruined.`)),
  washer: M(true, W((n, L) => `A washing machine door pops open mid-cycle, flooding ${n}'s ${L.n} with soapy water. ${L.Theyre} soaked and ruined.`)),
  mop: M(true, W((n, L, P) => `${n} knocks over the mop bucket, dousing ${P.their} ${L.n} in dirty mop water. ${L.They} ${L.have} to come off right now.`)),
  spill: M(true, W((n, L, P) => `${n} slips in the spill and lands right in it. ${P.Their} ${L.n} ${L.are} soaked through and ruined.`)),
  trash: M(false, W((n, L) => `The trash bag splits open over ${n}'s ${L.n}. ${L.Theyre} covered in something unspeakable, and there's no saving ${L.them}.`)),
  dumpster: M(false, W((n, L) => `${n}'s ${L.n} catch${L.es} on the dumpster lid as it slams shut. One step later: RRRRIP.`)),
  fridge: M(false, W((n, L, P) => `${n}'s ${L.n} get${L.s} caught in the fridge door, and when ${P.they} turn${P.s} away... RRRIP.`)),
  freezer: M(false, W((n, L, P) => `${n}'s ${L.n} freeze${L.s} to the walk-in freezer shelf. When ${P.they} pull${P.s} free, the ${L.n} stay${L.s} behind.`)),
  guestbed: M(false, W((n, L, P) => `${n} trips over the bedsheets and ${P.their} ${L.n} tangle${L.s} in the bed frame. RRRRIP.`)),
  luggage: M(false, W((n, L) => `${n}'s ${L.n} catch${L.es} in a suitcase zipper, and the luggage cart rolls away with ${L.them}.`)),
  bookshelf: M(false, W((n, L, P) => `${n} climbs the library ladder; ${P.their} ${L.n} catch${L.es} on a shelf bracket and stay${L.s} behind on the way down.`)),
  returncart: M(false, W((n, L) => `${n}'s ${L.n} tangle${L.s} in the book cart wheel. The cart wins.`)),
  repair: M(false, W((n, L, P) => `${n} sits on the book repair bench, right on the fresh glue. The ${L.n} ${L.are} glued in place when ${P.they} stand${P.s} up. ${P.They} stand${P.s} up anyway.`)),
  plant: M(true, W((n, L) => `The watering can spout pops off and the whole can empties onto ${n}'s ${L.n}. Soaked and muddy.`)),
};
export const MISHAP_GENERIC = M(false, W((n, L) => `${n}'s zipper and button give out at the same moment. The ${L.n} simply slide${L.s} down to the floor... and refuse${L.s} to stay up.`));
export function mishapFor(tag) {
  return MISHAP_BY_TAG[tag] || MISHAP_GENERIC;
}

// Shame amounts (multiplied by the Shame Intensity setting)
export const SHAME = {
  pedestrian: 3, pedestrianStare: 0.35, busDriver: 2, busPass: 1.5, busNeighbor: 2, busNeighborRate: 0.06, busStandRate: 0.04, busStandCap: 0.5,
  friend: 2, sympathetic: 3, oddball: 1, neutralWarn: 6, report: 4, customer: 4, managerTalk: 5, clerk: 2, encounterFriendly: 2, encounterHostile: 4,
  dog: 1, sleep: 25, soaked: 0.3,
};

export const DEFAULT_SETTINGS = {
  civilians: [],
  useBundledCivilians: true,
  celesti: null,
  celestiName: 'Celesti',
  hourSeconds: 240,
  shameScale: 1,
  detectScale: 1,
  sleepRecovery: true,
  exprMax: 0.7,
  minimap: true,
  wetMaxSee: 0.5,
  allowedUnfinished: 2,
  complaintLimit: 5,
  dynamicRes: true,
  outlines: true,
  quality: 'medium',
  volMaster: 0.8,
  volSfx: 1,
  volVoice: 0.9,
  volAmbient: 0.6,
  volUi: 0.8,
};

export const BUNDLED = {
  civilians: [
    { asset: 'HBFemaleYoung1.vrm', title: 'Townsperson (young woman)', gender: 'female' },
    { asset: 'HBFemaleOld1.vrm', title: 'Townsperson (older woman)', gender: 'female' },
    { asset: 'HBMaleYoung1.vrm', title: 'Townsperson (young man)', gender: 'male' },
    { asset: 'HBMaleOld1.vrm', title: 'Townsperson (older man)', gender: 'male' },
  ],
  celesti: 'CelestiAngelic.vrm',
  bodies: [
    { asset: 'HBFemaleYoung1.vrm', title: 'Built-in: young woman', gender: 'female' },
    { asset: 'HBFemaleOld1.vrm', title: 'Built-in: older woman', gender: 'female' },
    { asset: 'HBMaleYoung1.vrm', title: 'Built-in: young man', gender: 'male' },
    { asset: 'HBMaleOld1.vrm', title: 'Built-in: older man', gender: 'male' },
  ],
};

export const WEATHER = {
  sunny: { label: 'Sunny', rain: 0 },
  cloudy: { label: 'Cloudy', rain: 0 },
  rain: { label: 'Rainy', rain: 1 },
};
export function weatherFor(day, seed = 0) {
  const r = Math.abs(Math.sin(day * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  return r < 0.45 ? 'sunny' : r < 0.7 ? 'cloudy' : 'rain';
}

/** Pronouns plus the verb endings that go with them ("she notices" / "they notice"). */
export function pronouns(gender) {
  const sing = { s: 's', es: 'es', are: 'is', were: 'was', have: 'has' };
  if (gender === 'male') return { they: 'he', them: 'him', their: 'his', theirs: 'his', theyre: "he's", They: 'He', Their: 'His', Theyre: "He's", self: 'himself', ...sing };
  if (gender === 'female') return { they: 'she', them: 'her', their: 'her', theirs: 'hers', theyre: "she's", They: 'She', Their: 'Her', Theyre: "She's", self: 'herself', ...sing };
  return { they: 'they', them: 'them', their: 'their', theirs: 'theirs', theyre: "they're", They: 'They', Their: 'Their', Theyre: "They're", self: 'themselves', s: '', es: '', are: 'are', were: 'were', have: 'have' };
}

/** Words for a piece of legwear, so a skirt reads as "a skirt... it is" and pants as "some pants... they are". */
export function lwWords(type) {
  const sk = /skirt/i.test(type || '');
  return sk
    ? { n: 'skirt', bare: 'a skirt', some: 'a skirt', a: 'a skirt', are: 'is', were: 'was', them: 'it', they: 'it', They: 'It', theyre: "it's", Theyre: "It's", s: 's', es: 'es', have: 'has' }
    : { n: 'pants', bare: 'pants', some: 'some pants', a: 'a pair of pants', are: 'are', were: 'were', them: 'them', they: 'they', They: 'They', theyre: "they're", Theyre: "They're", s: '', es: '', have: 'have' };
}

// Underwear designs (texture overlays in the VRoid body layout). 'LegoBlack' ones are plain and take any
// color; floral/heart/star ones keep their own print. Males only get the fuller cuts.
export const UNDERWEAR = {
  patterns: ['Floral', 'Lace', 'RegalFloral', 'Signature', 'Stripes', 'Swirls'],
  panties: ['BandThongLegoBlack', 'BikiniBriefFloralPastelPink', 'BikiniBriefLegoBlack', 'BikiniHipstersLegoBlack', 'BoyshortLegoBlack', 'BrazilianBriefsLegoBlack', 'BriefsLegoBlack', 'CheekyHighRiseLegoBlack', 'CheekyHipstersLegoBlack', 'CuteCheekyBriefsLegoBlack', 'EorzeanBriefsLegoBlack', 'EriHighBriefsLegoBlack', 'FrenchCutLegoBlack', 'FrenchCutThongLegoBlack', 'FullThongLegoBlack', 'HalfThongBriefLegoBlack', 'HalfThongLegoBlack', 'HalfTycoonsLegoBlack', 'HighCutThongLegoBlack', 'HighRiseLegoBlack', 'HighRiseTrimLegoBlack', 'HipstersLegoBlack', 'LowRiseCheekyLegoBlack', 'LowRiseCheekyTrimmedLegoBlack', 'LowRiseTangaLegoBlack', 'MidRiseThongLegoBlack', 'NierThongLegoBlack', 'ShapingBriefsLegoBlack', 'SimpleBikiniBriefLegoBlack', 'StringBikiniLegoBlack', 'StringTangaLegoBlack', 'StringThongLegoBlack', 'TangaLegoBlack', 'ThongBriefLegoBlack', 'ThongLegoBlack', 'TrimmedBriefsLegoBlack', 'TrimmedFullBriefLegoBlack', 'TycoonsLegoBlack'],
  bras: ['AdhesiveBraLegoBlack', 'BalconetteBraLegoBlack', 'BikiniBraLegoBlack', 'BraFloralNude', 'BraFloralPastelPink', 'BraLegoBlack', 'EorzeanBraLegoBlack', 'FullCupBraLegoBlack', 'HalfCupBraLegoBlack', 'HalterTopBraLegoBlack', 'LaceBraLegoBlack', 'PlungeBraLegoBlack', 'RacerbackBraLegoBlack', 'SportsBraLegoBlack', 'SportsBraStarsLegoBlack', 'SportsBraTrimmedLegoBlack', 'StraplessBraFloralPastelPink', 'StraplessBraFloralPink', 'StraplessBraLegoBlack', 'TShirtBraLegoBlack', 'TriangleBraLegoBlack', 'TrimmedBikiniBraHearts', 'TrimmedBikiniBraLegoBlack', 'WirelessBraLegoBlack'],
  male: ['BoyshortLegoBlack', 'BriefsLegoBlack', 'EorzeanBriefsLegoBlack', 'HighRiseLegoBlack', 'HighRiseTrimLegoBlack', 'ShapingBriefsLegoBlack', 'TrimmedBriefsLegoBlack', 'TrimmedFullBriefLegoBlack'],
};
export const UNDERWEAR_COLORS = DYE_HEX;
export function prettyUnderwear(n) {
  return n.replace(/LegoBlack$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}
/** Random underwear for a character who doesn't have any chosen. */
export function randomUnderwear(gender) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const plain = (n) => /LegoBlack$/.test(n);
  const panty = pick(gender === 'male' ? UNDERWEAR.male : UNDERWEAR.panties);
  // matching sets now and then
  let bra = null;
  if (gender !== 'male') {
    const print = panty.replace(/^.*?(Floral|Hearts|Stars)/, '$1');
    const match = !plain(panty) && UNDERWEAR.bras.find((x) => x.includes(print));
    bra = match || pick(UNDERWEAR.bras.filter(plain));
  }
  // now and then a print on a woman's plain underwear: the pattern's light parts take an accent color
  const print = gender !== 'male' && Math.random() < 0.2 ? { pattern: pick(UNDERWEAR.patterns), accent: pick(UNDERWEAR_COLORS) } : {};
  const color = pick(UNDERWEAR_COLORS);
  // a mismatched set now and then: the bra gets its own color (and print, or none)
  const mix = bra && Math.random() < 0.3 ? { braColor: pick(UNDERWEAR_COLORS), braPattern: Math.random() < 0.2 ? pick(UNDERWEAR.patterns) : '', braAccent: pick(UNDERWEAR_COLORS) } : {};
  return { panty, bra, color, ...print, ...mix };
}

/** An outfit body taken from an imported civilian model, with that model's part settings. */
export function civBodyFrom(c) {
  return {
    key: c.key, title: c.title, civ: true, tintable: true, underwearOverlay: false,
    materials: c.materials ? [...c.materials] : undefined,
    legwearMaterials: c.legwearMaterials ? [...c.legwearMaterials] : null,
    wetMaterials: c.wetMaterials ? [...c.wetMaterials] : [],
    keepMaterials: c.cfg?.keep ? [...c.cfg.keep] : null,
    cfg: c.cfg ? JSON.parse(JSON.stringify(c.cfg)) : null,
  };
}
/** A random body for a gender: any built-in body or imported civilian model of that gender. */
export function randomBodyFor(gender, civs = []) {
  const pool = [
    ...BUNDLED.bodies.filter((b) => !gender || b.gender === gender).map((b) => ({ b })),
    ...(civs || []).filter((c) => c.key && (!gender || (c.gender || 'female') === gender)).map((c) => ({ c })),
  ];
  const x = pool[Math.floor(Math.random() * pool.length)] || { b: BUNDLED.bodies[0] };
  return x.b ? { asset: x.b.asset, title: x.b.title, tintable: true, legwearMaterials: null, underwearOverlay: false, wetMaterials: null } : civBodyFrom(x.c);
}
