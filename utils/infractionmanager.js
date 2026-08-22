const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
} = require('discord.js');
const mongoose = require('mongoose');

// ── Infraction model (moved in from models/Infraction.js) ───────
const editLogSchema = new mongoose.Schema({
    field: { type: String, required: true },
    oldValue: { type: String, default: 'N/A' },
    newValue: { type: String, default: 'N/A' },
    editedById: { type: String, required: true },
    editedByTag: { type: String, required: true },
    editedAt: { type: Date, default: Date.now },
}, { _id: false });

const infractionSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    userTag: { type: String, required: true },

    infractionId: { type: String, required: true, unique: true },

    action: { type: String, required: true }, // Notice, Warning, Strike, Suspension, Termination
    reason: { type: String, required: true },
    appealable: { type: Boolean, default: true },

    issuedById: { type: String, required: true },
    issuedByTag: { type: String, required: true },

    status: {
        type: String,
        enum: ['Active', 'Voided'],
        default: 'Active',
    },

    voidReason: { type: String, default: null },
    voidedById: { type: String, default: null },
    voidedByTag: { type: String, default: null },
    voidedAt: { type: Date, default: null },

    editHistory: { type: [editLogSchema], default: [] },

    createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

const Infraction = mongoose.models.Infraction || mongoose.model('Infraction', infractionSchema);

// ── Hardcoded branding ──────────────────────────────────────────
const BANNER_URL = 'https://yumi.onl/f/6a8913c75e31802b96271546';
const FOOTER_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw';

// ── Hardcoded emojis (from the format you supplied) ─────────────
const BRAND_EMOJI = '<:mode_branding_20260510_032226_00:1506790198917206156>';
const DOT = '<:Dot:1502513706347528213>';

// ── Channels — change these to your actual channel IDs ──────────
const INFRACTION_LOG_CHANNEL_ID = 'u can change this if u want';
const INFRACTION_CHANNEL_ID = 'u can change this if u want too';

function generateInfractionId() {
    const num = Math.floor(1000000 + Math.random() * 9000000); // 7 digits
    return `INF-${num}`;
}

function fieldLine(label, value) {
    return `${DOT} **${label}:** ${value}`;
}

function banner() {
    return new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_URL)
    );
}

function footer() {
    return new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(FOOTER_URL)
    );
}

function divider() {
    return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

/**
 * Builds a Components V2 container (no accent color) for a single infraction
 * action: 'Issued' | 'Edited' | 'Voided'
 */
function buildInfractionContainer({ headerAction, fields }) {
    const container = new ContainerBuilder();

    container.addMediaGalleryComponents(banner());
    container.addSeparatorComponents(divider());

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${BRAND_EMOJI} Infraction — ${headerAction}`)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(fields.map(([l, v]) => fieldLine(l, v)).join('\n'))
    );

    container.addSeparatorComponents(divider());
    container.addMediaGalleryComponents(footer());

    return container;
}

/**
 * Builds a Components V2 container for a user's full infraction history.
 * Each infraction is its own field block, separated by a separator.
 */
function buildHistoryContainer({ user, infractions }) {
    const container = new ContainerBuilder();

    container.addMediaGalleryComponents(banner());
    container.addSeparatorComponents(divider());

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${BRAND_EMOJI} Infraction History — ${user.tag}`)
    );

    if (!infractions.length) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${DOT} No infractions found for this user.`)
        );
    } else {
        infractions.forEach((inf, idx) => {
            const lines = [
                fieldLine('Infraction ID', `\`${inf.infractionId}\``),
                fieldLine('Action Issued', inf.action),
                fieldLine('Reason', inf.reason),
                fieldLine('Issued by', `<@${inf.issuedById}>`),
                fieldLine('Date', `<t:${Math.floor(new Date(inf.createdAt).getTime() / 1000)}:F>`),
                fieldLine('Appealable', inf.appealable ? 'Yes' : 'No'),
                fieldLine('Status', inf.status === 'Voided' ? 'Voided' : 'Active'),
            ];

            if (inf.status === 'Voided') {
                lines.push(fieldLine('Void Reason', inf.voidReason || 'No reason provided.'));
            }

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(lines.join('\n'))
            );

            if (idx !== infractions.length - 1) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
            }
        });
    }

    container.addSeparatorComponents(divider());
    container.addMediaGalleryComponents(footer());

    return container;
}

/**
 * Builds a compact, no-banner audit-log entry: who ran the command,
 * who got punished, what action, and why. Used only in the log channel.
 */
function buildLogEntry({ eventType, issuerId, targetId, action, reason, infractionId }) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Infraction Log — ${eventType}`)
    );

    const lines = [
        fieldLine('Used by', `<@${issuerId}>`),
        fieldLine('Punished', `<@${targetId}>`),
        fieldLine('Action', action),
        fieldLine('Reason', reason),
        fieldLine('Infraction ID', `\`${infractionId}\``),
    ];

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(lines.join('\n'))
    );

    return container;
}

/**
 * Sends the full branded container to INFRACTION_CHANNEL_ID (the mirror
 * of what the user got DM'd / what shows in the reply), and a compact
 * audit-log entry to INFRACTION_LOG_CHANNEL_ID.
 */
async function logAction(client, { fullContainer, eventType, issuerId, targetId, action, reason, infractionId }) {
    try {
        const channel = await client.channels.fetch(INFRACTION_CHANNEL_ID).catch(() => null);
        if (channel) {
            await channel.send({
                components: [fullContainer],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    } catch (err) {
        console.error('Failed to post to infraction channel:', err);
    }

    try {
        const logChannel = await client.channels.fetch(INFRACTION_LOG_CHANNEL_ID).catch(() => null);
        if (logChannel) {
            const logContainer = buildLogEntry({ eventType, issuerId, targetId, action, reason, infractionId });
            await logChannel.send({
                components: [logContainer],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    } catch (err) {
        console.error('Failed to post to infraction log channel:', err);
    }
}

module.exports = {
    Infraction,
    generateInfractionId,
    buildInfractionContainer,
    buildHistoryContainer,
    buildLogEntry,
    logAction,
    BRAND_EMOJI,
    DOT,
    BANNER_URL,
    FOOTER_URL,
    INFRACTION_LOG_CHANNEL_ID,
    INFRACTION_CHANNEL_ID,
};