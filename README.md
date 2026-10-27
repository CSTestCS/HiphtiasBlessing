# Hiphtia's Blessing

A 3D workplace stealth comedy for Windows. Import your own VRoid / VRM characters for yourself and your coworkers, then survive three workdays after a wardrobe mishap leaves you without pants or a skirt.

## How the game plays

1. **Create your profile**: name, usual legwear (pants or skirt), and an optional `.vrm` model. After importing, tick which clothing parts count as legwear (auto-detected for VRoid models), and use **Preview mishap** to check.
2. **Pick a job**: Office Worker, Restaurant Server or Retail Worker. Each has its own workplace layout and tasks.
3. **Set up coworkers** (up to 4): name, personality, legwear and optional `.vrm` model.
4. **Day 1**: wake up, wash, eat, get dressed and commute to work (no stealth on this first trip). Clock in... and the mishap happens.
5. **At work**: finish your task list while staying out of everyone's sight cones. Then clock out and walk home.
6. **Day 1 evening**: the rest of your wardrobe turns out to be ruined, so days 2 and 3 start without legwear.
7. **Win**: get home after your third shift without being fired.

### Rules
- **Shame** rises when people see you outside work, and when you're caught at work. Fill it and you lose. Sleeping lowers it a bit.
- **Composure** drains when you crouch or run in plain view at work ("acting strange"). At zero, someone walks over to check on you.
- **Coworker personalities** decide what happens when they catch you:
  - *Best Friend*: becomes an ally. They can lend you their own legwear for 60 seconds (they hide in the back while you wear it), or cause a distraction.
  - *Sympathetic*: becomes an ally and causes distractions.
  - *Neutral*: lets it slide once. The second time, they report you.
  - *Strict* / *Distant*: report you, and you're fired.
- **Customers** who catch you file a complaint. Three complaints and you're fired.
- Talk to an ally (press **E** near them) to ask for help again later.

### Stealth tips
- Cubicle partitions, counters, shelves, hedges and bushes hide your hips. Desks and tables only hide them while you crouch.
- Carrying a tray, box or folder covers you from the front, so face people while you carry things.
- Distractions turn everyone's attention toward your ally for a few seconds.

## Controls
| Key | Action |
| --- | --- |
| Mouse | Look (click the game to capture the mouse, or hold the right button) |
| W A S D | Move |
| Shift | Run |
| C / Ctrl | Crouch (toggle / hold) |
| E | Interact (hold for timed actions) |
| Mouse wheel | Zoom |
| Esc | Pause |
| F11 | Fullscreen |

## VRM notes
- VRM 0.x and 1.0 files are supported (loaded with `@pixiv/three-vrm`).
- When exporting from VRoid Studio, **turn off the option that deletes hidden body parts**, otherwise the legs under the clothes may be missing.
- If your model's body texture has no underwear, keep "Add simple underwear overlay" on.
- Imported models are stored locally in the game's own data folder, so you don't need to keep the original file around.

## Getting the .exe
- **GitHub Actions**: every push runs the *Build Windows EXE* workflow. Download `HiphtiasBlessing-windows` from the run's artifacts. Pushing a tag like `v0.1.0` also attaches the .exe to a GitHub Release.
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
- `src/main.js`: title screen, character creator, saving
- `src/game.js`: game loop, phases, player, stealth detection, coworker reactions
- `src/npc.js`: NPC movement, sight cones
- `src/character.js`: VRM loading, legwear toggling, procedural animation, default mannequin
- `src/levels/`: apartment, city, office, restaurant, retail
- `src/data.js`: jobs, personalities, tasks, story text
