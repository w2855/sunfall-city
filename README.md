# Sunfall City

[![make.fun bounty gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/b/gta6-01)
[![Sunfall City rank](https://make.fun/badge/gta6-01/w2855/sunfall-city/rank.svg)](https://make.fun/b/gta6-01/leaderboard)
[![Sunfall City reward](https://make.fun/badge/gta6-01/w2855/sunfall-city/reward.svg)](https://make.fun/b/gta6-01/leaderboard)

**Sunfall City** is an original open-world crime story that runs entirely offline in your browser. A neon night city of nine-by-nine blocks wakes up under a permanent dusk: traffic cruises the grid, pedestrians stroll the sidewalks, street lamps and palm trees line the corners, and a sandy beach runs along the south edge. You wake up at the dock with $500 and a payphone to answer — five jobs take you from that payphone to the marina, a west-side lockup, Palm Row and finally the last ferry, if you can shake the heat before it leaves. Steal cars, draw a pistol when things go wrong, and watch the wanted stars climb while cruisers hunt you nose-first through the streets. Cash and deliveries persist in your browser's localStorage — the city remembers you when you come back.

![Driving through Sunfall City](screenshots/1-drive.png)
![Wanted in Sunfall City](screenshots/2-wanted.png)
![Armed on the streets of Sunfall City](screenshots/3-street.png)

## Run it

```sh
node serve.ts
```

then open [http://localhost:8080](http://localhost:8080). No build step, no dependencies, no network — everything is vanilla ES modules and three.js from `game/vendor/`.

## Controls

| Input | Action |
| --- | --- |
| WASD | move / drive |
| Mouse | look / aim |
| Shift | sprint / handbrake |
| E | enter / exit cars (stealing draws heat) |
| Q | draw / holster the pistol |
| Click | shoot when armed |
| Esc | pause |

Handed in for the [gta6-01 bounty on make.fun](https://make.fun/b/gta6-01).
