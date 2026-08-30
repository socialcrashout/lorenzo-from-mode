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
} = require('discord.js');

const Affiliate = require('../models/Affiliate');

// ---- hardcoded assets ----
const BANNER_URL = 'https://yumi.onl/api/files/6a947b1a04e48a789e64ed59/raw';
const FOOTER_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw';

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

async function buildPanelContainer() {
    const affiliates = await Affiliate.find().sort({ createdAt: 1 }).limit(25);

    const container = new ContainerBuilder(); // no accent color -> plain dark container

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(INTRO_TEXT));

    // Closest thing Discord has to a "white" button is Secondary (light gray) —
    // there's no true white ButtonStyle in the API.
    const requirementsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.REQUIREMENTS)
            .setLabel('Requirements & Benefits')
            .setStyle(ButtonStyle.Secondary)
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

function buildRequirementsContainer() {
    const container = new ContainerBuilder();

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(REQUIREMENTS_TEXT));

    return container;
}

module.exports = {
    BANNER_URL,
    FOOTER_URL,
    INTRO_TEXT,
    REQUIREMENTS_TEXT,
    CUSTOM_IDS,
    buildPanelContainer,
    buildRequirementsContainer,
};