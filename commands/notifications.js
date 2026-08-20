const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');


const CONFIG = {
  panelTitle: 'Keep Up With Us',
  panelDescription:
    "Choose the alerts you want to receive and stay informed about everything happening in the server.You can update your preferences anytime by selecting an option again.",
  panelHint:
    '**View or update your notification preferences anytime by running **/notifications**, **-alerts**, or **-notifications**.**',
  // Full-width banner shown at the bottom of the panel, no text — just the image.
  footerImageURL: 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw',

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
// 3. PANEL BUILDER — Components V2 container, no accent color.
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
        // Discord hard-caps option descriptions at 100 chars; addOptions
        // throws (not a graceful reject) if any description runs over, so
        // this truncation is a safety net against future long descriptions.
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

  const container = new ContainerBuilder();
  // No .setAccentColor(...) call — no accent color.

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${CONFIG.panelTitle}`),
    new TextDisplayBuilder().setContent(CONFIG.panelDescription)
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(CONFIG.panelHint)
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(buildCategoryRow(selectedIds));

  if (CONFIG.footerImageURL) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(CONFIG.footerImageURL)
      )
    );
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. HANDLERS
// ─────────────────────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('Choose which alerts you want to receive in this server.');

async function execute(interaction) {
  const panel = buildPanel(interaction.member);
  await interaction.reply({
    ...panel,
    flags: panel.flags | MessageFlags.Ephemeral,
  });
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

  // Ack immediately — role add/remove calls can take longer than Discord's
  // 3-second interaction window, which is what was causing "didn't respond
  // in time". deferUpdate() buys up to 15 minutes before we have to follow up.
  await interaction.deferUpdate();

  try {
    await applyCategorySelection(interaction.member, interaction.values);
  } catch (err) {
    console.error('Failed to apply category roles:', err);
    await interaction.followUp({
      content:
        "Something went wrong updating your roles — likely my role needs to be moved above the notification roles in Server Settings > Roles.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const panel = buildPanel(interaction.member);
  await interaction.editReply(panel);
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