# vote-notifier

Discord bot for Minecraft vote tracking and cooldown notifications.

Allows players to track their votes across multiple listing platforms, receive alerts when a new vote is available, and display a persistent interactive dashboard in any Discord channel.

## Prerequisites

- Node.js >= 18
- A Discord application created via the [Developer Portal](https://discord.com/developers/applications) with the `Guilds` and `Direct Messages` intents enabled

## Installation

```bash
git clone https://github.com/va-yuu/vote-notifier
cd vote-notifier
npm install
```

## Configuration

Edit `config.json` before the first launch.

```json
{
  "token": "<bot-token>",
  "clientId": "<application-id>",
  "guildId": "<guild-id>",
  "voteSites": [
    {
      "id": "your-discird-id",
      "name": "Site Name",
      "baseUrl": "https://example.com/vote?username=",
      "cooldown": 5400000,
      "cooldownDisplay": "1h30"
    }
  ]
}
```

| Field | Description |
|---|---|
| `token` | Discord bot authentication token |
| `clientId` | Discord application ID |
| `guildId` | Target Discord guild ID |
| `voteSites[].id` | Internal unique identifier for the site |
| `voteSites[].name` | Display name shown in the interface |
| `voteSites[].baseUrl` | Vote URL — the Minecraft username is appended at the end |
| `voteSites[].cooldown` | Cooldown duration in milliseconds |
| `voteSites[].cooldownDisplay` | Human-readable cooldown shown in the interface (e.g. `1h30`) |

For sites that do not support appending the username to the URL, set `baseUrl` to point directly to the vote page.

## Usage

Register slash commands once, or after any command change:

```bash
npm run deploy
```

Start the bot:

```bash
npm start
npm run dev
```

## Project Structure

```
vote-notifier/
├── config.json
├── data/
│   └── database.json
└── src/
    ├── index.js
    ├── deploy-commands.js
    ├── commands/
    │   └── dashboard.js
    ├── database/
    │   └── db.js
    └── utils/
        └── voteManager.js
```

## How It Works

Data is persisted in `data/database.json` across three collections: `users` (Minecraft username, notification preferences), `votes` (per-user per-site vote history and cooldown state), and `dashboards` (references to public dashboard messages posted in channels).

`VoteManager` runs two background loops: every **30 seconds** to detect expired cooldowns and dispatch pending notifications, and every **60 seconds** to refresh all active public dashboards.

The `/dashboard` slash command is the main entry point. On first use, the user is prompted to set their Minecraft username. The dashboard then displays the status of each vote site and exposes actions to confirm a vote, adjust notification settings, manually correct a vote timestamp, publish a persistent public dashboard in the current channel, or delete all stored data.

## Required Bot Permissions

| Permission | Purpose |
|---|---|
| `Send Messages` | Dispatching notifications in channels |
| `Read Message History` | Editing and refreshing public dashboards |
| `Use Application Commands` | Slash command support |
| DM Access | Sending private vote notifications |
