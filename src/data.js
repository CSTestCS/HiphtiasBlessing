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

export const MISHAPS = [
  (n, lw) => `${n}'s ${lw} snag on a sharp corner. One step later there is a long, loud RRRRIP. The ${lw} are torn beyond saving.`,
  (n, lw) => `A whole pot of soup lands on ${n}'s ${lw}. They have to peel them off before they burn, and they are soaked and unwearable.`,
  (n, lw) => `${n}'s ${lw} catch on a loose strap of a rolling cart, which happily rolls away with them. They're gone.`,
  (n, lw) => `${n}'s zipper and button give out at the same moment. The ${lw} simply slide down to the floor... and refuse to stay up.`,
  (n, lw) => `A sudden gust from the air vent sends ${n}'s ${lw} flying into the shredder. Somehow.`,
  (n, lw) => `${n} sits on a freshly painted bench. By the time they notice, the ${lw} are glued to it.`,
];

export const STORY = {
  intro: (name) => `${name}'s alarm blares. Another ordinary Monday... or so it seems.\n\nGet ready for work, then head out the front door.`,
  day1Evening: (lw) =>
    `You made it home! You head straight for the wardrobe to grab a fresh pair of ${lw}...\n\n` +
    `...and find a puddle. The washing machine leaked overnight and flooded the closet. Every last pair of pants and every skirt you own is soaked, mildewed and ruined.\n\n` +
    `Payday isn't for a while. Until then, you'll have to get by just like this.`,
  morningNoClothes: `The wardrobe still holds nothing for your legs. Tops, yes. Pants or skirts? Not a single one.\n\nDeep breath. You can do this.`,
  celesti: (name, celestiName) => [
    [`Something's wrong...`, `${name} wakes with a start. There's a soft golden glow in the living room... and the sound of someone humming.\n\nSomeone is in the apartment.`],
    [`${celestiName}`, `"Oh! You're awake. Please don't scream! I come in peace."\n\nA figure with a shimmering halo and fluffy white wings bows politely.\n\n"My name is ${celestiName}. I am a messenger of Hiphtia, the goddess of hips."`],
    [`${celestiName}`, `"I'm afraid I have... news. You have been blessed by Hiphtia herself. That is why no pants or skirt will stay on you. Every one you own fell apart, didn't it? That was her doing."`],
    [`${celestiName}`, `"I know, I know. It feels much more like a curse than a blessing." She wrings her hands. "I'm so, so sorry. I tried to talk her out of it, truly. But Hiphtia is very... stubborn. I can't undo it."`],
    [`${celestiName}`, `"And there is one more thing." She winces. "From today on, the blessing will spread. Whoever you spend the most time with each workday will be blessed the very next workday."\n\n"Perhaps... if everyone at your workplace shares the blessing, Hiphtia will finally be satisfied."`],
    [`${celestiName}`, `"Be brave, ${name}. And... maybe stay close to the coworkers you'd like to share this with." With a flutter of feathers, ${celestiName} is gone.\n\n(From now on, the coworker you spend the most time near each workday gets blessed the next workday. Win when every coworker is blessed.)`],
  ],
  win: (name, celestiName) =>
    `That night, ${celestiName} appears once more, glowing brighter than ever.\n\n"Hiphtia is delighted! Every single one of your coworkers now shares the blessing. She's finally satisfied, ${name}."\n\n` +
    `The next morning, your wardrobe is full of pants and skirts again... and everyone at work quietly agrees never to speak of these weeks. You win!`,
  managerTalk: (mgr, name, lw, n, reason) => {
    const open = `${mgr} closes the office door and points at the chair. You stay standing, because sitting would be worse. ${mgr} keeps their eyes locked firmly on the ceiling.\n\n"${name}. ${reason}"\n\n`;
    if (n === 1)
      return (
        open +
        `"Let me be very clear. Underwear. Is. Not. Uniform." A long, painful silence. You can hear the wall clock ticking. ${mgr} clears their throat about six times.\n\n` +
        `"I'm writing you up. This is going in your file. Please... please find some ${lw}." They slide the form across the desk without looking up.\n\n(Write-up 1 of 3)`
      );
    if (n === 2)
      return (
        open +
        `"Again?! Do you have ANY idea how many emails I've received about you today?" ${mgr} rubs their temples. A coworker walks past the glass, does a double take, and keeps walking very fast.\n\n` +
        `"This is your final warning. One more and you're done here." They hand you the form by holding it out at arm's length, face turned to the wall.\n\n(Write-up 2 of 3 — final warning)`
      );
    return open + `"That's it. Three strikes. I'm sorry, but I can't have this in my workplace anymore. Please collect your things... and maybe a coat."\n\nYou're fired.`;
  },
};

export const REPORT_REASONS = {
  report: (who) => `${who} came to me with a complaint. About your... attire.`,
  complaints: () => `I've had THREE customer complaints today. All of them about the same thing.`,
  manager: () => `I saw you. With my own eyes. I can't unsee it.`,
  late: (mins) => `You were ${mins} minutes late this morning. And then you show up... like that.`,
  weekend: (who) => `${who} told me they saw you around town over the weekend. Dressed like... that. People talk, you know.`,
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

export const DEFAULT_COWORKER_NAMES = ['Mia', 'Daniel', 'Priya', 'Kenji', 'Sofia', 'Marcus', 'Hana', 'Leo', 'Aria', 'Felix', 'Nora', 'Theo', 'Yuki', 'Omar', 'Lena', 'Ravi'];
export const DEFAULT_PERSONALITIES = ['friend', 'strict', 'sympathetic', 'neutral', 'oddball', 'distant', 'sympathetic', 'neutral', 'friend', 'strict', 'oddball', 'neutral'];

export const COLORS = {
  skin: ['#f3d2b8', '#e8b98f', '#c98e62', '#8d5a3b', '#5c3a24'],
  hair: ['#2a1d16', '#5a3a22', '#b98a4a', '#e6c87a', '#c0392b', '#6c5ce7', '#ff7eb6', '#eeeeee'],
  top: ['#ffffff', '#3d5a80', '#2d3436', '#e17055', '#00b894', '#6c5ce7', '#fdcb6e', '#d63031', '#ff7eb6'],
  bottom: ['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#7f8c8d', '#b33939', '#f5f6fa'],
  under: ['#ff9ff3', '#ffffff', '#74b9ff', '#ffeaa7', '#55efc4', '#fd79a8', '#2d3436', '#e17055'],
  tint: [null, '#ffffff', '#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#fd79a8', '#636e72', '#e17055'],
};
