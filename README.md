# Sunfall City

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/w2855/sunfall-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/w2855/sunfall-city/reward.svg)](https://make.fun/bounty/gta6-01/w2855/sunfall-city)

An original open-world crime story in one browser tab. You wake up in Sunfall City with $500, a
payphone ringing downtown and five jobs between you and the last ferry out. Borrow cars that are
not yours, run couriers through night traffic, shake the cruisers that come wailing in with every
star on your head, and spend your evenings somewhere between the neon towers and the beach. The
whole city runs offline in this repository — no network calls, no build step — and your cash and
completed jobs save themselves in your browser.

![Driving through the night grid](screenshots/1-drive.png)
![Heat: cruisers and blinking light bars](screenshots/2-wanted.png)
![On foot in the neon streets](screenshots/3-street.png)

## Run it

```bash
node serve.ts
```

Then open <http://localhost:8080>. (`node main.ts` is the bounty's hand-in program: it packs
`game/`, `screenshots/` and `dossier.json` into the output directory.)

## Controls

| Input | On foot | Driving |
| --- | --- | --- |
| WASD | move | throttle / steer |
| Mouse | look / aim | camera |
| Shift | sprint | handbrake |
| E | enter the nearest car | exit |
| Q | draw / holster pistol | — |
| Click | shoot (when armed) | — |
| Esc | pause | pause |

Five jobs, one city, and no second chances once the ferry leaves. Built for make.fun.
