// commands/orderstatus.js
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ComponentType,
} = require('discord.js');

const { SERVICES, STATUS } = require('../config/orderStatus');
const { buildStatusContainer } = require('../utils/buildStatusContainer');

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orderstatus')
    .setDescription('Set which services are open, closed, or delayed and post the status.'),

  async execute(interaction) {
    const allowed = interaction.member.roles.cache.some(r => r.name === 'temp');
        if (!allowed) return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });

    const state = {
      open: [],
      delayed: [],
      channelId: null,
    };

    const buildOpenSelect = () =>
      new StringSelectMenuBuilder()
        .setCustomId('os_open')
        .setPlaceholder('Select OPEN services')
        .setMinValues(0)
        .setMaxValues(SERVICES.length)
        .addOptions(
          SERVICES.map((s) => ({
            label: s.label,
            value: s.key,
            default: state.open.includes(s.key),
          })),
        );

    const buildDelayedSelect = () =>
      new StringSelectMenuBuilder()
        .setCustomId('os_delayed')
        .setPlaceholder('Select DELAYED services')
        .setMinValues(0)
        .setMaxValues(SERVICES.length)
        .addOptions(
          SERVICES.map((s) => ({
            label: s.label,
            value: s.key,
            default: state.delayed.includes(s.key),
          })),
        );

    const buildChannelSelect = () =>
      new ChannelSelectMenuBuilder()
        .setCustomId('os_channel')
        .setPlaceholder('Select a channel to post in')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);

    const buildButtons = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('os_post')
          .setLabel('Post Status')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!state.channelId),
        new ButtonBuilder()
          .setCustomId('os_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      );

    const statusMapFromState = () => {
      const map = {};
      for (const s of SERVICES) {
        if (state.delayed.includes(s.key)) map[s.key] = STATUS.DELAYED;
        else if (state.open.includes(s.key)) map[s.key] = STATUS.OPEN;
        else map[s.key] = STATUS.CLOSED;
      }
      return map;
    };

    const buildPanel = (footerText) => {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '### Order Status Setup\nPick which services are **open** and which are **delayed** below. Anything left unselected is treated as closed.',
        ),
      );

      const preview = buildStatusContainer(statusMapFromState());
      preview.components.forEach((c) => container.components.push(c));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (footerText) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            state.channelId
              ? `Posting to <#${state.channelId}>`
              : '⚠️ Select a destination channel before posting.',
          ),
        );
      }

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buildOpenSelect()),
        new ActionRowBuilder().addComponents(buildDelayedSelect()),
        new ActionRowBuilder().addComponents(buildChannelSelect()),
      );
      container.addActionRowComponents(buildButtons());

      return container;
    };

    const reply = await interaction.reply({
      components: [buildPanel()],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      withResponse: true,
    });

    const message = reply.resource?.message ?? (await interaction.fetchReply());

    const collector = message.createMessageComponentCollector({
      time: IDLE_TIMEOUT_MS,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on('collect', async (i) => {
      try {
        if (i.componentType === ComponentType.StringSelect) {
          if (i.customId === 'os_open') {
            state.open = i.values;
            state.delayed = state.delayed.filter((k) => !state.open.includes(k));
          } else if (i.customId === 'os_delayed') {
            state.delayed = i.values;
            state.open = state.open.filter((k) => !state.delayed.includes(k));
          }
          await i.update({ components: [buildPanel()] });
          return;
        }

        if (i.componentType === ComponentType.ChannelSelect && i.customId === 'os_channel') {
          state.channelId = i.values[0];
          await i.update({ components: [buildPanel()] });
          return;
        }

        if (i.componentType === ComponentType.Button) {
          if (i.customId === 'os_cancel') {
            collector.stop('cancelled');
            await i.update({
              components: [buildPanel('❌ Cancelled — nothing was posted.')],
            });
            return;
          }

          if (i.customId === 'os_post') {
            if (!state.channelId) {
              await i.update({ components: [buildPanel()] });
              return;
            }

            const targetChannel = await interaction.guild.channels.fetch(state.channelId);
            if (!targetChannel || !targetChannel.isTextBased()) {
              await i.update({
                components: [buildPanel('⚠️ That channel is no longer available. Pick another one.')],
              });
              return;
            }

            const finalContainer = buildStatusContainer(statusMapFromState());
            await targetChannel.send({
              components: [finalContainer],
              flags: MessageFlags.IsComponentsV2,
            });

            collector.stop('posted');
            await i.update({
              components: [buildPanel(`✅ Posted to <#${targetChannel.id}>.`)],
            });
          }
        }
      } catch (err) {
        console.error('[orderstatus] interaction error:', err);
        if (!i.replied && !i.deferred) {
          await i.reply({ content: 'Something went wrong, try again.', flags: MessageFlags.Ephemeral });
        }
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'cancelled' || reason === 'posted') return;
      try {
        await interaction.editReply({
          components: [buildPanel('⌛ This setup panel timed out. Run `/orderstatus` again.')],
        });
      } catch {
        
      }
    });
  },
};