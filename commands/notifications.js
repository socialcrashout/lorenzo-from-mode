const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────
// 1. CONFIG — everything editable lives here. Add/remove/rename freely.
// ─────────────────────────────────────────────────────────────────────────

const CONFIG = {
  panelTitle: 'Keep Up With Us',
  panelDescription:
    "Choose the alerts you want to receive and stay informed about everything happening in the server.You can update your preferences anytime by selecting an option again.",
  panelHint:
    '**View or update your notification preferences anytime by running **/notifications**, **-alerts**, or **-notifications**.**',

  // Notification categories — id must be unique, everything else is display
  categories: [
    {
      id: 'News/Updates',
      label: 'News/Updates',
      description: 'Get notified about the latest announcements, updates, and important news from our community.',
    },
    {
      id: 'Order Status',
      label: 'Order Status',
      description: 'Get notified about any updates regarding orders, including when they open, close, or any important announcements.',
    },
    {
      id: 'Giveaways',
      label: 'Giveaways',
      description: 'Get notified whenever we host a new giveaway so you never miss your chance to participate and win ex',
    },
    {
      id: 'Opportunities',
      label: 'Opportunities',
      description: "Get notified about new opportunities, including applications, partnerships, collaborations, and othe",
    },
    {
      id: 'Free Releases',
      label: 'Free Releases',
      description: 'Get notified whenever we release free resources, assets, or exclusive content available for everyone',
    },
    {
      id: 'Events',
      label: 'Events',
      description: 'Get notified about upcoming events, community activities, and special occasions so you never miss ou',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 2. STORAGE — swap this block out for your real DB if you have one.
//    Shape: { [userId]: { categories: [ids] } }
// ─────────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'alert-subscriptions.json');

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
}

function getUserPrefs(userId) {
  const store = loadStore();
  return store[userId] || { categories: [] };
}

function toggleCategories(userId, selectedIds) {
  const store = loadStore();
  const current = store[userId] || { categories: [] };
  // StringSelectMenu with multi-select gives us the full new selection each
  // time, so we diff against what was already checked to toggle.
  const prevSet = new Set(current.categories);
  const newSet = new Set(selectedIds);
  // Anything in both was already checked AND re-picked -> user wants it off
  const toggledOff = [...prevSet].filter((id) => newSet.has(id));
  const toggledOn = [...newSet].filter((id) => !prevSet.has(id));
  const finalSet = new Set(current.categories);
  toggledOff.forEach((id) => finalSet.delete(id));
  toggledOn.forEach((id) => finalSet.add(id));
  current.categories = [...finalSet];
  store[userId] = current;
  saveStore(store);
  return current;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. PANEL BUILDER
// ─────────────────────────────────────────────────────────────────────────

function buildCategoryRow(prefs) {
  const placeholder =
    prefs.categories.length > 0
      ? CONFIG.categories
          .filter((c) => prefs.categories.includes(c.id))
          .map((c) => c.label)
          .join(', ')
      : CONFIG.categories.map((c) => c.label).join(', ');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('alerts:categories')
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(CONFIG.categories.length)
    .addOptions(
      CONFIG.categories.map((cat) => ({
        label: cat.label,
        description: cat.description,
        value: cat.id,
        default: prefs.categories.includes(cat.id),
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildPanel(userId) {
  const prefs = getUserPrefs(userId);

  const embed = new EmbedBuilder()
    .setTitle(CONFIG.panelTitle)
    .setDescription(`${CONFIG.panelDescription}\n\n*${CONFIG.panelHint}*`);
  // no .setColor(...) call — no accent color

  const row = buildCategoryRow(prefs);

  return { embeds: [embed], components: [row] };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. HANDLERS
// ─────────────────────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('Choose which alerts you want to receive in this server.');

async function execute(interaction) {
  const panel = buildPanel(interaction.user.id);
  await interaction.reply({ ...panel, ephemeral: true });
}

async function handleTextTrigger(message) {
  const panel = buildPanel(message.author.id);
  await message.reply(panel);
}

async function handleComponent(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== 'alerts:categories') return false;

  toggleCategories(interaction.user.id, interaction.values);

  const panel = buildPanel(interaction.user.id);
  await interaction.update(panel);
  return true;
}

module.exports = {
  CONFIG,
  data,
  execute,
  handleTextTrigger,
  handleComponent,
  getUserPrefs,
};