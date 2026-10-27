// Static game data: jobs, personalities, story text, task templates.

export const PERSONALITIES = {
  friend: {
    label: 'Best Friend',
    desc: 'Always has your back. Will lend you their own legwear or cause a distraction.',
    report: false,
  },
  sympathetic: {
    label: 'Sympathetic',
    desc: 'Kind and discreet. Keeps your secret and creates distractions for you.',
    report: false,
  },
  neutral: {
    label: 'Neutral',
    desc: 'Awkward about it. Lets it slide once, but a second time they go to the boss.',
    report: 'second',
  },
  strict: {
    label: 'Strict',
    desc: 'A stickler for the dress code. Reports you on sight.',
    report: true,
  },
  distant: {
    label: 'Distant',
    desc: 'Cold and by-the-book. Quietly files a complaint with HR.',
    report: true,
  },
};

export const JOBS = {
  office: {
    label: 'Office Worker',
    desc: 'Cubicles, printers and filing cabinets. Partitions give good cover, but the open floor is risky.',
    roles: ['Desk Neighbor', 'Team Lead', 'Receptionist', 'Intern'],
    customerWord: 'client',
    workplaceName: 'Brightline Solutions Ltd.',
    mishap: (lw) =>
      `While clocking in, your ${lw} snag on the sharp corner of the old time clock. One step later there is a long, loud RRRRIP. ` +
      `The ${lw} are torn beyond saving. You stuff the remains into your locker... and realize your underwear is now on full display. ` +
      `Your shift starts now. Nobody can find out.`,
  },
  restaurant: {
    label: 'Restaurant Server',
    desc: 'Tables, trays and a busy kitchen. Carry a tray in front of you to stay covered.',
    roles: ['Fellow Server', 'Head Chef', 'Host', 'Busser'],
    customerWord: 'diner',
    workplaceName: 'Trattoria Bella',
    mishap: (lw) =>
      `Right after you clock in, a busser rounds the corner and a whole pot of tomato soup lands on your ${lw}. ` +
      `You rush to the staff bathroom and peel them off before they stain, but they're soaked and scalding — unwearable. ` +
      `The lunch rush is starting. You'll have to work like this... without anyone noticing.`,
  },
  retail: {
    label: 'Retail Worker',
    desc: 'Tall shelves and a checkout counter. Aisles make great hiding spots, customers wander everywhere.',
    roles: ['Shift Buddy', 'Store Manager', 'Cashier', 'Stock Clerk'],
    customerWord: 'shopper',
    workplaceName: 'MegaMart Express',
    mishap: (lw) =>
      `Right after clocking in, you squeeze past a pallet in the stockroom. Your ${lw} hook on a loose strap and the pallet jack rolls away — ` +
      `taking your ${lw} with it, straight into the trash compactor. ` +
      `The store opens in one minute. Act natural.`,
  },
};

export const STORY = {
  intro: (name) =>
    `${name}'s alarm blares. Another ordinary workday... or so it seems.\n\nGet ready for work, then head out the front door.`,
  day1Evening: (lw) =>
    `You made it home! You head straight for the wardrobe to grab a fresh pair of ${lw}...\n\n` +
    `...and find a puddle. The washing machine leaked overnight and flooded the closet. Every last pair of pants and every skirt you own is soaked, mildewed and ruined.\n\n` +
    `Payday isn't until after your third shift. Until then, you'll have to go to work just like this.`,
  morningNoClothes:
    `The wardrobe is still a soggy, ruined mess. Nothing to wear on your legs. Again.\n\nDeep breath. Just three days. You can do this.`,
  win: (name) =>
    `Three shifts. Three commutes. Not a single dress-code violation on record.\n\n` +
    `Payday arrives and ${name} marches straight to the store for a brand new wardrobe. Nobody at work will ever know... probably.`,
};

// Task templates per job. Each step references an interactable id in the work level.
// "{table}", "{shelf}", "{desk}", "{cab}" are substituted with random options.
export const TASKS = {
  office: [
    {
      name: 'Print & deliver a report',
      steps: [
        { target: 'printer', label: 'Collect the report from the printer', time: 2, carry: 'folder' },
        { target: 'desk:{desk}', label: 'Deliver the report to {deskName}', time: 1.2, drop: true },
      ],
    },
    { name: 'Make copies', steps: [{ target: 'copier', label: 'Run 200 copies at the copier', time: 4 }] },
    {
      name: 'File paperwork',
      steps: [
        { target: 'inbox', label: 'Pick up paperwork at the reception inbox', time: 1.5, carry: 'folder' },
        { target: 'cabinet{cab}', label: 'File it in cabinet {cab}', time: 2.5, drop: true },
      ],
    },
    { name: 'Answer emails', steps: [{ target: 'mydesk', label: 'Answer emails at your desk', time: 4 }] },
    {
      name: 'Restock printer paper',
      steps: [
        { target: 'supply', label: 'Grab a paper box from the supply closet', time: 1.5, carry: 'box' },
        { target: 'printer', label: 'Load paper into the printer', time: 2, drop: true },
      ],
    },
    { name: 'Water the plant', steps: [{ target: 'plant', label: 'Water the office plant', time: 2 }] },
  ],
  restaurant: [
    {
      name: 'Serve table {table}',
      steps: [
        { target: 'table{table}', label: 'Take the order at table {table}', time: 2 },
        { target: 'terminal', label: 'Enter the order at the kitchen terminal', time: 1.5 },
        { target: 'pass', label: 'Pick up the food at the kitchen pass', time: 1.5, carry: 'tray' },
        { target: 'table{table}', label: 'Deliver the food to table {table}', time: 1.5, drop: true },
      ],
    },
    {
      name: 'Bus table {table}',
      steps: [
        { target: 'table{table}', label: 'Clear the dishes from table {table}', time: 2, carry: 'tray' },
        { target: 'dish', label: 'Drop dishes at the dish station', time: 1.5, drop: true },
      ],
    },
    {
      name: 'Refill drinks',
      steps: [
        { target: 'soda', label: 'Fill drinks at the soda fountain', time: 2, carry: 'tray' },
        { target: 'table{table}', label: 'Bring drinks to table {table}', time: 1.2, drop: true },
      ],
    },
    { name: 'Roll silverware', steps: [{ target: 'host', label: 'Roll silverware at the host stand', time: 3.5 }] },
  ],
  retail: [
    {
      name: 'Restock aisle {shelf}',
      steps: [
        { target: 'stock', label: 'Grab a box from the stockroom', time: 1.5, carry: 'box' },
        { target: 'shelf{shelf}', label: 'Restock aisle {shelf}', time: 3, drop: true },
      ],
    },
    { name: 'Work the register', steps: [{ target: 'register', label: 'Ring up purchases at the register', time: 5 }] },
    { name: 'Fold clothes', steps: [{ target: 'display', label: 'Fold clothes at the display table', time: 3 }] },
    {
      name: 'Price check',
      steps: [
        { target: 'shelf{shelf}', label: 'Check prices in aisle {shelf}', time: 2 },
        { target: 'register', label: 'Update prices at the register', time: 1.5 },
      ],
    },
    {
      name: 'Return items',
      steps: [
        { target: 'register', label: 'Collect returned items at the register', time: 1.5, carry: 'box' },
        { target: 'shelf{shelf}', label: 'Put returns back in aisle {shelf}', time: 2, drop: true },
      ],
    },
  ],
};

export const TASK_QUOTA = [4, 5, 6];

export const DEFAULT_COWORKER_NAMES = ['Mia', 'Daniel', 'Priya', 'Kenji', 'Sofia', 'Marcus', 'Hana', 'Leo'];
export const DEFAULT_PERSONALITIES = ['friend', 'strict', 'sympathetic', 'neutral'];

export const COLORS = {
  skin: ['#f3d2b8', '#e8b98f', '#c98e62', '#8d5a3b', '#5c3a24'],
  hair: ['#2a1d16', '#5a3a22', '#b98a4a', '#e6c87a', '#c0392b', '#6c5ce7', '#ff7eb6', '#eeeeee'],
  top: ['#ffffff', '#3d5a80', '#2d3436', '#e17055', '#00b894', '#6c5ce7', '#fdcb6e'],
  bottom: ['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#7f8c8d', '#b33939'],
  under: ['#ff9ff3', '#ffffff', '#74b9ff', '#ffeaa7', '#55efc4', '#fd79a8'],
};
