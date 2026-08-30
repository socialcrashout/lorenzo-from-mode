const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
} = require('discord.js');

const Affiliate = require('../models/Affiliate');
const AffiliatePanel = require('../models/AffiliatePanel');
const { buildPanelContainer } = require('./affiliateShared');

// Change this to whatever role should be allowed to remove affiliates.
const AFFILIATE_REMOVE_ROLE_ID = '1504310356254916688';

const CUSTOM_ID = 'affiliate_remove_select';

function canRemoveAffiliate(member) {
    return member?.roles?.cache?.has(AFFILIATE_REMOVE_ROLE_ID);
}

async function refreshPanel(client) {
    const panel = await AffiliatePanel.findById('panel');
    if (!panel) return;

    try {
        const panelChannel = await client.channels.fetch(panel.channelId);
        const panelMessage = await panelChannel.messages.fetch(panel.messageId);
        const container = await buildPanelContainer();
        await panelMessage.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [container],
        });
    } catch (err) {
        client?.logs?.error('Failed to refresh affiliate panel after removal:', err) ?? console.error(err);
    }
}

module.exports = {
    name: 'affiliateremove',

    async execute(message, args, client) {
        if (!canRemoveAffiliate(message.member)) {
            return message.reply("You don't have permission to use this command.");
        }

        const affiliates = await Affiliate.find().sort({ createdAt: 1 }).limit(25);

        if (!affiliates.length) {
            return message.channel.send('There are no affiliates to remove.');
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(CUSTOM_ID)
            .setPlaceholder('Select an affiliate to remove')
            .addOptions(
                affiliates.map((a) => ({
                    label: a.buttonLabel.slice(0, 100),
                    value: a._id.toString(),
                }))
            );

        await message.channel.send({
            content: 'Select the affiliate you want to remove:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
        });
    },

    async handleComponent(interaction, client) {
        if (!interaction.isStringSelectMenu() || interaction.customId !== CUSTOM_ID) return false;

        if (!canRemoveAffiliate(interaction.member)) {
            await interaction.reply({
                content: "You don't have permission to do that.",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const affiliateId = interaction.values[0];
        const affiliate = await Affiliate.findByIdAndDelete(affiliateId).catch(() => null);

        if (!affiliate) {
            await interaction.reply({
                content: 'That affiliate no longer exists.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        await refreshPanel(client);

        await interaction.update({
            content: `Removed affiliate **${affiliate.buttonLabel}**.`,
            components: [],
        });

        return true;
    },
};