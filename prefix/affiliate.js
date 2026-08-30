const { MessageFlags } = require('discord.js');
const Affiliate = require('../models/Affiliate');
const AffiliatePanel = require('../models/AffiliatePanel');
const {
    CUSTOM_IDS,
    buildPanelContainer,
    buildRequirementsContainer,
} = require('./affiliateShared');
const {
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

// Change this to whatever role should be allowed to post the panel.
const AFFILIATE_POST_ROLE_ID = '1504310356254916688';

function canPostPanel(member) {
    return member?.roles?.cache?.has(AFFILIATE_POST_ROLE_ID);
}

async function postPanel(message, client) {
    const container = await buildPanelContainer();

    const panelMessage = await message.channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
    });

    await AffiliatePanel.findByIdAndUpdate(
        'panel',
        { channelId: panelMessage.channel.id, messageId: panelMessage.id },
        { upsert: true }
    );

    message.delete().catch(() => {});
}

module.exports = {
    name: 'affiliate',

    async execute(message, args, client) {
        if (!canPostPanel(message.member)) {
            return message.reply("You don't have permission to use this command.");
        }

        return postPanel(message, client);
    },

    async handleComponent(interaction, client) {
        if (interaction.isButton() && interaction.customId === CUSTOM_IDS.REQUIREMENTS) {
            const container = buildRequirementsContainer();

            await interaction.reply({
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                components: [container],
            });
            return true;
        }

        if (interaction.isStringSelectMenu() && interaction.customId === CUSTOM_IDS.SELECT) {
            const value = interaction.values[0];
            if (value === 'none') {
                await interaction.reply({ content: 'No affiliations yet.', flags: MessageFlags.Ephemeral });
                return true;
            }

            const affiliate = await Affiliate.findById(value).catch(() => null);
            if (!affiliate) {
                await interaction.reply({ content: 'That affiliate no longer exists.', flags: MessageFlags.Ephemeral });
                return true;
            }

            const container = new ContainerBuilder();
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(affiliate.bannerUrl))
            );
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(affiliate.description));
            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(affiliate.buttonLabel)
                        .setStyle(ButtonStyle.Link)
                        .setURL(affiliate.link)
                )
            );

            await interaction.reply({
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                components: [container],
            });
            return true;
        }

        return false;
    },
};