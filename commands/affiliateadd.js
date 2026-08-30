const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const Affiliate = require('../models/Affiliate');
const AffiliatePanel = require('../models/AffiliatePanel');
const { buildPanelContainer } = require('../prefix/affiliateShared');

// Change this to whatever role should be allowed to add new affiliates.
const AFFILIATE_ADD_ROLE_ID = '1504311819458580531';

function canAddAffiliate(interaction) {
    return interaction.member?.roles?.cache?.has(AFFILIATE_ADD_ROLE_ID);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('affiliate-add')
        .setDescription('Add a new affiliate to the partnerships panel')
        .addStringOption((opt) =>
            opt
                .setName('description')
                .setDescription('Description text shown when this affiliate is selected')
                .setRequired(true)
                .setMaxLength(1000)
        )
        .addAttachmentOption((opt) =>
            opt
                .setName('banner')
                .setDescription("The affiliate's banner image")
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('link')
                .setDescription("The affiliate's server invite or link")
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('button_label')
                .setDescription('What the link button should say (e.g. "Mastery Design Course")')
                .setRequired(true)
                .setMaxLength(80)
        ),

    async execute(interaction, client) {
        if (!canAddAffiliate(interaction)) {
            return interaction.reply({
                content: "You don't have permission to use this command.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const description = interaction.options.getString('description', true);
        const banner = interaction.options.getAttachment('banner', true);
        const link = interaction.options.getString('link', true);
        const buttonLabel = interaction.options.getString('button_label', true);

        const affiliate = await Affiliate.create({
            buttonLabel,
            description,
            bannerUrl: banner.url,
            link,
            addedBy: interaction.user.id,
        });

        // Refresh the posted panel's select menu, if one exists.
        const panel = await AffiliatePanel.findById('panel');
        let refreshNote = '';
        if (panel) {
            try {
                const panelChannel = await interaction.client.channels.fetch(panel.channelId);
                const panelMessage = await panelChannel.messages.fetch(panel.messageId);
                const container = await buildPanelContainer();
                await panelMessage.edit({
                    flags: MessageFlags.IsComponentsV2,
                    components: [container],
                });
            } catch (err) {
                client?.logs?.error('Failed to refresh affiliate panel:', err) ?? console.error(err);
                refreshNote = "\n(Couldn't find the posted panel to refresh — run `-affiliate` again to repost it.)";
            }
        }

        await interaction.editReply(`Added affiliate **${affiliate.buttonLabel}**.${refreshNote}`);
    },
};