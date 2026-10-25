# Fake Expert

A real-time multiplayer bluffing party game for 3–8 players. No accounts or installs required.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open http://localhost:3000 in multiple browser windows. Share the room code or invite URL. The first player creates the room; the host can start with at least three players.

## Gameplay

Players receive a secret role. Experts see the fact; the Fake Expert must bluff. Players have 45 seconds to share hints and 30 seconds to vote. Correct voters earn one point; the faker earns two if they survive the vote. First to five points wins, with ties sharing the win. The app uses in-memory rooms, so active games reset when the server restarts.

## Deploy

Configured for Render using `render.yaml`, `npm install`, and `npm start`.
