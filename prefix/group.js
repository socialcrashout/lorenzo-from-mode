const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
} = require('discord.js');

// ── Config ───────────────────────────────────────────────────
// .mode's Roblox community: https://www.roblox.com/communities/425292002/Mode#!/about
const GROUP_ID = '425292002';

// Small branding image shown at the bottom of the card (acts as a "footer").
const FOOTER_IMAGE = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw';

// Roblox's public Groups API does NOT expose a creation date, so if you want
// one shown, set it here manually. Leave as null to hide that line entirely.
const GROUP_CREATED = null; // e.g. new Date('2026-04-27T19:18:00Z')

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

module.exports = {
    name: 'group',
    aliases: ['groupinfo', 'roblox'],
    description: 'Shows live info about the .mode Roblox group',

    // Usage: -group          -> shows the .mode group
    //        -group <id>     -> shows any other Roblox group by ID

    async execute(message, args) {
        const errorReply = (text) => message.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(text)
                )
            ],
            flags: MessageFlags.IsComponentsV2,
        });

        const groupId = /^\d+$/.test(args[0] || '') ? args[0] : GROUP_ID;

        const loadingMsg = await message.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('Fetching group info from Roblox…')
                )
            ],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);

        let group, icon;

        try {
            const groupRes = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
            if (!groupRes.ok) throw new Error(`Roblox API returned ${groupRes.status}`);
            group = await groupRes.json();

            const iconRes = await fetch(
                `https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png&isCircular=false`
            );
            const iconData = await iconRes.json().catch(() => null);
            const iconEntry = iconData?.data?.[0];
            // Only use the icon if Roblox actually finished rendering it —
            // "Pending"/"Blocked" states return no real imageUrl and show as a blank box.
            icon = iconEntry?.state === 'Completed' ? iconEntry.imageUrl : null;
        } catch (err) {
            console.error('Failed to fetch Roblox group info:', err);
            if (loadingMsg) await loadingMsg.delete().catch(() => {});
            return errorReply('Could not fetch that group from Roblox. Double check the group ID and try again.');
        }

        const slug = (group.name || 'group').trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'group';
        const groupUrl = `https://www.roblox.com/communities/${groupId}/${slug}#!/about`;

        const owner = group.owner
            ? `${group.owner.displayName} (@${group.owner.username})`
            : '*No owner — group is unclaimed*';

        const memberCount = typeof group.memberCount === 'number'
            ? group.memberCount.toLocaleString()
            : 'Unknown';

        let infoText =
            `## ${group.name}\n` +
            `**Owned by:** ${owner}\n` +
            `**Members:** ${memberCount}\n`;

        if (GROUP_CREATED) {
            infoText += `**Created:** ${formatDate(GROUP_CREATED)}\n`;
        }

        if (group.description) {
            const desc = group.description.length > 200
                ? `${group.description.slice(0, 200)}…`
                : group.description;
            infoText += `**About:** ${desc}`;
        }

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));

        if (icon) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(icon));
        }

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('View on Roblox')
                .setStyle(ButtonStyle.Link)
                .setURL(groupUrl)
        );

        const footerGallery = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(FOOTER_IMAGE)
        );

        const container = new ContainerBuilder()
            .addSectionComponents(section)
            .addActionRowComponents(buttonRow)
            .addMediaGalleryComponents(footerGallery);

        const payload = {
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        };

        if (loadingMsg) {
            await loadingMsg.edit(payload).catch(() => message.channel.send(payload));
        } else {
            await message.channel.send(payload);
        }
    },
};