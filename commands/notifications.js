const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');


const CONFIG = {
  panelTitle: 'Keep Up With Us',
  panelDescription:
    "Choose the alerts you want to receive and stay informed about everything happening in the server.You can update your preferences anytime by selecting an option again.",
  panelHint:
    '**View or update your notification preferences anytime by running **/notifications**, **-alerts**, or **-notifications**.**',

  // Notification categories — id must be unique, roleId is the role that
  // gets added/removed on toggle.
  categories: [
    {
      id: 'News/Updates',
      label: 'News/Updates',
      description: 'Get notified about the latest announcements, updates, and important news.',
      roleId: '1524635188850724984',
    },
    {
      id: 'Order Status',
      label: 'Order Status',
      description: 'Get notified when orders open, close, or have important updates.',
      roleId: '1524635307495002215',
    },
    {
      id: 'Giveaways',
      label: 'Giveaways',
      description: 'Get notified whenever we host a new giveaway so you never miss out.',
      roleId: '1524635019518152895',
    },
    {
      id: 'Opportunities',
      label: 'Opportunities',
      description: 'Get notified about applications, partnerships, and collaborations.',
      roleId: '1524635449455280199',
    },
    {
      id: 'Free Releases',
      label: 'Free Releases',
      description: 'Get notified whenever we release free resources or exclusive content.',
      roleId: '1524635367813283840',
    },
    {
      id: 'Events',
      label: 'Events',
      description: 'Get notified about upcoming events and community activities.',
      roleId: '1524635261227761765',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 2. PREFS — derived straight from the member's current roles.
//    No database, no JSON file: the roles ARE the subscription state.
// ─────────────────────────────────────────────────────────────────────────

function getSelectedCategories(member) {
  return CONFIG.categories
    .filter((cat) => member.roles.cache.has(cat.roleId))
    .map((cat) => cat.id);
}

async function applyCategorySelection(member, selectedIds) {
  const newSet = new Set(selectedIds);
  const currentIds = new Set(getSelectedCategories(member));

  const toAdd = [];
  const toRemove = [];

  for (const cat of CONFIG.categories) {
    const wasOn = currentIds.has(cat.id);
    const pickedAgain = newSet.has(cat.id);
    // Re-picking an already-on category means "turn it off" (toggle);
    // picking a category that wasn't on means "turn it on".
    if (wasOn && pickedAgain) toRemove.push(cat.roleId);
    else if (!wasOn && pickedAgain) toAdd.push(cat.roleId);
  }

  if (toAdd.length) await member.roles.add(toAdd);
  if (toRemove.length) await member.roles.remove(toRemove);

  return getSelectedCategories(member);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. PANEL BUILDER
// ─────────────────────────────────────────────────────────────────────────

function buildCategoryRow(selectedIds) {
  const placeholder =
    selectedIds.length > 0
      ? CONFIG.categories
          .filter((c) => selectedIds.includes(c.id))
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
        description:
          cat.description.length > 100
            ? `${cat.description.slice(0, 97)}...`
            : cat.description,
        value: cat.id,
        default: selectedIds.includes(cat.id),
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildPanel(member) {
  const selectedIds = getSelectedCategories(member);

  const embed = new EmbedBuilder()
    .setTitle(CONFIG.panelTitle)
    .setDescription(`${CONFIG.panelDescription}\n\n${CONFIG.panelHint}`);
  // no .setColor(...) call — no accent color

  const row = buildCategoryRow(selectedIds);

  return { embeds: [embed], components: [row] };
}

const data = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('Choose which alerts you want to receive in this server.');

async function execute(interaction) {
  const panel = buildPanel(interaction.member);
  await interaction.reply({ ...panel, flags: MessageFlags.Ephemeral });
}

async function handleTextTrigger(message) {
  const panel = buildPanel(message.member);
  await message.reply(panel);
}

async function handleComponent(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== 'alerts:categories') return false;

  const me = interaction.guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "I'm missing the **Manage Roles** permission, so I can't assign these yet.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await applyCategorySelection(interaction.member, interaction.values);

  const panel = buildPanel(interaction.member);
  await interaction.update(panel);
  return true;
}

module.exports = {
  CONFIG,
  data,
  execute,
  handleTextTrigger,
  handleComponent,
  getSelectedCategories,
};