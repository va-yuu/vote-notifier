const { Client, GatewayIntentBits, Events, ComponentType } = require('discord.js');
const config = require('../config.json');
const db = require('./database/db');
const VoteManager = require('./utils/voteManager');
const dashboardCommand = require('./commands/dashboard');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
    ]
});

const voteManager = new VoteManager(client);
voteManager.setDashboardCommand(dashboardCommand);

client.once(Events.ClientReady, () => {
    console.log(`✓ Connecté en tant que ${client.user.tag}`);
    console.log(`✓ ${client.guilds.cache.size} serveur(s)`);
    voteManager.start();
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand() && interaction.commandName === 'dashboard') {
            return dashboardCommand.execute(interaction, voteManager);
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;

            const publicOnlyButtons = [
                'edit_username', 'notification_settings', 'edit_votes_menu',
                'back_to_dashboard', 'refresh_dashboard', 'post_public_dashboard',
                'delete_data', 'confirm_delete_data'
            ];
            const isConfirmVote = customId.startsWith('confirm_vote_');

        if (publicOnlyButtons.includes(customId) || isConfirmVote) {
                const dashboard = db.dashboards.getByMessage(interaction.message.id);
                if (dashboard && dashboard.user_id !== interaction.user.id) {
                return interaction.reply({
                        components: [{
                            type: ComponentType.Container,
                            accent_color: null,
                            components: [{
                                type: ComponentType.TextDisplay,
                                content: `## <:cross:1483219940499652779> Accès refusé\n\nCe dashboard ne t'appartient pas.`
                            }]
                        }],
                        flags: 32768 | 64
                    });
                }
            }

            if (customId === 'setup_username') {
                return interaction.showModal(dashboardCommand.createUsernameModal(false));
            }

            if (customId === 'edit_username') {
                return interaction.showModal(dashboardCommand.createUsernameModal(true));
            }
            if (customId === 'notification_settings') {
                return dashboardCommand.showNotificationSettings(interaction, voteManager);
            }
            if (customId === 'edit_votes_menu') {
                return dashboardCommand.showEditVotesMenu(interaction);
            }
            if (customId === 'back_to_dashboard') {
                return dashboardCommand.showMainDashboard(interaction, voteManager, true);
            }
            if (customId === 'refresh_dashboard') {
                await voteManager.updatePublicDashboards(interaction.user.id);
                return dashboardCommand.showMainDashboard(interaction, voteManager, true);
            }
            if (customId === 'open_dashboard') {
                return dashboardCommand.showMainDashboard(interaction, voteManager, false);
            }
            if (customId === 'post_public_dashboard') {
                return dashboardCommand.postPublicDashboard(interaction, voteManager);
            }
            if (customId === 'dismiss_message') {
                return interaction.update({
                    components: [{
                        type: ComponentType.Container,
                        accent_color: null,
                        components: [{
                            type: ComponentType.TextDisplay,
                            content: `*Message fermé*`
                        }]
                    }],
                    flags: 32768 | 64
                });
            }

            if (customId === 'delete_data') {
                return dashboardCommand.showDeleteConfirmation(interaction);
            }
            if (customId === 'confirm_delete_data') {
                db.users.delete(interaction.user.id);
                return dashboardCommand.showSetupPanel(interaction, true);
            }
            if (customId.startsWith('confirm_vote_')) {
                const siteId = customId.replace('confirm_vote_', '');
                return dashboardCommand.showVoteConfirmed(interaction, siteId, voteManager);
            }
        }
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_notification_type') {
                const type = interaction.values[0];

                if (type === 'dm') {
                    db.users.updateNotification(interaction.user.id, 'dm', null);
                    return dashboardCommand.showMainDashboard(interaction, voteManager, true);
                } else if (type === 'channel') {
                    return dashboardCommand.showChannelSelect(interaction);
                }
            }

            if (interaction.customId === 'select_vote_to_edit') {
                const value = interaction.values[0];

                if (value === 'reset_all') {
                    voteManager.resetAllVotes(interaction.user.id);
                    await voteManager.updatePublicDashboards(interaction.user.id);
                    return dashboardCommand.showMainDashboard(interaction, voteManager, true);
                }

                return interaction.showModal(dashboardCommand.createEditVoteModal(value));
            }
        }

        if (interaction.isChannelSelectMenu()) {
            if (interaction.customId === 'select_notification_channel') {
                const channelId = interaction.values[0];
                db.users.updateNotification(interaction.user.id, 'channel', channelId);
                return dashboardCommand.showMainDashboard(interaction, voteManager, true);
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_setup_username') {
                const username = interaction.fields.getTextInputValue('minecraft_username');
                db.users.create(interaction.user.id, username, 'dm', null);
                return dashboardCommand.showMainDashboard(interaction, voteManager, false);
            }

            if (interaction.customId === 'modal_edit_username') {
                const username = interaction.fields.getTextInputValue('minecraft_username');
                db.users.create(interaction.user.id, username);
                await voteManager.updatePublicDashboards(interaction.user.id);
                return dashboardCommand.showMainDashboard(interaction, voteManager, true);
            }

            if (interaction.customId.startsWith('modal_edit_vote_')) {
                const siteId = interaction.customId.replace('modal_edit_vote_', '');
                const dateStr = interaction.fields.getTextInputValue('vote_date');
                const timeStr = interaction.fields.getTextInputValue('vote_time');

                const votedAt = dashboardCommand.parseVoteDateTime(dateStr, timeStr);

                if (!votedAt) {
                    return interaction.reply({
                        content: 'Format de date/heure invalide. Utilise JJ/MM/AAAA pour la date et HH:MM pour l\'heure.',
                        ephemeral: true
                    });
                }

                voteManager.setVoteTime(interaction.user.id, siteId, votedAt);
                await voteManager.updatePublicDashboards(interaction.user.id);

                const site = config.voteSites.find(s => s.id === siteId);
                const nextVote = votedAt + site.cooldown;

                return interaction.reply({
                    components: [{
                        type: ComponentType.Container,
                        accent_color: null,
                        components: [
                            {
                                type: ComponentType.TextDisplay,
                                content: `## Vote modifié !\n\n**Site:** ${site.name}\n**Voté le:** <t:${Math.floor(votedAt / 1000)}:f>\n**Prochain vote:** <t:${Math.floor(nextVote / 1000)}:R>`
                            },
                            {
                                type: ComponentType.Separator,
                                spacing: 1
                            },
                            {
                                type: ComponentType.ActionRow,
                                components: [{
                                    type: ComponentType.Button,
                                    style: 2,
                                    label: 'Retour au Dashboard',
                                    custom_id: 'back_to_dashboard'
                                }]
                            }
                        ]
                    }],
                    flags: 32768 | 64
                });
            }
        }

    } catch (error) {
        console.error('[Error]', error);

        const errorResponse = {
            content: 'Une erreur est survenue. Réessaie dans quelques instants.',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorResponse);
        } else {
            await interaction.reply(errorResponse);
        }
    }
});

process.on('SIGINT', () => {
    console.log('\n[Bot] Arrêt en cours...');
    voteManager.stop();
    db.db.close();
    client.destroy();
    process.exit(0);
});

client.login(config.token);
