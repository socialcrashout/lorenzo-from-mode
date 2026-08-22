const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
} = require('discord.js');
const noblox = require('noblox.js');

/**
 * Add this to your .env:
 * FUNDS_ALLOWED_ROLES=123456789012345678,987654321098765432
 * (comma-separated role IDs allowed to use -funds)
 */
const ALLOWED_ROLE_IDS = (process.env.FUNDS_ALLOWED_ROLES || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

function hasPermission(member) {
    if (!member || ALLOWED_ROLE_IDS.length === 0) return false;
    return member.roles.cache.some((role) => ALLOWED_ROLE_IDS.includes(role.id));
}

function buildNoPermissionContainer() {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## 🔒 Access Denied')
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("You don't have permission to use this command.")
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# Contact an administrator if you think this is a mistake.')
        );
}

function buildFundsContainer({ groupId, groupName, groupFunds, pending, iconURL }) {
    const total = groupFunds + pending;
    const container = new ContainerBuilder();

    const headerText = new TextDisplayBuilder().setContent(
        `## ${groupName ? `${groupName} — Group Funds` : `Group Funds — ID ${groupId}`}`
    );

    if (iconURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(headerText)
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL))
        );
    } else {
        container.addTextDisplayComponents(headerText);
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

   container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `1. <:money:1502514540687003668> **Available:** R$${groupFunds.toLocaleString()}\n` +
            `2. <:clock:1533146124389585078> **Pending:** R$${pending.toLocaleString()}\n` +
            `3. <:paper:1508660910313705645> **Total:** R$${total.toLocaleString()}`
        )
    );
    
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Roblox Group Funds')
    );

    return container;
}

async function fetchFundsData(groupId) {
    await noblox.setCookie(process.env.ROBLOX_COOKIE);

    const [groupFunds, groupInfo] = await Promise.all([
        noblox.getGroupFunds(groupId),
        noblox.getGroup(groupId).catch(() => null),
    ]);

    let pending = 0;
    try {
        const revenueSummary = await noblox.getGroupRevenueSummary(groupId, 'Month');
        pending = revenueSummary.pendingRobux ?? revenueSummary.pending ?? 0;
    } catch (e) {
        // Pending revenue endpoint can fail independently of group funds — don't block the whole command.
    }

    return {
        groupId,
        groupName: groupInfo?.name,
        iconURL: groupInfo?.iconUrl || undefined,
        groupFunds,
        pending,
    };
}

function errorMessage(err) {
    if (err.message?.includes('Insufficient permissions')) {
        return '❌ The Roblox account used does not have permission to view group funds.';
    }
    if (err.message?.includes('Cookie')) {
        return '❌ Invalid Roblox cookie. Make sure `ROBLOX_COOKIE` is set correctly in your `.env` file.';
    }
    return '❌ Failed to fetch group funds. Check the console for more info.';
}

module.exports = {
    hasPermission,
    buildNoPermissionContainer,
    buildFundsContainer,
    fetchFundsData,
    errorMessage,
};

