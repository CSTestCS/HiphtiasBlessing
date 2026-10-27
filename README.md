# Hiphtia's Blessing

A 3D workplace stealth comedy for Windows. Import your own VRoid / VRM characters for yourself, your coworkers, your manager, the townsfolk and the angel Celesti. Then survive work, commutes and weekends after a wardrobe mishap leaves you without pants or a skirt.

## The story
1. **Monday**: wake up, get ready and commute to work dressed normally. At clock-in, a wardrobe mishap takes your pants or skirt.
2. **Monday evening**: the rest of your wardrobe turns out to be ruined. From now on you go everywhere without legwear.
3. **The morning after your third shift**: Celesti, the angelic messenger of **Hiphtia, goddess of hips**, appears in your apartment. You've been "blessed", and she's very sorry about it. From now on, the coworker you spend the most time near each workday gets blessed the next workday.
4. **Win** when every coworker shares the blessing.

The week runs Monday to Friday at work. Saturdays and Sundays are **days off with errands** around town.

## Main menu
- **New Game**: create your character (name, legwear, .vrm), pick one of 7 jobs, and set up 4–12 coworkers plus a manager.
- **Civilian Models**: import any number of .vrm templates. Pedestrians, customers and bus passengers are built from them, each with random skin, hair, eye and clothing colors.
- **Celesti's Model**: import a .vrm for Celesti (a halo and wings are added) and set her name.

Each morning an **outfit screen** lets you pick everyone's outfit for the day: which outfit (add more .vrm outfits per character at any time) plus top and bottom color tints.

## Jobs
Office Worker, Restaurant Server, Retail Worker, Hotel Staff, Library Assistant, Warehouse Worker and Cafe Barista. Every workplace is a 60×48 m building with:
- a job-specific public floor (cubicle farm, dining room and bar, sales floor, hotel lobby, library stacks, warehouse racks, cafe)
- two hallways with 15 back rooms: locker room with the time clock, manager's office, restrooms with stalls, break room, storage, loading dock, plus job rooms such as meeting rooms, kitchens, a walk-in freezer, guest rooms, a laundry, an archive, study rooms or a roastery
- 15+ task types per job (job-specific plus generic chores like trash runs, restocking the break room, cleaning restrooms or delivering paperwork to the manager)

Coworkers do the same kinds of tasks: they fetch things, carry them, work at stations, take breaks, and glance around while they work.

## Rules
- **Shame** rises when people outside work see you and when you're caught at work. Fill it and you lose. Sleeping lowers it.
- **Composure** drains when you crouch or run in plain view at work. At zero, someone comes over to check on you.
- **Stamina** limits running.
- **Coworker personalities** when they catch you:
  - *Best Friend*: becomes an ally. Lends you their legwear for 60 seconds (they hide while you wear it) or causes a distraction.
  - *Sympathetic*: becomes an ally and causes distractions.
  - *Neutral*: lets it slide once, then reports you.
  - *Strict* / *Distant*: report you.
  - *Oddball*: thinks it's a game, takes off their own bottoms and starts sneaking around too.
- **Manager write-ups**: a report, three customer complaints in a day, the manager seeing you, or arriving more than 10 minutes late means a very uncomfortable talk with the manager. The third write-up gets you fired.
- **Sneaking coworkers** (oddballs and blessed coworkers) face the same stakes. Strict coworkers, customers and the manager can catch them, they get written up, and three write-ups gets them fired.
- **Blessed coworkers** never report you, but blessed friends can't help you anymore either.

## Getting around town
The city is a 4×4 grid of blocks with named streets, parks and shops. You need to be at work by 9:00 AM.
- **Buses**: 3 lines (Red Ring, Blue Crosstown, Green Midtown). They loop on fixed routes and stop at every stop. None of them goes straight to your job.
- **Rush hour** buses are packed, so you may have to stand.
- **Boarding**: the driver always notices you, and so does everyone you pass in the aisle.
- **Sitting**: only people who walk past you or sit next to you notice. A window seat is safer than the aisle.
- **Standing**: everyone behind you can see you, so your Shame climbs steadily.
- **Days off**: run 3 errands (supermarket, pharmacy, post office, laundromat, bank, hardware store, bookstore). Watch out for chaos, like running into a coworker in town (some will tell the manager on Monday) or a dog stealing your shopping.

## Controls
| Key | Action |
| --- | --- |
| Mouse | Look (click the game to capture the mouse, or hold the right button) |
| W A S D | Move |
| Shift | Run |
| C / Ctrl | Crouch (toggle / hold) |
| E | Interact (hold for timed actions), board or leave buses, sit or stand |
| Mouse wheel | Zoom |
| Esc | Pause |
| F11 | Fullscreen |

## VRM notes
- VRM 0.x and 1.0 files are supported (loaded with `@pixiv/three-vrm`).
- When exporting from VRoid Studio, **turn off the option that deletes hidden body parts**, otherwise the legs under the clothes may be missing.
- After importing, tick which clothing parts count as legwear (auto-detected for VRoid models). Use **Preview mishap** to check.
- If your model's body texture has no underwear, keep "Add simple underwear overlay" on.
- Your own character gets full hair physics and facial expressions. Coworkers, the manager and civilians are cheap copies of a cached model, so many can be on screen at once.
- Imported models are stored in the game's own data folder.

## Getting the .exe
- **GitHub Actions**: every push runs the *Build Windows EXE* workflow. Download `HiphtiasBlessing-windows` from the run's artifacts. Pushing a tag like `v0.2.0` also attaches the .exe to a GitHub Release.
- **Build it yourself on Windows**: install Node.js 20+, then:
  ```
  npm ci
  npm run dist:win
  ```
  The portable exe ends up in `release/`.
- **Run from source**: `npm ci` then `npm start`.

The `.exe` is portable: no installer, just double-click it. It isn't code-signed, so Windows SmartScreen may warn the first time ("More info" → "Run anyway").

## Project layout
- `electron/`: desktop app wrapper
- `src/main.js`: title screen, creator, outfit screen, civilian and Celesti model managers, saving
- `src/game.js`: game loop, days and phases, player, bus riding, stealth, reactions, manager talks, the blessing
- `src/npc.js`: NPC activity queues, sight cones, carried props
- `src/bus.js`: bus lines, stops, passengers
- `src/character.js`: VRM loading and cloning, recoloring, procedural animation, built-in figures, Celesti's halo and wings
- `src/level.js`: level building, collision, sight lines, navigation
- `src/levels/`: apartment, city, workplace generator, shops
- `src/data.js`: jobs, personalities, tasks, errands, story text
