module.exports = {
    /* ------------------------------------------------------------
     *  SERVER / CHANNEL IDS  (right-click -> Copy ID, dev mode on)
     * ------------------------------------------------------------ */
    ids: {
        // Fallback parent category (folder) used only if a category below
        // doesn't set its own categoryId
        ticketsCategoryId: "PUT_DEFAULT_TICKETS_CATEGORY_ID_HERE",

        // Where finished transcripts get logged/posted
        transcriptLogChannelId: "1502789305721032704",

        // Roles that can see/claim/close tickets in general
        supportRoleId: "1504316405942718644",

        // Role pinged when a ticket is escalated
        managementRoleId: "1504313264576925757",
    },

    /* ------------------------------------------------------------
     *  PANEL (the message -panel sends)
     * ------------------------------------------------------------ */
    panel: {
        // Big image at the top of the panel
        bannerUrl: "https://yumi.onl/api/files/6a6aac82de0a418aa0f4e194/raw",

        // Small image used as the "footer" strip at the bottom
        footerUrl: "https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw",

        // Main body text. Discord markdown + custom emoji work fine here.
        // Edit this freely - it's just a template string.
        text:
`**<:userquestion:1502514545791471628> .Mode Assistance Center**
Welcome to .mode support! We're here to help with anything you need inside the server. Please select the correct category below so we can assist you as quickly and efficiently as possible:

**<:Globe:1502513708398547035> General Support**
<:Dot:1502513706347528213>Questions & Inquiries
<:Dot:1502513706347528213>Giveaway Rewards
<:Dot:1502513706347528213>Customer Support

**<:userquestion:1502514545791471628> Management Support**
<:Dot:1502513706347528213>Report a Staff Member
<:Dot:1502513706347528213>Report a User
<:Dot:1502513706347528213>Partnership Requests

**<:person:1502514200705105981> Executive Support**
<:Dot:1502513706347528213>Refund Requests
<:Dot:1502513706347528213>Important Issues
<:Dot:1502513706347528213>Appeals & Moderation Cases

**<:Save:1502514208019972217> Reminder**
Before opening a ticket, please check <#1502518130616963163> and the FAQ section to make sure your issue hasn't already been answered.`,

        // Text shown next to the select menu before anything is picked
        selectPlaceholder: "Select a category to open a ticket",
    },
    categories: [
        {
            id: "general",
            label: "General Support",
            description: "Questions, giveaway rewards, customer support",
            emoji: "<:Globe:1502513708398547035>",
            channelPrefix: "general",
            pingRoleId: "", // falls back to ids.supportRoleId
            categoryId: "1518326644400455721",
        },
        {
            id: "management",
            label: "Management Support",
            description: "Report a staff member/user, partnership requests",
            emoji: "<:userquestion:1502514545791471628>",
            channelPrefix: "mgmt",
            pingRoleId: "1504313264576925757", // falls back to ids.supportRoleId
            categoryId: "1518326666215161986",
        },
        {
            id: "executive",
            label: "Executive Support",
            description: "Refunds, important issues, appeals & moderation cases",
            emoji: "<:person:1502514200705105981>",
            channelPrefix: "exec",
            pingRoleId: "1504311819458580531", // e.g. put a dedicated exec role id here
            categoryId: "1518336512347869315",
        },
    ],

    /* ------------------------------------------------------------
     *  TICKET CHANNEL MESSAGE (sent inside the new ticket channel)
     *  Placeholders: {user} {category} {guidelines}
     * ------------------------------------------------------------ */
    ticket: {
        bannerUrl: "https://yumi.onl/api/files/6a6aac82de0a418aa0f4e194/raw",

        text:
`**<:userquestion:1502514545791471628> ASSISTANCE**

Hey there, {user}! Thanks for contacting us. We're happy to help with whatever you need, but we do ask that you follow a few guidelines:

• Do not mention anyone to ask them to answer your ticket, somebody will help you as soon as possible.
• Be respectful. Our team is happy to help, but if you are blatantly disrespectful, your ticket will be closed.

**Inquiry**: "{category}"`,

        // Message content sent alongside the ticket embed (pings)
        pingText: "{user} {role}",
    },

    /* ------------------------------------------------------------
     *  ESCALATE MESSAGE
     * ------------------------------------------------------------ */
    escalate: {
        text:
`**Ticket Escalated!**

Hey there, {user}! Your ticket has been escalated to a higher-level staff member for further assistance. A member of the appropriate team will review your request and respond as soon as possible. Please remain patient while we look into your concern. Providing any additional details or information that may help resolve your issue is appreciated.

Escalated by {staff}.`,
        pingText: "{user} {role}",
    },

    /* ------------------------------------------------------------
     *  BEHAVIOUR
     * ------------------------------------------------------------ */
    behavior: {
        // "delete" removes the channel after closing (transcript still saved)
        // "archive" moves it to archiveCategoryId and locks it instead
        onClose: "delete",
        archiveCategoryId: "PUT_ARCHIVE_CATEGORY_ID_HERE",

        // seconds to wait after "Close" is confirmed before deleting the channel
        closeDelaySeconds: 5,
    },
};
