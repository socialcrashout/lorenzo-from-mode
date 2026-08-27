require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ---------------- CONFIG ----------------
// Secrets load from .env (see .env.example) — never hardcode tokens/cookies here.
const CONFIG = {
  discordToken: process.env.DISCORD_TOKEN,
  channelId: '1502517147673563266',

  groupId: process.env.GROUP_ID,
  robloSecurityCookie: process.env.ROBLOSECURITY_COOKIE,

  dockApiKey: process.env.DOCK_API_KEY, // from your Dock dashboard, once we have the endpoint details

  pollIntervalMs: 60_000, // check for new sales every 60s

  // Map of gamepass IDs -> { name, url } so the embed can show a bold
  // name + link exactly as you want it.
  gamepasses: {
    // Example:
    // '123456789': { name: 'VIP Access', url: 'https://www.roblox.com/game-pass/123456789/VIP-Access' },
  },

  color: 0xf5a623, // unused now (Components V2 container has no accent color set)
  // Footer shows only this icon, no text (Discord embeds require a non-empty
  // footer text field, so a zero-width space is used behind the scenes).
  footerIconUrl: 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw',
};

const STATE_FILE = path.join(__dirname, 'last-transaction.json');
// -----------------------------------------

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { lastCursor: null, seenIds: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Looks up a Discord ID for a given Roblox user ID via Dock (docksys.xyz).
// PLACEHOLDER: swap in Dock's real endpoint/response shape once you grab it
// from your Dock dashboard's API/developer section.
async function getDiscordId(robloxUserId) {
  try {
    const res = await fetch(
      `https://docksys.xyz/api/lookup/roblox/${robloxUserId}`, // <-- confirm this path
      { headers: { Authorization: `Bearer ${CONFIG.dockApiKey}` } } // <-- confirm auth scheme
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.discordId || null; // <-- confirm response field name
  } catch (err) {
    console.error('Dock lookup failed:', err.message);
    return null;
  }
}

// Fetches one page of group sale transactions from Roblox.
async function fetchSalesPage(cursor) {
  const url = new URL(
    `https://economy.roblox.com/v2/groups/${CONFIG.groupId}/transactions`
  );
  url.searchParams.set('transactionType', 'Sale');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url, {
    headers: { Cookie: `.ROBLOSECURITY=${CONFIG.robloSecurityCookie}` },
  });

  if (!res.ok) {
    throw new Error(`Roblox API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Builds and sends the thank-you Components V2 message for a single sale transaction.
async function postThankYou(channel, tx) {
  const buyer = tx.agent; // { id, type: 'User', name }
  const details = tx.details; // { id: gamepassId, name, type: 'GamePass Sale' }

  const passInfo = CONFIG.gamepasses[details.id] || {
    name: details.name,
    url: `https://www.roblox.com/game-pass/${details.id}`,
  };

  const discordId = await getDiscordId(buyer.id);
  const mention = discordId ? `<@${discordId}>` : `**${buyer.name}**`;

  const bodyText =
    `## <:confetti:1502514534298943509> New Purchase\n` +
    `We'd like to give a big thank you to ${mention} for purchasing our ` +
    `**[${passInfo.name}](${passInfo.url})**! Your support means a lot to us and ` +
    `helps us continue developing new features, hosting giveaways, and improving what we offer.`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

  if (CONFIG.footerIconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('\u200b'))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(CONFIG.footerIconUrl))
    );
  }

  await channel.send({
    content: discordId ? `<@${discordId}>` : undefined,
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// Every "Sale" transaction returned by Roblox for this group is a real
// purchase (Game Pass or Developer Product) — no need to filter by type.
function isGamepassSale(tx) {
  return true;
}

// One-time backfill: walks every page of the group's sale history and posts
// a thank-you for every past gamepass sale. Runs only when there's no saved
// state yet (i.e. the very first time you deploy this, or after wiping
// last-transaction.json). Safe to leave in — it no-ops on every run after.
async function runBackfill(channel) {
  console.log('No saved state found — backfilling full purchase history...');
  const state = { seenIds: [] };
  let cursor = null;
  let page = 1;

  do {
    let data;
    try {
      data = await fetchSalesPage(cursor);
    } catch (err) {
      console.error(`Backfill failed on page ${page}:`, err.message);
      break;
    }

    const pageSales = (data.data || []).reverse(); // oldest first

    for (const tx of pageSales) {
      try {
        await postThankYou(channel, tx);
      } catch (err) {
        console.error(`Failed to post backfilled sale ${tx.id}:`, err.message);
      }
      state.seenIds.push(tx.id);
      await sleep(1200); // stay well under Discord's rate limits during a big backfill
    }

    // Mark non-gamepass sales as seen too, so they aren't reprocessed later.
    for (const tx of data.data || []) {
      if (!state.seenIds.includes(tx.id)) state.seenIds.push(tx.id);
    }

    cursor = data.nextPageCursor || null;
    page++;
  } while (cursor);

  state.seenIds = state.seenIds.slice(-2000); // keep the file from growing unbounded
  saveState(state);
  console.log(`Backfill complete. ${state.seenIds.length} historical transactions recorded.`);
}

let client;

async function checkForNewSales() {
  const state = loadState();

  let data;
  try {
    data = await fetchSalesPage(null); // always pull the latest page
  } catch (err) {
    console.error('Failed to fetch sales:', err.message);
    return;
  }

  const allFetched = (data.data || []).filter((tx) => !state.seenIds.includes(tx.id));

  const newSales = allFetched.reverse(); // oldest first, so messages post in order

  // Mark every fetched transaction as seen, even skipped ones, so they
  // aren't re-checked (and re-logged) on the next poll.
  for (const tx of allFetched) {
    if (!state.seenIds.includes(tx.id)) state.seenIds.push(tx.id);
  }

  if (newSales.length > 0) {
    const channel = await client.channels.fetch(CONFIG.channelId);
    for (const tx of newSales) {
      await postThankYou(channel, tx);
    }
  }

  // Keep the seenIds list from growing forever
  state.seenIds = state.seenIds.slice(-500);
  saveState(state);
}

async function main() {
  client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // If there's no saved state yet, this is a fresh deploy — walk the full
    // purchase history first and post a thank-you for everything past.
    if (!fs.existsSync(STATE_FILE)) {
      const channel = await client.channels.fetch(CONFIG.channelId);
      await runBackfill(channel);
    }

    checkForNewSales();
    setInterval(checkForNewSales, CONFIG.pollIntervalMs);
  });

  client.login(CONFIG.discordToken);
}

main();