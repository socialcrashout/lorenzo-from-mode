const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags,
} = require('discord.js');

const Affiliate = require('../models/Affiliate');
const AffiliatePanel = require('../models/AffiliatePanel');

// ---- hardcoded assets ----
const BANNER_URL = 'https://yumi.onl/api/files/6a947b1a04e48a789e64ed59/raw';
const FOOTER_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw';

// Change this to whatever role should be allowed to post the panel / add affiliates.
const AFFILIATE_MANAGER_ROLE_ID = '1504311819458580531';

const INTRO_TEXT = `<:mode_branding_20260510_032226_00:1506790198917206156>  **PARTNERSHIPS**
<:wave:1505023224667181256>  Looking to connect your community with ours? This section provides everything you need to know about our affiliation program, from eligibility standards to partnership expectations. Take a look through the available options below to learn about our **requirements**, **affiliation process**, and **partnered communities**. All partnerships are carefully selected by the **.mode Leadership Team** based on community quality and compatibility.`;

const REQUIREMENTS_TEXT = `## <:mode_branding_20260510_032226_00:1506790198917206156>  Affiliation Requirements
<:Dot:1502513706347528213>**200+** members for roleplay or design servers.
<:Dot:1502513706347528213>**200+** members for miscellaneous servers.
<:Dot:1502513706347528213>Must be a **reputable and active** community.
<:Dot:1502513706347528213>Must have a **clean and organized** server.
<:Dot:1502513706347528213>No current **blacklists**.
## <:mode_branding_20260510_032226_00:1506790198917206156>  Affiliation Benefits
<:Dot:1502513706347528213>**10% off** all orders.
<:Dot:1502513706347528213>Free priority for sponsored giveaways and ads.
<:Dot:1502513706347528213>**Exclusive** partner role.
<:Dot:1502513706347528213>Access to **partner-only** giveaways and events.`;

const CUSTOM_IDS = {
    REQUIREMENTS: 'affiliate_requirements',
    SELECT: 'affiliate_select',
};

function isAffiliateManager(member) {
    return member?.roles?.cache?.has(AFFILIATE_MANAGER_ROLE_ID);
}

async function buildPanelContainer() {
    const affiliates = await Affiliate.find().sort({ createdAt: 1 }).limit(25);

    const container = new ContainerBuilder(); // no accent color -> plain dark container

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(INTRO_TEXT));

    const requirementsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.REQUIREMENTS)
            .setLabel('Requirements & Benefits')
            .setStyle(ButtonStyle.Danger)
    );
    container.addActionRowComponents(requirementsRow);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(CUSTOM_IDS.SELECT)
        .setPlaceholder(affiliates.length ? 'View Affiliations' : 'No affiliations yet')
        .setDisabled(affiliates.length === 0);

    if (affiliates.length) {
        selectMenu.addOptions(
            affiliates.map((a) => ({
                label: a.buttonLabel.slice(0, 100),
                value: a._id.toString(),
            }))
        );
    } else {
        // A select menu needs at least one option even when disabled.
        selectMenu.addOptions({ label: 'No affiliations yet', value: 'none' });
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL))
    );

    return container;
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

async function askQuestion(message, channel, promptText) {
    await channel.send(promptText);

    const collected = await channel
        .awaitMessages({
            filter: (m) => m.author.id === message.author.id,
            max: 1,
            time: 120_000,
            errors: ['time'],
        })
        .catch(() => null);

    return collected?.first() ?? null;
}

async function runAddFlow(message, client) {
    const channel = message.channel;

    const descMsg = await askQuestion(message, channel, 'What text/description should this affiliate have? (You have 2 minutes to reply)');
    if (!descMsg) return channel.send('Timed out. Run `-affiliate add` again when ready.');

    const bannerMsg = await askQuestion(message, channel, 'Now send the banner — either upload an image or paste an image URL.');
    if (!bannerMsg) return channel.send('Timed out. Run `-affiliate add` again when ready.');
    const bannerUrl = bannerMsg.attachments.first()?.url ?? bannerMsg.content.trim();
    if (!bannerUrl) return channel.send("I didn't get a valid banner. Run `-affiliate add` again when ready.");

    const linkMsg = await askQuestion(message, channel, 'Now send the link this affiliate should point to.');
    if (!linkMsg) return channel.send('Timed out. Run `-affiliate add` again when ready.');
    const link = linkMsg.content.trim();

    const labelMsg = await askQuestion(message, channel, 'Finally, what should the button say? (e.g. "Mastery Design Course")');
    if (!labelMsg) return channel.send('Timed out. Run `-affiliate add` again when ready.');
    const buttonLabel = labelMsg.content.trim().slice(0, 80);

    const affiliate = await Affiliate.create({
        buttonLabel,
        description: descMsg.content.trim(),
        bannerUrl,
        link,
        addedBy: message.author.id,
    });

    await channel.send(`Added affiliate **${affiliate.buttonLabel}**.`);

    // Refresh the posted panel's select menu, if one exists.
    const panel = await AffiliatePanel.findById('panel');
    if (panel) {
        try {
            const panelChannel = await client.channels.fetch(panel.channelId);
            const panelMessage = await panelChannel.messages.fetch(panel.messageId);
            const container = await buildPanelContainer();
            await panelMessage.edit({
                flags: MessageFlags.IsComponentsV2,
                components: [container],
            });
        } catch (err) {
            client?.logs?.error('Failed to refresh affiliate panel:', err) ?? console.error(err);
            await channel.send("Couldn't find the posted panel to refresh — run `-affiliate` again to repost it.");
        }
    }
}

module.exports = {
    name: 'affiliate',

    async execute(message, args, client) {
        if (!isAffiliateManager(message.member)) {
            return message.reply("You don't have permission to use this command.");
        }

        if (args[0]?.toLowerCase() === 'add') {
            return runAddFlow(message, client);
        }

        return postPanel(message, client);
    },

    async handleComponent(interaction, client) {
        if (interaction.isButton() && interaction.customId === CUSTOM_IDS.REQUIREMENTS) {
            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(REQUIREMENTS_TEXT));

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